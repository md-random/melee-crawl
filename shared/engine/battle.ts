import type {
  BattleState, Biome, Character, Facing, GameEvent, Hex, HexKey, Id, OpponentSpec, Phase, Side, Unit, UnitTurn
} from '../types'
import { ARCHETYPES, CREATURES } from '../data/creatures'
import { BASE_MA } from '../data/progression'
import { TALENTS } from '../data/talents'
import { fromKey, hexKey, neighbors } from '../utils/hex'
import { createRng, type SeededRng } from '../utils/rng'
import { ACTIONS, availableChoices, choiceKey, contextFor, parseChoiceKey, toTarget } from './actions'
import { chooseAction, chooseTarget, planTurn } from './ai'
import { adjDxOf, isAlive, isEngagedAt, livingUnits, mapOf, modifierTotal, movementOptions } from './combat'
import { talentEffects, tickEffects } from './effects'
import { ev } from './events'
import { alignByGenus, buildOpponent } from './opponents'

// Turn engine. Round: initiative → movement (side by side) → action select
// (everyone) → action resolve (adjDX order) → end of turn. Everything it does
// is returned as GameEvents; the state is mutated in place and saved by the caller.

const freshTurn = (): UnitTurn => ({ hexesMoved: 0, startedEngaged: false, done: false })

// ---------- units ----------

export function unitFromCharacter(c: Character, pos: Hex, facing: Facing, controller: Unit['controller'] = 'human'): Unit {
  const uid = c.id
  return {
    uid,
    name: c.name,
    portraitId: c.portraitId,
    side: 'player',
    controller,
    aiProfile: controller === 'ai' ? 'duelist' : undefined,
    origin: { type: 'character', characterId: c.id },
    tags: ['humanoid'],
    base: { ...c.base, MA: BASE_MA },
    stCurrent: c.base.ST,
    talents: c.talents.map(t => ({ ...t })),
    inventory: c.inventory.map(i => ({ ...i })),
    equipped: { ...c.equipped, belt: [...c.equipped.belt] },
    naturalWeapons: [],
    readyWeapon: c.equipped.mainHand,
    spells: [...c.spells],
    pos,
    facing,
    effects: talentEffects({ uid, talents: c.talents }, TALENTS),
    statuses: [],
    turn: freshTurn()
  }
}

export function unitFromOpponent(spec: OpponentSpec, uid: Id, pos: Hex, facing: Facing): Unit {
  const o = buildOpponent(spec)
  const base = CREATURES[spec.baseId]!
  const gear = [
    { slot: 'mainHand', def: o.weapon },
    { slot: 'body', def: o.armor },
    { slot: 'offHand', def: o.shield }
  ] as const
  const inventory = gear.flatMap(g => (g.def ? [{ uid: `${uid}-${g.slot}`, defId: g.def.id }] : []))
  const has = (slot: string) => inventory.some(i => i.uid === `${uid}-${slot}`)
  const effects = talentEffects({ uid, talents: o.talents }, TALENTS)
  if (base.naturalHitsStopped) {
    effects.push({
      uid: `${uid}:natural`,
      def: { kind: 'modifier', modifiers: [{ stat: 'hitsStopped', value: base.naturalHitsStopped }], duration: { type: 'permanent' }, stacking: 'stack' },
      source: { kind: 'armor', id: 'natural', name: 'Natural armor' },
      targetUnit: uid
    })
  }
  return {
    uid,
    name: o.name,
    title: o.title || undefined,
    portraitId: o.portraitId,
    side: 'enemy',
    controller: 'ai',
    aiProfile: ARCHETYPES[spec.archetypeId]?.aiProfile,
    origin: { type: 'opponent', spec },
    tags: [...base.tags],
    // Talent MA bonuses come from effects, so start from the creature's own MA.
    base: { ...o.attrs, MA: base.attrs.MA },
    stCurrent: o.attrs.ST,
    talents: o.talents,
    inventory,
    equipped: {
      mainHand: has('mainHand') ? `${uid}-mainHand` : undefined,
      body: has('body') ? `${uid}-body` : undefined,
      offHand: has('offHand') ? `${uid}-offHand` : undefined,
      belt: []
    },
    naturalWeapons: o.naturalWeapons,
    readyWeapon: has('mainHand') ? `${uid}-mainHand` : o.naturalWeapons[0]?.name,
    spells: [],
    pos,
    facing,
    effects,
    statuses: [],
    turn: freshTurn()
  }
}

