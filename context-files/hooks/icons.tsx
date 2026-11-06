// Icons from Lucide (https://lucide.dev, ISC license), lucide-static 0.469.0.
// Svg draws on the desktop, editor and mobile surfaces; the terminal has none, so a glyph stands in.
const PATHS = {
  'chevron-right': '<path d="m9 18 6-6-6-6" />',
  'chevron-down': '<path d="m6 9 6 6 6-6" />',
  'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
  'corner-down-right': '<polyline points="15 10 20 15 15 20" /> <path d="M4 4v7a4 4 0 0 0 4 4h12" />',
}

export type IconName = keyof typeof PATHS

export const svg = (name: IconName, color: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ui = { Svg?: any; Text: any }

export const icon = (ui: Ui, name: IconName, color: string, glyph: string, size = 16) => {
  const { Svg, Text } = ui
  return Svg === undefined ? (
    <Text color={color}>{glyph}</Text>
  ) : (
    <Svg source={svg(name, color, size)} alt={name} width={size} height={size} />
  )
}
