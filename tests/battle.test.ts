import { describe, expect, it } from 'vitest'
import type { BattleState, Character, ConsumableDef, Facing, GameEvent, Hex, Rng, SpellDef, Unit } from '#shared/types'
import { ITEMS } from '#shared/data/items'
import { SPELLS } from '#shared/data/spells'
import { ACTIONS, availableChoices, choiceKey, contextFor } from '#shared/engine/actions'
import { planTurn } from '#shared/engine/ai'
import { advance, createBattle, rngOf, submit, unitFromOpponent } from '#shared/engine/battle'
import {
  arcOf, attackTargets, hasDisengaged, isEngagedAt, mapOf, movementOptions, readyAttack, toHitTarget
} from '#shared/engine/combat'
import { applyEffect, tickEffects } from '#shared/engine/effects'
import { alignByGenus } from '#shared/engine/opponents'
import { addTalent, createCharacter } from '#shared/engine/rules'
import { hexDistance, hexKey, neighbor, offsetToHex } from '#shared/utils/hex'

// ---------- helpers ----------

let n = 0
const hero = (over: Partial<Parameters<typeof createCharacter>[0]> = {}): Character => createCharacter({
  name: 'Hero',
  attrs: { ST: 12, DX: 12, IQ: 8 },
  talents: addTalent([], 'sword'),
  weaponId: 'broadsword',
  ...over
}, () => `id${n++}`)

const orc = { baseId: 'orc', archetypeId: 'brute', budget: { attrPoints: 0, xp: 0 }, seed: 7 }

/** Dice that come up in the given order (3 when the list runs out). */
const fixedDice = (...seq: number[]): Rng => ({ roll: (count: number) => Array.from({ length: count }, () => seq.shift() ?? 3) })

const CENTER = offsetToHex(7, 5)

/** A battle whose middle 5 hexes across are open ground, with the units placed by hand. */
function arena(character = hero(), opponents = [orc]): BattleState {
  for (let seed = 1; seed < 500; seed++) {
    const state = createBattle({ id: 'b', battleNo: 1, seed, character, opponents, biome: 'plains' })
    const map = mapOf(state)
    const open = [...map.hexes.entries()].filter(([k]) => {
      const [q, r] = k.split(',').map(Number)
      return hexDistance(CENTER, { q: q!, r: r! }) <= 4
    }).every(([, t]) => t === 'clear')
    if (open) return state
  }
  throw new Error('no open arena')
}

const unitsOf = (s: BattleState) => ({ me: Object.values(s.units).find(u => u.side === 'player')!, foe: Object.values(s.units).find(u => u.side === 'enemy')! })

function place(u: Unit, pos: Hex, facing: Facing) {
  u.pos = pos
  u.facing = facing
}

const ctx = (s: BattleState, u: Unit, actionId: string, rng: Rng = rngOf(s)) => contextFor(s, u, { actionId }, rng)

// ---------- tests ----------

describe('genus', () => {
  it('gives every creature of one genus in a fight the same archetype', () => {
    const specs = alignByGenus([
      { ...orc, archetypeId: 'shieldwall' },
      { ...orc, archetypeId: 'brute', seed: 8 },
      { baseId: 'hobgoblin', archetypeId: 'duelist', budget: orc.budget, seed: 9 }
    ])
    expect(specs.map(s => s.archetypeId)).toEqual(['shieldwall', 'shieldwall', 'duelist'])
  })
})