// ---------- setup ----------

export interface BattleInput {
  id: Id
  battleNo: number
  seed: number
  character: Character
  opponents: OpponentSpec[]
  biome: Biome
  width?: number
  height?: number
  /** 'ai' lets tests run whole battles without input. */
  heroController?: Unit['controller']
}

/** Free hexes nearest the spawn zone, spawn hexes first. */
function spawnHexes(state: BattleState, zone: HexKey[], count: number): Hex[] {
  const map = mapOf(state)
  const out: HexKey[] = []
  const seen = new Set<HexKey>()
  const queue = [...zone]
  while (queue.length && out.length < count) {
    const key = queue.shift()!
    if (seen.has(key)) continue
    seen.add(key)
    const terrain = map.hexes.get(key)
    if (terrain === 'clear') out.push(key)
    if (terrain) for (const n of neighbors(fromKey(key))) queue.push(hexKey(n))
  }
  return out.map(fromKey)
}

export function createBattle(input: BattleInput): BattleState {
  const state: BattleState = {
    id: input.id,
    battleNo: input.battleNo,
    rng: { seed: input.seed, calls: 0 },
    map: { seed: input.seed, biome: input.biome, width: input.width ?? 15, height: input.height ?? 11, overlays: {} },
    units: {},
    round: 1,
    phase: 'setup',
    moveOrder: [],
    queue: [],
    fieldEffects: [],
    seq: { event: 0, uid: 0 }
  }
  const map = mapOf(state)
  const [heroPos] = spawnHexes(state, [map.spawns.player[1]!, ...map.spawns.player], 1)
  const hero = unitFromCharacter(input.character, heroPos!, 1, input.heroController)
  state.units[hero.uid] = hero
  const specs = alignByGenus(input.opponents)
  const zone = [map.spawns.enemy[1]!, ...map.spawns.enemy]
  spawnHexes(state, zone, specs.length).forEach((pos, i) => {
    const u = unitFromOpponent(specs[i]!, `enemy${i}`, pos, 4)
    state.units[u.uid] = u
  })
  return state
}

// ---------- engine ----------

export const rngOf = (state: BattleState): SeededRng => createRng(state.rng)

function setPhase(state: BattleState, phase: Phase, out: GameEvent[]) {
  state.phase = phase
  out.push(ev(state, { kind: 'phase', phase }))
}

function checkEnd(state: BattleState, out: GameEvent[]): boolean {
  const alive = (side: Side) => livingUnits(state).some(u => u.side === side)
  if (!alive('enemy')) setPhase(state, 'victory', out)
  else if (!alive('player')) setPhase(state, 'defeat', out)
  else return false
  state.pending = undefined
  state.activeUnit = undefined
  state.queue = []
  return true
}

/** Each side rolls a die plus its best initiative bonus; the higher moves first. Rerolls ties. */
function rollInitiative(state: BattleState, rng: SeededRng, out: GameEvent[]) {
  const bonus = (side: Side) => Math.max(0, ...livingUnits(state).filter(u => u.side === side).map(u => modifierTotal(u, 'initiative')))
  for (;;) {
    const p = rng.roll(1)
    const e = rng.roll(1)
    const pt = p[0]! + bonus('player')
    const et = e[0]! + bonus('enemy')
    out.push(ev(state, { kind: 'roll', purpose: 'Initiative (you)', dice: p, total: pt }))
    out.push(ev(state, { kind: 'roll', purpose: 'Initiative (enemy)', dice: e, total: et }))
    if (pt !== et) {
      state.moveOrder = pt > et ? ['player', 'enemy'] : ['enemy', 'player']
      return
    }
  }
}

