import { readFile, writeFile } from 'node:fs/promises'

export default defineEventHandler(async (event) => {
  devOnly()
  const id = getRouterParam(event, 'id')
  const list: unknown = JSON.parse(await readFile(DRAFTS_FILE, 'utf8').catch(() => '[]'))
  if (!Array.isArray(list)) throw createError({ statusCode: 500, statusMessage: 'icon-drafts.json is not a list' })
  const kept = list.filter((d: unknown) => !(d && typeof d === 'object' && (d as { id?: unknown }).id === id))
  await writeFile(DRAFTS_FILE, `${JSON.stringify(kept, null, 2)}\n`)
  return { removed: list.length - kept.length }
})
