import type { AiProfileId, BattleState, ChosenAction, Facing, Hex, HexKey, Id, Rng, Unit } from '../types'
import { fromKey, hexDistance } from '../utils/hex'
import type { SeededRng } from '../utils/rng'
import { ACTIONS, availableChoices, contextFor, toTarget } from './actions'
import { alliesOf, arcOf, enemiesOf, isRanged, maOf, movementOptions, readyAttack } from './combat'

/**
 * How much a profile cares about each factor. Profiles are data: a new
 * profile is a new row, not new code. Starting values, ours, to be tuned.
 */
export interface AiWeights {
  /** Per expected ST of damage dealt. */
  damage: number
  /** Per chance of killing the target. */
  kill: number
  /** Per expected ST of damage avoided (defend, dodge). */
  protection: number
  /** Per point of exposure at the end hex: enemies in front 1, side 2, rear 3. */
  exposure: number
  /** Per ally next to the enemy we end up next to. */
  flank: number
  /** Per hex away from the preferred distance to the nearest enemy. */
  approach: number
  /** Distance to the nearest enemy this profile likes to fight from. */
  preferredRange: number
  /** Extra weight on exposure as ST runs low: exposure × (1 + caution × lost fraction). */
  caution: number
}

export const AI_PROFILES: Record<AiProfileId, AiWeights> = {
  brute: { damage: 1, kill: 3, protection: 0.4, exposure: 0.15, flank: 0.2, approach: 0.6, preferredRange: 1, caution: 0 },
  duelist: { damage: 1, kill: 2, protection: 1, exposure: 0.5, flank: 0.3, approach: 0.4, preferredRange: 1, caution: 1 },
  skirmisher: { damage: 0.9, kill: 2, protection: 0.7, exposure: 0.8, flank: 0.6, approach: 0.3, preferredRange: 1, caution: 1.5 },
  packHunter: { damage: 1, kill: 3, protection: 0.3, exposure: 0.3, flank: 1, approach: 0.6, preferredRange: 1, caution: 0.3 },
  archer: { damage: 1, kill: 2, protection: 0.6, exposure: 1, flank: 0.1, approach: 0.4, preferredRange: 6, caution: 1 },
  caster: { damage: 1, kill: 2, protection: 0.6, exposure: 1.2, flank: 0.1, approach: 0.4, preferredRange: 4, caution: 1.2 }
}

const weightsOf = (u: Unit) => AI_PROFILES[u.aiProfile ?? 'duelist']

/** How exposed a unit would be at this hex and facing. */
export function exposure(state: BattleState, u: Unit, pos: Hex, facing: Facing): number {
  let total = 0
  for (const e of enemiesOf(state, u)) {
    const dist = hexDistance(e.pos, pos)
    if (dist === 1) {
      const arc = arcOf(pos, facing, e.pos)
      total += arc === 'front' ? 1 : arc === 'side' ? 2 : 3
    } else {
      const a = readyAttack(e)
      if (a && isRanged(a) && dist <= a.range) total += 0.5
      else if (dist <= maOf(e) + 1) total += 0.2
    }
  }
  return total
}

/** Allies already next to an enemy that this hex is also next to. */
function flank(state: BattleState, u: Unit, pos: Hex): number {
  let n = 0
  for (const e of enemiesOf(state, u)) {
    if (hexDistance(e.pos, pos) !== 1) continue
    n += alliesOf(state, u).filter(a => hexDistance(a.pos, e.pos) === 1).length
  }
  return n
}

function positionScore(state: BattleState, u: Unit, pos: Hex, facing: Facing): number {
  const w = weightsOf(u)
  const enemies = enemiesOf(state, u)
  if (!enemies.length) return 0
  const nearest = Math.min(...enemies.map(e => hexDistance(e.pos, pos)))
  const hurt = 1 - u.stCurrent / u.base.ST
  return -w.exposure * exposure(state, u, pos, facing) * (1 + w.caution * hurt)
    + w.flank * flank(state, u, pos)
    - w.approach * Math.abs(nearest - w.preferredRange)
}

