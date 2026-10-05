import { describe, expect, it } from 'vitest'
import type { Attributes } from '#shared/types'
import { ITEMS } from '#shared/data/items'
import { TALENTS } from '#shared/data/talents'
import {
  addTalent, adjustedDx, attrPointsLeft, canTakeTalent, createCharacter, creationProblems,
  dependentsOf, hasTalent, iqUsed, loadoutOf, removeTalent
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
    expect(canTakeTalent(TALENTS.toughness2!, hero([], smart)).reasons).toContain('Needs Toughness I')
    expect(canTakeTalent(TALENTS.toughness2!, hero(addTalent([], 'toughness'), smart)).reasons).toContain('Needs ST 14 (have 13)')
  })

  it('removing a prerequisite also removes what depended on it', () => {
    const smart = { ST: 12, DX: 12, IQ: 12 }
    const owned = addTalent(addTalent([], 'shield'), 'shieldExpertise')
    expect(removeTalent(owned, 'shield', undefined, smart)).toEqual([])
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

  it('allows a second weapon only with Two Weapons and its talent, and no shield', () => {
    const two = { ...input, attrs: { ST: 12, DX: 11, IQ: 9 }, talents: addTalent(addTalent([], 'sword'), 'twoWeapons') }
    expect(creationProblems({ ...two, offWeaponId: 'shortsword' })).not.toContain('Second weapon Shortsword needs Sword')
    expect(creationProblems({ ...input, offWeaponId: 'shortsword' })).toContain('A second weapon needs Two Weapons')
    expect(creationProblems({ ...two, offWeaponId: 'dagger' })).toContain('Second weapon Dagger needs Dagger')
    expect(creationProblems({ ...two, offWeaponId: 'shortsword', shieldId: 'smallShield' })).toContain('No shield with a second weapon')
  })

  it('gives two of the same weapon separate instances', () => {
    let n = 0
    const c = createCharacter({ ...input, offWeaponId: 'broadsword' }, () => `id${n++}`)
    expect(c.equipped.mainHand).not.toBe(c.equipped.offHand)
    expect(loadoutOf(c).offWeapon?.id).toBe('broadsword')
  })
})
