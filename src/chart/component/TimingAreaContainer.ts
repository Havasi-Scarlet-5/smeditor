import { Container, Sprite, Texture } from "pixi.js"
import { DisplayObjectPool } from "../../util/DisplayObjectPool"
import { EventHandler } from "../../util/EventHandler"
import { Options } from "../../util/Options"
import { EditMode } from "../ChartManager"
import { ChartRenderer, ChartRendererComponent } from "../ChartRenderer"
import {
  DelayTimingEvent,
  FakeTimingEvent,
  StopTimingEvent,
  WarpTimingEvent,
} from "../sm/TimingTypes"

export const TIMING_EVENT_COLORS: {
  [key: string]: number
} = {
  BPMS: 9182254,
  STOPS: 4934913,
  DELAYS: 217453,
  WARPS: 9243998,
  FAKES: 4868682,
  COMBOS: 939078,
  SPEEDS: 2968693,
  LABELS: 7747359,
  SCROLLS: 0x36468e,
  TIMESIGNATURES: 5392684,
  TICKCOUNTS: 1594906,
  BGCHANGES: 8460415,
  FGCHANGES: 8857115,
  ATTACKS: 1856083,
}

export class TimingAreaContainer
  extends Container
  implements ChartRendererComponent
{
  private renderer: ChartRenderer
  private areaPool = new DisplayObjectPool({
    create: () => {
      const newChild = new Sprite(Texture.WHITE)
      Object.assign(newChild, {
        alpha: 0.2,
        width: this.renderer.chart.gameType.notefieldWidth + 128,
      })
      newChild.anchor.set(0.5, 0)
      return newChild
    },
  })
  private timingAreaMap: Map<
    StopTimingEvent | WarpTimingEvent | DelayTimingEvent | FakeTimingEvent,
    Sprite
  > = new Map()

  private timingDirty = false

  constructor(renderer: ChartRenderer) {
    super()
    this.renderer = renderer
    this.addChild(this.areaPool)

    const timingEventListener = () => (this.timingDirty = true)

    EventHandler.on("timingModified", timingEventListener)
    this.on("destroyed", () =>
      EventHandler.off("timingModified", timingEventListener)
    )
  }

  update(fromBeat: number, toBeat: number) {
    if (this.timingDirty) {
      this.timingAreaMap.clear()
      this.areaPool.destroyAll()
      this.timingDirty = false
    }

    this.visible =
      this.renderer.chartManager.getMode() != EditMode.Play ||
      !Options.play.hideBarlines

    for (const event of this.renderer.chart.timingData.getTimingData(
      "STOPS",
      "WARPS",
      "DELAYS",
      "FAKES"
    )) {
      //Check beat requirements
      if (event.beat > toBeat) break
      if (!this.shouldDrawEvent(event, fromBeat, toBeat)) continue

      if (!this.timingAreaMap.has(event)) {
        const area = this.areaPool.createChild()
        if (!area) break
        area.tint = TIMING_EVENT_COLORS[event.type]
        this.timingAreaMap.set(event, area)
      }
    }

    for (const [event, area] of this.timingAreaMap.entries()) {
      if (!this.shouldDrawEvent(event, fromBeat, toBeat)) {
        this.timingAreaMap.delete(event)
        this.areaPool.destroyChild(area)
        continue
      }
      const yStart = Options.chart.CMod
        ? this.renderer.getYPosFromSecond(event.second!)
        : this.renderer.getYPosFromBeat(event.beat)
      let yEnd = yStart
      switch (event.type) {
        case "STOPS":
        case "DELAYS": {
          if (Options.chart.CMod && event.value > 0) {
            yEnd = this.renderer.getYPosFromSecond(event.second! + event.value)
          } else if (event.value < 0) {
            yEnd = this.renderer.getYPosFromBeat(
              this.renderer.chart.getBeatFromSeconds(event.second! + 0.0001)
            )
          }
          break
        }
        case "FAKES": {
          yEnd = this.renderer.getYPosFromBeat(event.beat + event.value)

          break
        }
        case "WARPS": {
          if (!Options.chart.CMod) {
            yEnd = this.renderer.getYPosFromBeat(event.beat + event.value)
          }
          break
        }
      }
      const length = yEnd - yStart
      area.y = yStart
      area.height = length
    }
  }

  private shouldDrawEvent(
    event:
      | StopTimingEvent
      | WarpTimingEvent
      | DelayTimingEvent
      | FakeTimingEvent,
    fromBeat: number,
    toBeat: number
  ) {
    if (
      (event.type == "STOPS" || event.type == "DELAYS") &&
      event.second! + Math.abs(event.value) <=
        this.renderer.chart.timingData.getSecondsFromBeat(fromBeat)
    )
      return false
    if (
      (event.type == "WARPS" || event.type == "FAKES") &&
      event.beat + event.value < fromBeat
    )
      return false
    if (event.type == "STOPS" || event.type == "DELAYS") {
      if (
        !(
          (!Options.chart.CMod && event.value < 0) ||
          (Options.chart.CMod && event.value > 0)
        )
      )
        return false
    }
    if (event.type == "WARPS" && Options.chart.CMod) return false
    if (event.beat > toBeat) return false
    return true
  }
}
