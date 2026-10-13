import { writeFile } from 'node:fs/promises'
import { iconProblems } from '#shared/engine/icons'

export default defineEventHandler(async (event) => {
  devOnly()
  const body = await readBody(event)
  const problems = iconProblems(body)
  if (problems.length) throw createError({ statusCode: 400, statusMessage: problems[0], data: problems })
  await writeFile(ICONS_FILE, `${JSON.stringify(body, null, 2)}\n`)
  return { saved: body.length }
})
