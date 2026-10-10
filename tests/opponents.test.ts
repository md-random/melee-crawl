import { describe, expect, it } from 'vitest'
import { ARCHETYPES, CREATURES, archetypesFor } from '#shared/data/creatures'
import { TALENTS } from '#shared/data/talents'
import { buildOpponent, randomSpec } from '#shared/engine/opponents'

describe('buildOpponent', () => {
  const spec = { baseId: 'human', archetypeId: 'brute', budget: { attrPoints: 4, xp: 1500 }, seed: 42 }

  it('is deterministic for the same spec', () => {
    expect(buildOpponent(spec)).toEqual(buildOpponent(spec))
  })

  it('spends exactly the attribute budget', () => {
    const o = buildOpponent(spec)
    const base = CREATURES.human!.attrs
    expect(o.attrs.ST + o.attrs.DX + o.attrs.IQ).toBe(base.ST + base.DX + base.IQ + 4)
  })

  it('an entry-level Brute is a Grunt, a big budget makes a Chieftain', () => {
    expect(buildOpponent({ ...spec, budget: { attrPoints: 0, xp: 0 } }).name).toBe('Human Grunt')
    expect(buildOpponent({ ...spec, budget: { attrPoints: 8, xp: 3000 } }).name).toBe('Human Chieftain')
  })

  it('turns a beast\'s XP into attribute points, keeps its traits, and puts the title first', () => {
    const wolf = buildOpponent({ baseId: 'wolf', archetypeId: 'pack', budget: { attrPoints: 4, xp: 1500 }, seed: 1 })
    expect(wolf.name).toBe('Alpha Wolf') // 4 attr + 3 points from 1500 XP = 7
    const base = CREATURES.wolf!.attrs
    expect(wolf.attrs.ST + wolf.attrs.DX + wolf.attrs.IQ).toBe(base.ST + base.DX + base.IQ + 4 + 3)
    expect(wolf.talents).toEqual([])
    expect(wolf.traits.map(t => t.id)).toEqual(['keenSenses', 'packTactics'])
    expect(wolf.weapon).toBeUndefined()
    expect(wolf.ma).toBe(12)
  })

  it('counts trait bonuses toward MA and armor', () => {
    const rat = buildOpponent({ baseId: 'giantRat', archetypeId: 'lurker', budget: { attrPoints: 0, xp: 0 }, seed: 1 })
    expect(rat.ma).toBe(CREATURES.giantRat!.attrs.MA + 2) // Swift
    const bear = buildOpponent({ baseId: 'bear', archetypeId: 'pack', budget: { attrPoints: 0, xp: 0 }, seed: 1 })
    expect(bear.hitsStopped).toBe(CREATURES.bear!.naturalHitsStopped + 1) // Thick Hide
  })

  it('a Brute gets either Ax or Mace, and its Weapon Expertise matches', () => {
    const picks = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      const o = buildOpponent({ ...spec, budget: { attrPoints: 0, xp: 1500 }, seed })
      const weaponTalent = o.talents.find(t => t.id === 'ax' || t.id === 'mace')!.id
      picks.add(weaponTalent)
      const expertise = o.talents.find(t => t.id === 'weaponExpertise')
      if (expertise) expect(expertise.weaponTalent).toBe(weaponTalent)
    }
    expect([...picks].sort()).toEqual(['ax', 'mace'])
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