describe('facing and engagement', () => {
  it('splits the six neighbours into 3 front, 2 side, 1 rear', () => {
    const arcs = ([0, 1, 2, 3, 4, 5] as Facing[]).map(d => arcOf(CENTER, 1, neighbor(CENTER, d)))
    expect(arcs).toEqual(['front', 'front', 'front', 'side', 'rear', 'side'])
  })

  it('engages only units in an enemy\'s front hexes', () => {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 1)
    place(me, neighbor(CENTER, 1), 4)
    expect(isEngagedAt(s, me, me.pos)).toBe(true)
    place(me, neighbor(CENTER, 4), 1) // behind the orc
    expect(isEngagedAt(s, me, me.pos)).toBe(false)
  })

  it('lets an engaged unit shift one hex at most', () => {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 1)
    place(me, neighbor(CENTER, 1), 4)
    for (const key of movementOptions(s, me).keys()) {
      const [q, r] = key.split(',').map(Number)
      expect(hexDistance(me.pos, { q: q!, r: r! })).toBeLessThanOrEqual(1)
    }
  })

  it('stops movement on entering an enemy\'s front hexes', () => {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 1)
    place(me, neighbor(neighbor(neighbor(CENTER, 1), 1), 1), 4) // 3 hexes in front of the orc
    const options = movementOptions(s, me)
    const front = neighbor(CENTER, 1)
    expect(options.has(hexKey(front))).toBe(true)
    // The orc's rear hex is only reachable by walking around, never through its front.
    const rear = neighbor(CENTER, 4)
    const viaFront = options.get(hexKey(rear))
    expect(viaFront === undefined || viaFront > 3).toBe(true)
  })

  it('forbids attacking after disengaging', () => {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 1)
    place(me, neighbor(CENTER, 1), 4)
    me.turn.startedEngaged = true
    place(me, neighbor(neighbor(CENTER, 1), 1), 4)
    me.turn.hexesMoved = 1
    expect(hasDisengaged(s, me)).toBe(true)
    expect(ACTIONS.attack!.isAvailable(ctx(s, me, 'attack'))).toBe(false)
    expect(ACTIONS.defend!.isAvailable(ctx(s, me, 'defend'))).toBe(true)
  })
})

describe('attacks', () => {
  function faceOff() {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 1)
    place(me, neighbor(CENTER, 1), 4)
    return { s, me, foe }
  }

  it('gets +2 from the side and +4 from the rear', () => {
    const { s, me, foe } = faceOff()
    const a = readyAttack(me)!
    const front = toHitTarget(s, me, foe, a)
    place(me, neighbor(CENTER, 3), 0)
    expect(toHitTarget(s, me, foe, a)).toBe(front + 2)
    place(me, neighbor(CENTER, 4), 1)
    expect(toHitTarget(s, me, foe, a)).toBe(front + 4)
  })

  it('hits on a low roll, armor stops damage, and 0 ST kills', () => {
    const { s, me, foe } = faceOff()
    const armor = 2 // the brute's leather
    foe.stCurrent = 3
    // To-hit 3,3,3 = 9; damage 2d: 6+6 = 12 → 10 through armor.
    const events = ACTIONS.attack!.resolve(ctx(s, me, 'attack', fixedDice(3, 3, 3, 6, 6)), { unit: foe.uid })
    const dmg = events.find(e => e.kind === 'damage')
    expect(dmg).toMatchObject({ amount: 12 - armor, stopped: armor })
    expect(foe.stCurrent).toBeLessThanOrEqual(0)
    expect(events.some(e => e.kind === 'death' && e.unit === foe.uid)).toBe(true)
  })

  it('records the hero\'s killer', () => {
    const { s, me, foe } = faceOff()
    me.stCurrent = 1
    // 1+1+2 = 4 always hits (double damage), whatever the orc's adjDX.
    ACTIONS.attack!.resolve(ctx(s, foe, 'attack', fixedDice(1, 1, 2, 6, 6)), { unit: me.uid })
    expect(s.killedBy?.unitUid).toBe(foe.uid)
  })

  it('makes attackers roll 4 dice against a defender', () => {
    const { s, me, foe } = faceOff()
    ACTIONS.defend!.resolve(ctx(s, foe, 'defend'), {})
    const events = ACTIONS.attack!.resolve(ctx(s, me, 'attack', fixedDice(1, 1, 1, 1, 1, 1)), { unit: foe.uid })
    const roll = events.find(e => e.kind === 'roll')
    expect(roll?.kind === 'roll' && roll.dice.length).toBe(4)
  })

  it('shoots missiles in range and sight, but not while engaged', () => {
    const archer = hero({ attrs: { ST: 11, DX: 13, IQ: 8 }, talents: addTalent([], 'bow'), weaponId: 'longbow' })
    const s = arena(archer)
    const { me, foe } = unitsOf(s)
    place(foe, CENTER, 4)
    let far = CENTER
    for (let i = 0; i < 4; i++) far = neighbor(far, 1)
    place(me, far, 4)
    const a = readyAttack(me)!
    expect(attackTargets(s, me, a).map(u => u.uid)).toEqual([foe.uid])
    expect(ACTIONS.attack!.isAvailable(ctx(s, me, 'attack'))).toBe(true)
    place(me, neighbor(CENTER, 4), 1) // adjacent, in the orc's front
    expect(ACTIONS.attack!.isAvailable(ctx(s, me, 'attack'))).toBe(false)
  })
})

