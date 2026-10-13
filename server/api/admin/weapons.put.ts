import { writeFile } from 'node:fs/promises'
import { armors, shields } from '#shared/data/items'
import { weaponProblems } from '#shared/engine/weapons'

export default defineEventHandler(async (event) => {
  devOnly()
  const body = await readBody(event)
  const problems = weaponProblems(body, [...armors(), ...shields()].map(i => i.id))
  if (problems.length) throw createError({ statusCode: 400, statusMessage: problems[0], data: problems })
  await writeFile(WEAPONS_FILE, `${JSON.stringify(body, null, 2)}\n`)
  return { saved: body.length }
})
