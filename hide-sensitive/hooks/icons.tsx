// Icons from Lucide (https://lucide.dev, ISC license), lucide-static 0.469.0.
// Svg draws on the desktop, editor and mobile surfaces; the terminal has none, so a glyph stands in.
const PATHS = {
  'copy': '<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /> <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
  'eye-off': '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /> <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /> <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /> <path d="m2 2 20 20" />',
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
