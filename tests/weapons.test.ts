import { describe, expect, it } from 'vitest'
import { ITEMS, armors, shields } from '#shared/data/items'
import { weaponProblems } from '#shared/engine/weapons'
import WEAPON_LIST from '#shared/data/weapons.json'

const SPEAR = { id: 'spear', name: 'Spear', icon: '', talent: 'poleWeapons', damage: { dice: 1, mod: 1 }, minST: 9, hands: 1, attackKind: 'pole', cost: 20 }
const others = [...armors(), ...shields()].map(i => i.id)

describe('weapons', () => {
  it('the saved weapon file passes the checks and loads as weapons', () => {
    expect(weaponProblems(WEAPON_LIST, others)).toEqual([])
    expect(ITEMS.dagger).toMatchObject({ kind: 'weapon', talent: 'dagger', damage: { dice: 1, mod: -1 } })
  })

  it('needs a range on missile and thrown weapons and none on the rest', () => {
    const list = WEAPON_LIST.filter(w => w.id !== 'spear')
    expect(weaponProblems([...list, { ...SPEAR, range: 3 }])).toEqual(['spear: only missile and thrown weapons have a range'])
    expect(weaponProblems([...list, { ...SPEAR, attackKind: 'thrown' }])).toEqual(['spear: range must be a whole number, 1 or more'])
  })

  it('rejects bad fields', () => {
    const list = WEAPON_LIST.filter(w => w.id !== 'spear')
    expect(weaponProblems([...list, { ...SPEAR, id: 'Bad id', name: ' ', talent: 'running', damage: { dice: 1.5, mod: '' }, minST: -1, hands: 3, attackKind: 'magic', cost: '' }])).toEqual([
      'Bad id: id must start with a lowercase letter and use only letters and digits',
      'Bad id: no name',
      'Bad id: talent must be a weapon talent',
      'Bad id: damage dice must be a whole number, 0 or more',
      'Bad id: damage modifier must be a whole number',
      'Bad id: min ST must be a whole number, 0 or more',
      'Bad id: hands must be 1 or 2',
      'Bad id: attack kind must be melee, pole, missile or thrown',
      'Bad id: cost must be a whole number, 0 or more',
      'Skirmisher archetype needs weapon spear'
    ])
    expect(weaponProblems({})).toEqual(['Weapons must be a list'])
  })

  it('accepts a valid SVG and rejects a bad one', () => {
    const list = WEAPON_LIST.filter(w => w.id !== 'spear')
    expect(weaponProblems([...list, { ...SPEAR, icon: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/></svg>' }])).toEqual([])
    expect(weaponProblems([...list, { ...SPEAR, icon: '<svg viewBox="0 0 64 64"><script>x</script></svg>' }])).toEqual(['spear: SVG has a script'])
  })

  it('rejects repeated ids, ids taken by other items, and removing a weapon an archetype uses', () => {
    expect(weaponProblems([...WEAPON_LIST, SPEAR])).toEqual(['spear: id is used twice'])
    expect(weaponProblems([...WEAPON_LIST, { ...SPEAR, id: 'leather' }], others)).toEqual(['leather: id is used by another item'])
    expect(weaponProblems(WEAPON_LIST.filter(w => w.id !== 'dagger'))).toEqual([
      'Skirmisher archetype needs weapon dagger',
      'Archer archetype needs weapon dagger'
    ])
  })
})