describe('effects', () => {
  it('ticks damage over time and expires on schedule', () => {
    const s = arena()
    const { foe } = unitsOf(s)
    const st = foe.stCurrent
    applyEffect(s, { kind: 'status', status: 'poisoned', duration: { type: 'rounds', rounds: 2 }, tickDamage: { dice: 0, mod: 1 } },
      { kind: 'action', id: 'venom', name: 'Venom' }, { target: foe }, fixedDice())
    expect(foe.statuses).toContain('poisoned')
    tickEffects(s, fixedDice())
    tickEffects(s, fixedDice())
    expect(foe.stCurrent).toBe(st - 2)
    expect(foe.statuses).not.toContain('poisoned')
  })

  it('casts a spell from data with no spell-specific code', () => {
    const bolt: SpellDef = {
      id: 'testBolt', name: 'Test Bolt', icon: '⚡', minIQ: 8, stCost: 2, range: 6, target: 'unit',
      area: { type: 'single' }, effects: [{ kind: 'damage', dice: { dice: 0, mod: 5 }, ignoresArmor: true }]
    }
    SPELLS[bolt.id] = bolt
    try {
      const s = arena(hero())
      const { me, foe } = unitsOf(s)
      me.spells = [bolt.id]
      place(foe, CENTER, 4)
      place(me, neighbor(neighbor(CENTER, 1), 1), 4)
      const choice = { actionId: 'castSpell', spellId: bolt.id }
      const c = contextFor(s, me, choice, fixedDice(3, 3, 3))
      expect(availableChoices(s, me, rngOf(s)).map(choiceKey)).toContain('castSpell:testBolt')
      const st = { me: me.stCurrent, foe: foe.stCurrent }
      ACTIONS.castSpell!.resolve(c, { unit: foe.uid, hex: foe.pos })
      expect(me.stCurrent).toBe(st.me - 2)
      expect(foe.stCurrent).toBe(st.foe - 5)
    } finally {
      delete SPELLS[bolt.id]
    }
  })

  it('uses a potion from data and removes it', () => {
    const potion: ConsumableDef = {
      id: 'testPotion', name: 'Test Potion', kind: 'potion', icon: '🧪', weight: 0, cost: 0,
      actionId: 'useItem', target: 'self', effects: [{ kind: 'heal', dice: { dice: 0, mod: 4 } }]
    }
    ITEMS[potion.id] = potion
    try {
      const s = arena()
      const { me } = unitsOf(s)
      me.inventory.push({ uid: 'p1', defId: potion.id })
      me.equipped.belt.push('p1')
      me.stCurrent -= 5
      const before = me.stCurrent
      const choice = { actionId: 'useItem', itemUid: 'p1' }
      expect(availableChoices(s, me, rngOf(s)).map(choiceKey)).toContain('useItem:p1')
      ACTIONS.useItem!.resolve(contextFor(s, me, choice, fixedDice()), { unit: me.uid, hex: me.pos })
      expect(me.stCurrent).toBe(before + 4)
      expect(me.inventory.some(i => i.uid === 'p1')).toBe(false)
    } finally {
      delete ITEMS[potion.id]
    }
  })
})

