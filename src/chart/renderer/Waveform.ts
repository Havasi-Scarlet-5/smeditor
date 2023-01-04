import { Container, RenderTexture, Sprite, Texture } from "pixi.js"
import { bsearch } from "../../util/Util"
import { ChartRenderer } from "../ChartRenderer"
import { ChartAudio } from "../audio/ChartAudio"
import { EditMode } from "../ChartManager"
import { Options } from "../../util/Options"

const MAX_ZOOM = 3500
const LINE_HEIGHT = 1.5

interface WaveformLine extends Sprite {
  lastUsed: number
}

export class Waveform extends Container {

  lineContainer: Container = new Container()
  waveformTex: RenderTexture
  waveformSprite: Sprite

  chartAudio: ChartAudio
  renderer: ChartRenderer

  strippedWaveform: number[][] | undefined

  private lastReZoom: number
  private lastZoom: number
  private zoom: number
  private poolSearch = 0

  constructor(renderer: ChartRenderer) {
    super()
    this.renderer = renderer
    this.waveformTex = RenderTexture.create({resolution: 1})
    this.chartAudio = this.renderer.chartManager.songAudio
    this.waveformSprite = new Sprite(this.waveformTex)
    this.waveformSprite.anchor.set(0.5)
    this.addChild(this.waveformSprite)
    this.lastZoom = this.getZoom()
    this.zoom = this.getZoom()
    this.lastReZoom = Date.now()
    this.chartAudio.addWaveform(this)
    this.refilter()
  }

