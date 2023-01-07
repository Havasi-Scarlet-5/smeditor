export const SIMFILE_PROPERTIES = [
  "TITLE",
  "SUBTITLE",
  "ARTIST",
  "TITLETRANSLIT",
  "SUBTITLETRANSLIT",
  "ARTISTTRANSLIT",
  "GENRE",
  "CREDIT",
  "ORIGIN",
  "BACKGROUND",
  "BANNER",
  "MUSIC",
  "JACKET",
  "PREVIEW",
  "LYRICSPATH",
  "SAMPLESTART",
  "SAMPLELENGTH",
  "SELECTABLE",
] as const

export type SimfileProperty = typeof SIMFILE_PROPERTIES[number]
