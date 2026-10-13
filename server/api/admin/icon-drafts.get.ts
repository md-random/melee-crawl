import { readFile } from 'node:fs/promises'
import type { IconDraft } from '#shared/types'
import { svgProblems } from '#shared/engine/icons'

export default defineEventHandler(async (): Promise<IconDraft[]> => {
  devOnly()
  const text = await readFile(DRAFTS_FILE, 'utf8').catch(() => '[]')
  let list: unknown
  try {
    list = JSON.parse(text)
  } catch {
    throw createError({ statusCode: 500, statusMessage: 'icon-drafts.json is not valid JSON' })
  }
  if (!Array.isArray(list)) return []
  return list.flatMap((d: unknown, i): IconDraft[] => {
    if (!d || typeof d !== 'object') return []
    const r = d as Record<string, unknown>
    const svg = typeof r.svg === 'string' ? r.svg : ''
    return [{
      id: typeof r.id === 'string' && r.id ? r.id : `draft-${i + 1}`,
      prompt: typeof r.prompt === 'string' ? r.prompt : '',
      svg,
      problems: svg ? svgProblems(svg) : ['No SVG']
    }]
  })
})
