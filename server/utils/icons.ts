import { resolve } from 'node:path'

export const ICONS_FILE = resolve(process.cwd(), 'shared/data/icons.json')

export const DRAFTS_FILE = resolve(process.cwd(), 'icon-drafts.json')

export const devOnly = () => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
}