function sideQueue(state: BattleState): Id[] {
  return state.moveOrder.flatMap(side => livingUnits(state).filter(u => u.side === side).map(u => u.uid))
}

/** Highest adjDX acts first; ties keep a stable order. */
function actionQueue(state: BattleState): Id[] {
  return livingUnits(state)
    .map(u => ({ uid: u.uid, dx: adjDxOf(u) }))
    .sort((a, b) => b.dx - a.dx || a.uid.localeCompare(b.uid))
    .map(x => x.uid)
}

function moveUnit(state: BattleState, u: Unit, to: Hex, cost: number, out: GameEvent[]) {
  if (hexKey(to) === hexKey(u.pos)) return
  out.push(ev(state, { kind: 'move', unit: u.uid, from: u.pos, to }))
  u.pos = to
  u.turn.hexesMoved = cost
}

function faceUnit(state: BattleState, u: Unit, facing: Facing, out: GameEvent[]) {
  if (facing === u.facing) return
  u.facing = facing
  out.push(ev(state, { kind: 'face', unit: u.uid, facing }))
}

/** Records a choice; 'select' actions (defend, dodge) take effect at once. */
function selectAction(state: BattleState, u: Unit, key: string, rng: SeededRng, out: GameEvent[]) {
  const choice = parseChoiceKey(key)
  const def = ACTIONS[choice.actionId]
  u.turn.action = choice
  if (def?.timing === 'select') out.push(...def.resolve(contextFor(state, u, choice, rng), {}))
}

function resolveAction(state: BattleState, u: Unit, target: Id | HexKey | undefined, rng: SeededRng, out: GameEvent[]) {
  const choice = u.turn.action ?? { actionId: 'pass' }
  const def = ACTIONS[choice.actionId]
  u.turn.done = true
  if (!def || def.timing === 'select') return
  out.push(...def.resolve(contextFor(state, u, choice, rng), target ? toTarget(state, target) : { unit: u.uid, hex: u.pos }))
}

/** Valid targets for a unit's chosen action at resolve time. */
function currentTargets(state: BattleState, u: Unit, rng: SeededRng): (Id | HexKey)[] {
  const choice = u.turn.action
  const def = choice ? ACTIONS[choice.actionId] : undefined
  if (!choice || !def || def.timing === 'select') return []
  return def.targets(contextFor(state, u, choice, rng))
}

/**
 * Runs the battle forward until a human has to choose (state.pending)
 * or the battle ends. Returns everything that happened.
 */
