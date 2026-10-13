const BANNED: { test: RegExp; problem: string }[] = [
  { test: /<script/i, problem: 'SVG has a script' },
  { test: /<style/i, problem: 'SVG has a style block' },
  { test: /<foreignObject/i, problem: 'SVG has a foreignObject' },
  { test: /<image/i, problem: 'SVG has an image' },
  { test: /<a[\s>]/i, problem: 'SVG has a link' },
  { test: /\son\w+\s*=/i, problem: 'SVG has an event handler' },
  { test: /javascript:/i, problem: 'SVG has a javascript: URL' },
  { test: /href\s*=\s*["'](?!#)/i, problem: 'SVG links outside itself' },
  { test: /url\(\s*["']?(?!#)/i, problem: 'SVG loads something outside itself' }
]

export const isSvgIcon = (icon: string): boolean => /^\s*<svg[\s>]/i.test(icon)

export const extractSvg =(text: string): string | undefined => text.match(/<svg[\s\S]*<\/svg>/i)?.[0]

export const svgProblems = (svg: string): string[] => {
  const trimmed = svg.trim()
  const out: string[] = []
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>$/i.test(trimmed)) out.push('SVG must be one <svg> element')
  if (!/viewBox\s*=\s*["']0 0 64 64["']/.test(trimmed)) out.push('SVG must use viewBox="0 0 64 64"')
  for (const b of BANNED) if (b.test.test(trimmed)) out.push(b.problem)
  return out
}

export const iconIdFromName = (name: string): string =>
  name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('-')

export const parseTags = (text: string): string[] =>
  [...new Set(text.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))]

export const iconProblems = (list: unknown): string[] => {
  if (!Array.isArray(list)) return ['Icons must be a list']
  const out: string[] = []
  const seen = new Set<string>()
  list.forEach((icon: unknown, i) => {
    if (!icon || typeof icon !== 'object') {
      out.push(`Icon ${i + 1} is not an icon`)
      return
    }
    const s = icon as Record<string, unknown>
    const where = typeof s.id === 'string' && s.id ? s.id : `Icon ${i + 1}`
    if (typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) out.push(`${where}: id must be lowercase letters, digits and dashes`)
    else if (seen.has(s.id)) out.push(`${where}: id is used twice`)
    else seen.add(s.id)
    if (typeof s.name !== 'string' || !s.name.trim()) out.push(`${where}: no name`)
    if (!Array.isArray(s.tags) || s.tags.some(t => typeof t !== 'string' || !t)) out.push(`${where}: tags must be a list of words`)
    if (typeof s.svg !== 'string') out.push(`${where}: no SVG`)
    else out.push(...svgProblems(s.svg).map(p => `${where}: ${p}`))
  })
  return out
}
