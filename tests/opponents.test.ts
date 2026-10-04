import { describe, expect, it } from 'vitest'
import { ARCHETYPES, CREATURES, archetypesFor } from '#shared/data/creatures'
import { TALENTS } from '#shared/data/talents'
import { buildOpponent, randomSpec } from '#shared/engine/opponents'

describe('buildOpponent', () => {
  const spec = { baseId: 'orc', archetypeId: 'brute', budget: { attrPoints: 4, xp: 1500 }, seed: 42 }

  it('is deterministic for the same spec', () => {
    expect(buildOpponent(spec)).toEqual(buildOpponent(spec))
  })

  it('spends exactly the attribute budget', () => {
    const o = buildOpponent(spec)
    const base = CREATURES.orc!.attrs
    expect(o.attrs.ST + o.attrs.DX + o.attrs.IQ).toBe(base.ST + base.DX + base.IQ + 4)
  })

  it('an entry-level orc is a Grunt, a big budget makes a Chieftain', () => {
    expect(buildOpponent({ ...spec, budget: { attrPoints: 0, xp: 0 } }).name).toBe('Orc Grunt')
    expect(buildOpponent({ ...spec, budget: { attrPoints: 8, xp: 3000 } }).name).toBe('Orc Chieftain')
  })

  it('buys creature talents for beasts and puts the title first', () => {
    const wolf = buildOpponent({ baseId: 'wolf', archetypeId: 'pack', budget: { attrPoints: 4, xp: 1500 }, seed: 1 })
    expect(wolf.name).toBe('Alpha Wolf') // 4 attr + 3 talents' worth of XP = 7
    expect(wolf.talents.map(t => t.id)).toEqual(expect.arrayContaining(['swift', 'thickHide', 'keenSenses']))
    expect(wolf.weapon).toBeUndefined()
    expect(wolf.ma).toBe(14)
  })

  it('never produces an illegal build across many seeds and budgets', () => {
    for (const base of Object.values(CREATURES)) {
      for (const arch of archetypesFor(base)) {
        for (let seed = 0; seed < 20; seed++) {
          const o = buildOpponent({ baseId: base.id, archetypeId: arch.id, budget: { attrPoints: seed % 9, xp: (seed % 7) * 500 }, seed })
          if (o.weapon) expect(o.attrs.ST).toBeGreaterThanOrEqual(o.weapon.minST)
          if (o.weapon?.hands === 2) expect(o.shield).toBeUndefined()
          for (const t of o.talents) expect(t.rank).toBeLessThanOrEqual(TALENTS[t.id]!.maxRanks)
          if (base.canUseItems) expect(o.weapon, `${base.id}/${arch.id}`).toBeDefined()
        }
      }
    }
  })
})

describe('randomSpec', () => {
  it('pairs a base with an archetype that fits it', () => {
    for (let seed = 0; seed < 50; seed++) {
      const s = randomSpec(seed, { attrPoints: 2, xp: 500 })
      expect(archetypesFor(CREATURES[s.baseId]!)).toContain(ARCHETYPES[s.archetypeId])
    }
  })
})
