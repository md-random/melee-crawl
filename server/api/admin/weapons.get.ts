import { readFile } from 'node:fs/promises'

export default defineEventHandler(async () => {
  devOnly()
  return JSON.parse(await readFile(WEAPONS_FILE, 'utf8'))
})
