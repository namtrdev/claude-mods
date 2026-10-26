// Icons from Lucide (https://lucide.dev, ISC license), lucide-static 0.469.0.
// Svg draws on the desktop, editor and mobile surfaces; the terminal has none, so a glyph stands in.
const PATHS = {
  'skip-back': '<polygon points="19 20 9 12 19 4 19 20" /> <line x1="5" x2="5" y1="19" y2="5" />',
  'play': '<polygon points="6 3 20 12 6 21 6 3" />',
  'pause': '<rect x="14" y="4" width="4" height="16" rx="1" /> <rect x="6" y="4" width="4" height="16" rx="1" />',
  'skip-forward': '<polygon points="5 4 15 12 5 20 5 4" /> <line x1="19" x2="19" y1="5" y2="19" />',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />',
  'trash-2': '<path d="M3 6h18" /> <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /> <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /> <line x1="10" x2="10" y1="11" y2="17" /> <line x1="14" x2="14" y1="11" y2="17" />',
  'check': '<path d="M20 6 9 17l-5-5" />',
  'x': '<path d="M18 6 6 18" /> <path d="m6 6 12 12" />',
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