export function advance(state: BattleState): GameEvent[] {
  const out: GameEvent[] = []
  const rng = rngOf(state)
  for (let guard = 0; guard < 10000; guard++) {
    if (state.pending || state.phase === 'victory' || state.phase === 'defeat') return out
    switch (state.phase) {
      case 'setup':
        if (checkEnd(state, out)) return out
        setPhase(state, 'initiative', out)
        break

      case 'initiative':
        rollInitiative(state, rng, out)
        for (const u of livingUnits(state)) u.turn = freshTurn()
        state.queue = sideQueue(state)
        setPhase(state, 'movement', out)
        break

      case 'movement': {
        const u = nextLiving(state)
        if (!u) {
          state.queue = livingUnits(state).map(x => x.uid)
          setPhase(state, 'actionSelect', out)
          break
        }
        state.activeUnit = u.uid
        u.turn.startedEngaged = isEngagedAt(state, u, u.pos)
        if (u.controller === 'human') {
          state.pending = { kind: 'move', unitUid: u.uid, reachable: [...movementOptions(state, u).keys()] }
          return out
        }
        const plan = planTurn(state, u, rng)
        const cost = movementOptions(state, u).get(hexKey(plan.to)) ?? 0
        moveUnit(state, u, plan.to, cost, out)
        faceUnit(state, u, plan.facing, out)
        u.turn.action = plan.choice
        u.turn.plannedTarget = plan.target
        state.queue.shift()
        break
      }

      case 'actionSelect': {
        const u = nextLiving(state)
        if (!u) {
          state.queue = actionQueue(state)
          setPhase(state, 'actionResolve', out)
          break
        }
        state.activeUnit = u.uid
        if (u.controller === 'human') {
          state.pending = { kind: 'chooseAction', unitUid: u.uid, actions: availableChoices(state, u, rng).map(choiceKey) }
          return out
        }
        const pick = chooseAction(state, u, rng)
        u.turn.plannedTarget = pick.target
        selectAction(state, u, choiceKey(pick.choice), rng, out)
        state.queue.shift()
        break
      }

      case 'actionResolve': {
        const u = nextLiving(state)
        if (!u) {
          setPhase(state, 'endOfTurn', out)
          break
        }
        state.activeUnit = u.uid
        const def = ACTIONS[u.turn.action?.actionId ?? 'pass']
        const targets = currentTargets(state, u, rng)
        const needsTarget = !!def && def.timing === 'resolve' && def.targeted
        if (needsTarget && !targets.length) {
          out.push(ev(state, { kind: 'narrate', text: `${u.name} has no target.` }))
          u.turn.done = true
          state.queue.shift()
          break
        }
        if (needsTarget && u.controller === 'human') {
          state.pending = { kind: 'chooseTarget', unitUid: u.uid, actionId: def.id, targets }
          return out
        }
        const target = needsTarget ? chooseTarget(state, u, u.turn.action!, rng) : undefined
        resolveAction(state, u, target, rng, out)
        state.queue.shift()
        if (checkEnd(state, out)) return out
        break
      }

      case 'endOfTurn':
        out.push(...tickEffects(state, rng))
        if (checkEnd(state, out)) return out
        state.round++
        state.activeUnit = undefined
        setPhase(state, 'initiative', out)
        break
    }
  }
  throw new Error('Battle engine did not settle')
}

/** First living unit in the queue; dead ones are dropped. */
function nextLiving(state: BattleState): Unit | undefined {
  while (state.queue.length) {
    const u = state.units[state.queue[0]!]
    if (u && isAlive(u)) return u
    state.queue.shift()
  }
  return undefined
}

// ---------- human input ----------

export type PlayerInput =
  | { kind: 'move'; to: Hex }
  | { kind: 'face'; facing: Facing }
  | { kind: 'action'; choice: string }
  | { kind: 'target'; target: Id | HexKey }

/** Applies the human's answer to state.pending, then runs on. Throws on input that doesn't fit. */
export function submit(state: BattleState, input: PlayerInput): GameEvent[] {
  const p = state.pending
  if (!p) throw new Error('Nothing is waiting for input')
  const u = state.units[p.unitUid]
  if (!u) throw new Error(`Unknown unit ${p.unitUid}`)
  const rng = rngOf(state)
  const out: GameEvent[] = []

  if (p.kind === 'move' && input.kind === 'move') {
    const key = hexKey(input.to)
    const cost = movementOptions(state, u).get(key)
    if (cost === undefined) throw new Error(`Can't move to ${key}`)
    moveUnit(state, u, input.to, cost, out)
    state.pending = { kind: 'chooseFacing', unitUid: u.uid }
    return out
  }
  if (p.kind === 'chooseFacing' && input.kind === 'face') {
    faceUnit(state, u, input.facing, out)
    state.pending = undefined
    state.queue.shift()
  } else if (p.kind === 'chooseAction' && input.kind === 'action') {
    if (!p.actions.includes(input.choice)) throw new Error(`Action not available: ${input.choice}`)
    selectAction(state, u, input.choice, rng, out)
    state.pending = undefined
    state.queue.shift()
  } else if (p.kind === 'chooseTarget' && input.kind === 'target') {
    if (!p.targets.includes(input.target)) throw new Error(`Not a valid target: ${input.target}`)
    state.pending = undefined
    resolveAction(state, u, input.target, rng, out)
    state.queue.shift()
    if (checkEnd(state, out)) return out
  } else {
    throw new Error(`Expected ${p.kind}, got ${input.kind}`)
  }
  return [...out, ...advance(state)]
}
