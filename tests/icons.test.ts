import { describe, expect, it } from 'vitest'
import { extractSvg, iconProblems, parseTags, svgProblems } from '#shared/engine/icons'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="20" fill="currentColor"/></svg>'

describe('icons', () => {
  it('accepts a plain SVG icon', () => {
    expect(svgProblems(SVG)).toEqual([])
    expect(iconProblems([{ id: 'sword', name: 'Sword', tags: ['weapon'], svg: SVG }])).toEqual([])
  })

  it('pulls the SVG out of surrounding text', () => {
    expect(extractSvg(`Here it is:\n${SVG}\nDone.`)).toBe(SVG)
    expect(extractSvg('no svg here')).toBeUndefined()
  })

  it('rejects scripts, handlers, outside links and a wrong viewBox', () => {
    expect(svgProblems('<svg viewBox="0 0 64 64"><script>x</script></svg>')).toEqual(['SVG has a script'])
    expect(svgProblems('<svg viewBox="0 0 64 64"><rect onclick="x"/></svg>')).toEqual(['SVG has an event handler'])
    expect(svgProblems('<svg viewBox="0 0 64 64"><use href="http://x/y.svg"/></svg>')).toEqual(['SVG links outside itself'])
    expect(svgProblems('<svg viewBox="0 0 64 64"><rect fill="url(#g)"/></svg>')).toEqual([])
    expect(svgProblems('<svg viewBox="0 0 32 32"></svg>')).toEqual(['SVG must use viewBox="0 0 64 64"'])
  })

  it('splits tags on commas, lowercases them and drops repeats', () => {
    expect(parseTags('Sword, weapon , sword,,Blade')).toEqual(['sword', 'weapon', 'blade'])
  })

  it('rejects bad ids, duplicate ids and missing tags', () => {
    expect(iconProblems([
      { id: 'Bad Id', name: 'x', tags: [], svg: SVG },
      { id: 'dup', name: 'x', tags: [], svg: SVG },
      { id: 'dup', name: 'x', tags: [], svg: SVG },
      { id: 'notags', name: 'x', svg: SVG }
    ])).toEqual([
      'Bad Id: id must be lowercase letters, digits and dashes',
      'dup: id is used twice',
      'notags: tags must be a list of words'
    ])
    expect(iconProblems({})).toEqual(['Icons must be a list'])
  })
})
