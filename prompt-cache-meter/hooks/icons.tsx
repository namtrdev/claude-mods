// Icons from Lucide (https://lucide.dev, ISC license), lucide-static 0.469.0.
// Svg draws on the desktop, editor and mobile surfaces; the terminal has none, so a glyph stands in.
const PATHS = {
  'gauge': '<path d="m12 14 4-4" /> <path d="M3.34 19a10 10 0 1 1 17.32 0" />',
  'circle': '<circle cx="12" cy="12" r="10" />',
  'circle-dot': '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="1" />',
  'timer': '<line x1="10" x2="14" y1="2" y2="2" /> <line x1="12" x2="15" y1="14" y2="11" /> <circle cx="12" cy="14" r="8" />',
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
