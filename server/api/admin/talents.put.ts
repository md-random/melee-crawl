import { readFile, writeFile } from 'node:fs/promises'
import { arrangeTalents, talentProblems } from '#shared/engine/talents'

export default defineEventHandler(async (event) => {
  devOnly()
  const body = await readBody(event)
  const weapons = JSON.parse(await readFile(WEAPONS_FILE, 'utf8'))
  const problems = talentProblems(body, weapons)
  if (problems.length) throw createError({ statusCode: 400, statusMessage: problems[0], data: problems })
  const arranged = arrangeTalents(body)
  await writeFile(TALENTS_FILE, `${JSON.stringify(arranged, null, 2)}\n`)
  return { saved: arranged.length }
})