describe('AI', () => {
  it('attacks an adjacent enemy it can hit, facing it', () => {
    const s = arena()
    const { me, foe } = unitsOf(s)
    place(me, CENTER, 1)
    place(foe, neighbor(CENTER, 1), 4)
    const plan = planTurn(s, foe, rngOf(s))
    expect(plan.choice.actionId).toBe('attack')
    expect(plan.target).toBe(me.uid)
    const moved: Unit = { ...foe, pos: plan.to, facing: plan.facing }
    expect(arcOf(moved.pos, moved.facing, me.pos)).toBe('front')
  })

  it('profiles come from the archetype', () => {
    expect(unitFromOpponent(orc, 'x', CENTER, 4).aiProfile).toBe('brute')
    expect(unitFromOpponent({ ...orc, baseId: 'wolf', archetypeId: 'pack' }, 'y', CENTER, 4).aiProfile).toBe('packHunter')
  })
})

describe('turn engine', () => {
  function runAiBattle(seed: number): { state: BattleState; events: GameEvent[] } {
    const state = createBattle({
      id: 'b', battleNo: 1, seed, character: hero(), heroController: 'ai',
      opponents: [{ ...orc, seed }, { baseId: 'goblin', archetypeId: 'skirmisher', budget: orc.budget, seed: seed + 1 }],
      biome: 'plains'
    })
    const events = advance(state)
    return { state, events }
  }

  it('runs a whole AI-vs-AI battle to a result', () => {
    for (const seed of [1, 2, 3]) {
      const { state } = runAiBattle(seed)
      expect(['victory', 'defeat']).toContain(state.phase)
      expect(state.round).toBeLessThan(100)
    }
  })

  it('replays exactly from the same seed', () => {
    n = 0
    const a = runAiBattle(5).events
    n = 0
    const b = runAiBattle(5).events
    expect(a).toEqual(b)
  })

  it('stops for the human and accepts their choices', () => {
    const state = createBattle({ id: 'b', battleNo: 1, seed: 11, character: hero(), opponents: [orc], biome: 'plains' })
    advance(state)
    let steps = 0
    while (state.phase !== 'victory' && state.phase !== 'defeat' && steps++ < 2000) {
      const p = state.pending!
      expect(p).toBeDefined()
      const me = state.units[p.unitUid]!
      if (p.kind === 'move') {
        // Walk toward the orc: pick the reachable hex nearest to it.
        const foe = Object.values(state.units).find(u => u.side === 'enemy')!
        const to = p.reachable
          .map(k => { const [q, r] = k.split(',').map(Number); return { q: q!, r: r! } })
          .sort((x, y) => hexDistance(x, foe.pos) - hexDistance(y, foe.pos))[0]!
        submit(state, { kind: 'move', to })
      } else if (p.kind === 'chooseFacing') {
        const foe = Object.values(state.units).find(u => u.side === 'enemy')!
        const facing = ([0, 1, 2, 3, 4, 5] as Facing[]).find(f => arcOf(me.pos, f, foe.pos) === 'front' && hexKey(neighbor(me.pos, f)) === hexKey(foe.pos)) ?? me.facing
        submit(state, { kind: 'face', facing })
      } else if (p.kind === 'chooseAction') {
        submit(state, { kind: 'action', choice: p.actions.includes('attack') ? 'attack' : 'pass' })
      } else if (p.kind === 'chooseTarget') {
        submit(state, { kind: 'target', target: p.targets[0]! })
      }
    }
    expect(['victory', 'defeat']).toContain(state.phase)
  })

  it('rejects input that does not match what it is waiting for', () => {
    const state = createBattle({ id: 'b', battleNo: 1, seed: 11, character: hero(), opponents: [orc], biome: 'plains' })
    advance(state)
    expect(() => submit(state, { kind: 'action', choice: 'attack' })).toThrow()
  })
})
