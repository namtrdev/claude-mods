// Icons from Lucide (https://lucide.dev, ISC license), lucide-static 0.469.0.
// Svg draws on the desktop, editor and mobile surfaces; the terminal has none, so a glyph stands in.
const PATHS = {
  'circle': '<circle cx="12" cy="12" r="10" />',
  'circle-dot': '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="1" />',
  'zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />',
  'list': '<path d="M3 12h.01" /> <path d="M3 18h.01" /> <path d="M3 6h.01" /> <path d="M8 12h13" /> <path d="M8 18h13" /> <path d="M8 6h13" />',
  'circle-help': '<circle cx="12" cy="12" r="10" /> <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /> <path d="M12 17h.01" />',
  'shield-alert': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="M12 8v4" /> <path d="M12 16h.01" />',
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
