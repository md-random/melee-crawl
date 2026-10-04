import { describe, expect, it } from 'vitest'
import type { Attributes } from '#shared/types'
import { ITEMS } from '#shared/data/items'
import { TALENTS } from '#shared/data/talents'
import {
  addTalent, adjustedDx, attrPointsLeft, canTakeTalent, createCharacter, creationProblems,
  dependentsOf, hasTalent, iqUsed, loadoutOf, planTalent, removeTalent
} from '#shared/engine/rules'

const attrs: Attributes = { ST: 12, DX: 12, IQ: 8 }
const hero = (owned = [] as ReturnType<typeof addTalent>, a = attrs) => ({ attrs: a, owned, audience: 'hero' as const })

describe('talents', () => {
  it('Sword costs 1 IQ with Dagger, 2 without, and does not cover daggers', () => {
    expect(iqUsed(addTalent([], 'sword'))).toBe(2)
    expect(iqUsed(addTalent(addTalent([], 'dagger'), 'sword'))).toBe(2)
    expect(hasTalent(addTalent([], 'sword'), 'dagger')).toBe(false)
  })

  it('enforces min IQ, IQ budget, attribute gates and creature-only talents', () => {
    expect(canTakeTalent(TALENTS.running!, hero()).ok).toBe(true)
    expect(canTakeTalent(TALENTS.toughness!, hero()).reasons).toContain('Needs IQ 9 (have 8)')
    const full = addTalent(addTalent(addTalent([], 'sword'), 'shield'), 'running') // 2 + 1 + 2 = 5
    expect(canTakeTalent(TALENTS.axMace!, hero(addTalent(full, 'bow'))).ok).toBe(false)
    expect(canTakeTalent(TALENTS.thickHide!, hero()).reasons).toContain('Creature only')
    const smart = { ST: 13, DX: 12, IQ: 12 }
    expect(canTakeTalent(TALENTS.toughness!, hero([], smart)).ok).toBe(true)
    expect(canTakeTalent(TALENTS.toughness!, hero(addTalent([], 'toughness'), smart)).reasons).toContain('Needs ST 14 (have 13)')
  })

  it('removing a prerequisite also removes what depended on it', () => {
    const smart = { ST: 12, DX: 12, IQ: 12 }
    const owned = addTalent(addTalent([], 'shield'), 'shieldExpertise')
    expect(removeTalent(owned, 'shield', undefined, smart)).toEqual([])
  })

  it('planning a talent pulls in missing prerequisites and totals the IQ', () => {
    const smart = { ST: 12, DX: 11, IQ: 11 }
    const shieldEx = planTalent('shieldExpertise', hero([], smart))
    expect(shieldEx.steps.map(s => s.id)).toEqual(['shield', 'shieldExpertise'])
    expect(shieldEx.iqCost).toBe(3)
    expect(shieldEx.blockers).toEqual([])

    const two = planTalent('twoWeapons', hero([], smart))
    expect(two.steps.map(s => s.id)).toEqual(['dagger', 'twoWeapons'])
    expect(two.blockers).toEqual([])
    expect(planTalent('twoWeapons', hero(addTalent([], 'sword'), smart)).steps.map(s => s.id)).toEqual(['twoWeapons'])
    expect(planTalent('twoWeapons', hero([], smart), undefined, ['axMace']).steps.map(s => s.id)).toEqual(['axMace', 'twoWeapons'])

    const dull = { ST: 12, DX: 9, IQ: 9 }
    expect(planTalent('twoWeapons', hero([], dull)).blockers).toEqual(['Needs IQ 11 (have 9)', 'Needs DX 11 (have 9)'])

    const expert = planTalent('weaponExpertise', hero([], { ST: 12, DX: 12, IQ: 12 }), 'sword')
    expect(expert.steps.map(s => s.id)).toEqual(['sword', 'weaponExpertise'])
    expect(expert.iqCost).toBe(5)
  })

  it('reports talents that depend on one being removed', () => {
    const smart = { ST: 12, DX: 12, IQ: 12 }
    const owned = addTalent(addTalent([], 'shield'), 'shieldExpertise')
    expect(dependentsOf(owned, 'shield', undefined, smart).map(t => t.id)).toEqual(['shieldExpertise'])
  })

  it('per-weapon talents need the weapon talent', () => {
    const smart = { ST: 12, DX: 12, IQ: 12 }
    expect(canTakeTalent(TALENTS.weaponExpertise!, hero([], smart), 'sword').ok).toBe(false)
    expect(canTakeTalent(TALENTS.weaponExpertise!, hero(addTalent([], 'sword'), smart), 'sword').ok).toBe(true)
  })
})

describe('adjusted DX', () => {
  it('subtracts armor and the no-talent penalty, with a breakdown', () => {
    const weapon = ITEMS.broadsword
    const armor = ITEMS.leather
    if (weapon?.kind !== 'weapon' || armor?.kind !== 'armor') throw new Error('data')
    expect(adjustedDx(attrs, addTalent([], 'sword'), { weapon, armor }).value).toBe(10)
    const untrained = adjustedDx(attrs, [], { weapon, armor })
    expect(untrained.value).toBe(6)
    expect(untrained.parts.map(p => p.label)).toEqual(['DX', 'Leather Armor', 'No Sword talent'])
  })
})

describe('character creation', () => {
  const input = { name: 'Grimwald', attrs, talents: addTalent([], 'sword'), weaponId: 'broadsword', armorId: 'leather' }

  it('accepts a valid build and spends exactly 32 points', () => {
    expect(attrPointsLeft(attrs)).toBe(0)
    expect(creationProblems(input)).toEqual([])
  })

  it('rejects unspent points, weak ST for the weapon and two-handers with shields', () => {
    expect(creationProblems({ ...input, attrs: { ST: 10, DX: 12, IQ: 8 } })).toEqual([
      '2 attribute points left to spend',
      'Broadsword needs ST 12'
    ])
    expect(creationProblems({ ...input, attrs: { ST: 14, DX: 10, IQ: 8 }, weaponId: 'twoHandedSword', shieldId: 'smallShield' }))
      .toContain('Two-Handed Sword is two-handed; no shield')
  })

  it('creates a character with the chosen gear equipped', () => {
    let n = 0
    const c = createCharacter(input, () => `id${n++}`)
    const gear = loadoutOf(c)
    expect(gear.weapon?.id).toBe('broadsword')
    expect(gear.armor?.id).toBe('leather')
    expect(gear.shield).toBeUndefined()
    expect(c.base).toEqual(attrs)
  })
})