  private async stripWaveform(rawData: Float32Array[] | undefined) {
    if (rawData == undefined) return
    this.strippedWaveform = Array.from({ length: rawData.length }, _ => []);
    let blockSize = this.chartAudio.getSampleRate() / (this.zoom*4); // Number of samples in each subdivision
    for (let channel = 0; channel < rawData.length; channel++) {
      let samples = Math.floor(rawData[channel].length / blockSize);
      for (let i = 0; i < samples; i++) {
        let blockStart = Math.floor(blockSize * i); // the location of the first sample in the block
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum = sum + Math.abs(rawData[channel][blockStart + j]) // find the sum of all the samples in the block
        }
        this.strippedWaveform[channel].push(sum / blockSize); // divide the sum by the block size to get the average
      }
    }
  }

  refilter() {
    this.stripWaveform(this.chartAudio.getRawData())
  }

  renderThis(beat: number) {
    this.visible = Options.waveform.enabled && (this.renderer.chartManager.getMode() != EditMode.Play || !Options.play.hideBarlines)

    if (!Options.waveform.enabled) return
    if (this.chartAudio != this.renderer.chartManager.getAudio()) {
      this.chartAudio = this.renderer.chartManager.getAudio()
      this.refilter()
      this.chartAudio.addWaveform(this)
    }
    if (this.lastZoom != this.getZoom()) {
      this.lastReZoom = Date.now()
      this.lastZoom = this.getZoom()
    }else{
      if (Date.now() - this.lastReZoom > 120 && this.zoom != this.getZoom()){
        this.zoom = this.getZoom()
        this.refilter()
      }
    }
    if (this.strippedWaveform) {
      this.renderData(beat, this.strippedWaveform, Options.waveform.color, Options.waveform.opacity)
    }
    this.lineContainer.children.filter(line => Date.now() - (line as WaveformLine).lastUsed > 5000).forEach(line => {
      line.destroy()
      this.lineContainer.removeChild(line)
    })
    this.waveformTex.resize(this.strippedWaveform!.length * 288 ?? 288, this.renderer.chartManager.app.renderer.screen.height)
    this.renderer.chartManager.app.renderer.render(this.lineContainer, {renderTexture: this.waveformTex})
  }

  private renderData(beat: number, data: number[][], color: number, opacity: number) {
    this.resetPool()

    if (Options.experimental.speedChangeWaveform && !Options.chart.CMod && Options.chart.doSpeedChanges) {
      let chartSpeed = Options.chart.speed
      let speedMult = this.renderer.chart.timingData.getSpeedMult(beat, this.renderer.chartManager.getTime())
      let curBeat = beat - Options.chart.maxDrawBeatsBack
      let beatLimit = beat + Options.chart.maxDrawBeats
      let scrolls = this.renderer.chart.timingData.getTimingData("SCROLLS")
      let scrollIndex = bsearch(scrolls, curBeat, a => a.beat)
      while (curBeat < beatLimit) {
        let scroll = scrolls[scrollIndex] ?? {beat: 0,value: 1}
        let scrollBeatLimit = scrolls[scrollIndex + 1]?.beat ?? beatLimit
        let y_test = this.renderer.getYPos(curBeat) + this.parent.y 
        if (scrolls[scrollIndex + 1] && ((scroll.value < 0 && y_test > this.renderer.chartManager.app.renderer.screen.height) ||
            scroll.value <= 0)) {
          scrollIndex++
          curBeat = scrolls[scrollIndex]!.beat
          continue
        }
        while (curBeat < scrollBeatLimit) {
          let y = Math.round(this.renderer.getYPos(curBeat) + this.parent.y)
          if (y < 0) {
            if (scroll.value < 0) {
              curBeat = scrollBeatLimit
              break
            }
            curBeat += 100/chartSpeed/speedMult/64/Math.abs(scroll.value) * -y
            continue
          }
          if (y > this.renderer.chartManager.app.renderer.screen.height) {
            if (scroll.value > 0) {
              curBeat = scrollBeatLimit
              break
            }
            curBeat += 100/chartSpeed/speedMult/64/Math.abs(scroll.value) * (y-this.renderer.chartManager.app.renderer.screen.height)
            continue
          }
          curBeat += 100/chartSpeed/speedMult/64/Math.abs(scroll.value) * LINE_HEIGHT
          let calcTime = this.renderer.chart.getSeconds(curBeat)
          if (calcTime < 0) continue
          let samp = Math.floor(calcTime * this.zoom*4)
          for (let channel = 0; channel < data.length; channel++) {
            let v = data[channel][samp];
            if (!v) continue
            let line = this.getLine()
            line.width = v*256
            line.y = y
            line.tint = color
            line.alpha = opacity
            line.x = 144 + 288 * channel
          }
          
        }
        scrollIndex++
        curBeat = scrollBeatLimit
      }
    }else{
      for (let i = 0; i < this.renderer.chartManager.app.renderer.screen.height; i+=LINE_HEIGHT) {
        let calcTime = this.renderer.getTimeFromYPos(i-this.parent.y)
        let samp = Math.floor(calcTime * this.zoom*4)
        for (let channel = 0; channel < data.length; channel ++) {
          let v = data[channel][samp];
          if (!v) continue
          let line = this.getLine()
          line.width = v*256
          line.y = i
          line.tint = color
          line.alpha = opacity
          line.x = 144 + 288 * channel
        }
      }
    }

    this.purgePool()
  }

  private resetPool() {
    this.poolSearch = 0
  }

  private purgePool() {
    for(let i = this.poolSearch; i < this.lineContainer.children.length; i++) {
      this.lineContainer.children[i].visible = false
    }
  }

  private getLine(): WaveformLine {
    while (this.lineContainer.children[this.poolSearch]) {
      let w_line = this.lineContainer.children[this.poolSearch] as WaveformLine
      w_line.lastUsed = Date.now()
      w_line.visible = true
      this.poolSearch++
      return w_line
    }
    let line = new Sprite(Texture.WHITE) as WaveformLine
    line.height = LINE_HEIGHT
    line.anchor.set(0.5)
    line.lastUsed = Date.now()
    line.visible = true
    this.poolSearch++
    this.lineContainer.addChild(line)
    return line
  }

  private getZoom(): number {
    return Math.min(Options.chart.speed, MAX_ZOOM)
  }
}