interface Scored { choice: ChosenAction; target?: Id | HexKey; score: number }

/** Best action and target for a unit as it stands (its pos, facing and hexesMoved). */
function bestAction(state: BattleState, actor: Unit, rng: Rng): Scored {
  const w = weightsOf(actor)
  let best: Scored = { choice: { actionId: 'pass' }, score: 0 }
  for (const choice of availableChoices(state, actor, rng)) {
    const def = ACTIONS[choice.actionId]
    if (!def) continue
    const ctx = contextFor(state, actor, choice, rng)
    const targets: (Id | HexKey | undefined)[] = def.targets(ctx)
    for (const t of targets.length ? targets : [undefined]) {
      const est = def.estimate(ctx, t ? toTarget(state, t) : { unit: actor.uid, hex: actor.pos })
      const cost = def.cost(ctx)
      const score = w.damage * est.damage + w.kill * est.kill + est.heal + w.protection * est.protection + est.utility
        - (cost.st ?? 0) * 0.5 - (cost.consumesItem ? 0.5 : 0)
      if (score > best.score + 1e-9) best = { choice, target: t, score }
    }
  }
  return best
}

export interface AiPlan {
  to: Hex
  facing: Facing
  choice: ChosenAction
  target?: Id | HexKey
  score: number
}

/**
 * Movement-time plan: tries every reachable hex and facing, scores the best
 * action from there plus how good the position is, and keeps the top one.
 * Exact ties are broken with the battle's seeded RNG, so replays match.
 */
export function planTurn(state: BattleState, u: Unit, rng: SeededRng): AiPlan {
  const options = movementOptions(state, u)
  let best: AiPlan[] = []
  let bestScore = -Infinity
  for (const [key, cost] of options) {
    const pos = fromKey(key)
    for (let f = 0; f < 6; f++) {
      const facing = f as Facing
      const ghost: Unit = { ...u, pos, facing, turn: { ...u.turn, hexesMoved: cost } }
      const action = bestAction(state, ghost, rng)
      const score = action.score + positionScore(state, u, pos, facing)
      const plan = { to: pos, facing, choice: action.choice, target: action.target, score }
      if (score > bestScore + 1e-9) {
        bestScore = score
        best = [plan]
      } else if (Math.abs(score - bestScore) <= 1e-9) best.push(plan)
    }
  }
  if (!best.length) return { to: u.pos, facing: u.facing, choice: { actionId: 'pass' }, score: 0 }
  return best.length === 1 ? best[0]! : rng.pick(best)
}

/** Action choice at the select step: keeps the plan if still possible, otherwise picks again. */
export function chooseAction(state: BattleState, u: Unit, rng: Rng): { choice: ChosenAction; target?: Id | HexKey } {
  const planned = u.turn.action
  if (planned) {
    const def = ACTIONS[planned.actionId]
    if (def?.isAvailable(contextFor(state, u, planned, rng))) return { choice: planned, target: u.turn.plannedTarget }
  }
  const best = bestAction(state, u, rng)
  return { choice: best.choice, target: best.target }
}

/** Target at resolve time: the planned one if still valid, otherwise the best by estimate. */
export function chooseTarget(state: BattleState, u: Unit, choice: ChosenAction, rng: Rng): Id | HexKey | undefined {
  const def = ACTIONS[choice.actionId]
  if (!def) return undefined
  const ctx = contextFor(state, u, choice, rng)
  const targets = def.targets(ctx)
  if (!targets.length) return undefined
  if (u.turn.plannedTarget && targets.includes(u.turn.plannedTarget)) return u.turn.plannedTarget
  const w = weightsOf(u)
  let best = targets[0]!
  let bestScore = -Infinity
  for (const t of targets) {
    const est = def.estimate(ctx, toTarget(state, t))
    const score = w.damage * est.damage + w.kill * est.kill + est.heal + est.utility
    if (score > bestScore) {
      bestScore = score
      best = t
    }
  }
  return best
}

