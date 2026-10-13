import { describe, expect, it } from 'vitest'
import { TALENTS, WEAPON_TALENTS } from '#shared/data/talents'
import { idFromName } from '#shared/engine/ids'
import { arrangeTalents, talentProblems } from '#shared/engine/talents'
import TALENT_LIST from '#shared/data/talents.json'
import WEAPON_LIST from '#shared/data/weapons.json'

const DART = { id: 'dart', name: 'Dart', description: '', for: 'both', category: 'weapon', icon: '', branch: 'ranged', pos: { col: 6, row: 0 }, iqCost: 1, minIQ: 7, maxRanks: 1, effects: [] }

describe('talents', () => {
  it('the saved talent file passes the checks and every id comes from the name', () => {
    expect(talentProblems(TALENT_LIST, WEAPON_LIST)).toEqual([])
    for (const t of TALENT_LIST) expect(idFromName(t.name)).toBe(t.id)
    expect(WEAPON_TALENTS).toEqual(['sword', 'dagger', 'ax', 'mace', 'poleWeapons', 'thrownWeapons', 'bow', 'crossbow'])
    expect(TALENTS.toughnessII?.requires).toEqual({ all: [{ talent: 'toughnessI' }, { attr: 'ST', min: 14 }] })
  })

  it('accepts a new weapon talent', () => {
    expect(talentProblems([...TALENT_LIST, DART], WEAPON_LIST)).toEqual([])
  })

  it('accepts a valid SVG icon and rejects a bad one', () => {
    expect(talentProblems([...TALENT_LIST, { ...DART, icon: '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="20"/></svg>' }])).toEqual([])
    expect(talentProblems([...TALENT_LIST, { ...DART, icon: '<svg viewBox="0 0 64 64"><script>x</script></svg>' }])).toEqual(['dart: SVG has a script'])
  })

  it('rejects bad fields', () => {
    expect(talentProblems([...TALENT_LIST, {
      ...DART, id: 'Bad id', name: ' ', for: 'nobody', category: 'magic', branch: '', pos: { col: -1, row: 0.5 }, iqCost: '', minIQ: 1.5, maxRanks: 0,
      requires: { all: [{ talent: '' }, { talent: 'nope', rank: 0 }, { attr: 'MA', min: '' }, { any: [] }] },
      costOverrides: [{ ifHasTalent: 'nope', iqCost: -1 }],
      weaponPrereq: 'dagger'
    }])).toEqual([
      'Bad id: id must start with a lowercase letter and use only letters and digits',
      'Bad id: no name',
      'Bad id: for must be hero, creature or both',
      'Bad id: category must be attack, debuff, defense, movement, utility, weapon',
      'Bad id: no branch',
      'Bad id: column must be 0 or more',
      'Bad id: level must be base or 1 to 5',
      'Bad id: IQ cost must be a whole number, 0 or more',
      'Bad id: min IQ must be a whole number, 0 or more',
      'Bad id: max ranks must be a whole number, 1 or more',
      'Bad id: requirement has no talent picked',
      'Bad id: requirement needs nope, which is not a talent',
      'Bad id: requirement talent rank must be a whole number, 1 or more',
      'Bad id: requirement attribute must be ST, DX or IQ',
      'Bad id: requirement attribute minimum must be a whole number, 0 or more',
      'Bad id: requirement has an empty group',
      'Bad id: cost override needs nope, which is not a talent',
      'Bad id: cost override IQ cost must be a whole number, 0 or more',
      'Bad id: weapon prerequisite needs the talent to be per weapon'
    ])
    expect(talentProblems({})).toEqual(['Talents must be a list'])
  })

  it('checks rank requirements against max ranks', () => {
    expect(talentProblems([...TALENT_LIST, { ...DART, maxRanks: 2, rankRequires: { 2: { attr: 'DX', min: 12 }, 3: { attr: 'DX', min: 14 } } }])).toEqual([
      'dart: rank 3 requirement is outside ranks 2 to max ranks'
    ])
  })

  it('rejects repeated ids and removing a talent that weapons, creatures, archetypes, other talents or the game use', () => {
    expect(talentProblems([...TALENT_LIST, { ...DART, id: 'dagger' }])).toEqual(['dagger: id is used twice'])
    expect(talentProblems(TALENT_LIST.filter(t => t.id !== 'dagger'), WEAPON_LIST)).toEqual([
      'sword: cost override needs dagger, which is not a talent',
      'twoWeapons: requirement needs dagger, which is not a talent',
      'Dagger weapon needs weapon talent dagger',
      'Goblin creature needs talent dagger',
      'Duelist archetype needs talent dagger',
      'Archer archetype needs talent dagger'
    ])
    expect(talentProblems(TALENT_LIST.filter(t => t.id !== 'shield'))).toEqual([
      'shieldExpertise: requirement needs shield, which is not a talent',
      'shieldExpertise: not attached to a base talent',
      'Shieldwall archetype needs talent shield',
      'The game needs talent shield'
    ])
  })

  it('needs each talent attached to the level above', () => {
    const flick = { ...DART, id: 'flick', name: 'Flick', category: 'attack', pos: { col: 0, row: 1 } }
    expect(talentProblems([...TALENT_LIST, DART, flick])).toEqual(['flick: not attached to a base talent'])
    expect(talentProblems([...TALENT_LIST, DART, { ...flick, pos: { col: 0, row: 2 }, requires: { talent: 'dart' } }])).toEqual([
      'flick: needs dart, which is not on the level above',
      'flick: not attached to a level 1 talent'
    ])
    expect(talentProblems([...TALENT_LIST, DART, { ...flick, requires: { talent: 'dart' } }])).toEqual([])
  })

  it('arranges columns: base talents in order, each talent under the ones it needs, nothing overlapping', () => {
    const dart = { ...DART, pos: { col: 6.5, row: 0 } }
    const flick = { ...DART, id: 'flick', name: 'Flick', category: 'attack', pos: { col: 99, row: 1 }, requires: { talent: 'dart' } }
    const list = arrangeTalents([...TALENT_LIST, dart, flick])
    const col = (id: string) => list.find(t => t.id === id)!.pos.col
    expect(list.filter(t => t.pos.row === 0).map(t => t.pos.col).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
    expect(col('thrownWeapons')).toBe(6)
    expect(col('dart')).toBe(7)
    expect(col('bow')).toBe(8)
    expect(col('flick')).toBe(col('dart'))
    for (const row of [1, 2, 3, 4, 5]) {
      const cols = list.filter(t => t.pos.row === row).map(t => t.pos.col).sort((a, b) => a - b)
      cols.slice(1).forEach((c, i) => expect(c - cols[i]!).toBeGreaterThanOrEqual(1))
    }
    expect(arrangeTalents(list)).toEqual(list)
    expect(talentProblems(list)).toEqual([])
  })
})
