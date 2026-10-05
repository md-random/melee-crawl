import type {
  BattleState, DiceExpr, Facing, GameEvent, GeneratedMap, Hex, HexKey, Id, ModifierCondition, StatKey, Unit
} from '../types'
import { ITEMS } from '../data/items'
import { DIRECTIONS, hexDistance, hexKey, hexToPixel, neighbors } from '../utils/hex'
import { generateMap } from './mapgen'
import { lineOfSight, reachable, type Obstructions } from './pathfinding'
import { adjustedDx, movementAllowance, type Loadout } from './rules'
import { ev } from './events'

// Combat math shared by actions, effects, the turn engine and the AI.

/**
 * Combat numbers not yet checked against the 2019 rules. Kept in one place
 * so they're easy to correct.
 */
export const COMBAT = {
  sideAttackBonus: 2,
  rearAttackBonus: 4,
  /** −1 to hit per this many hexes to a missile or thrown target. */
  rangePenaltyHexes: 2,
  /** Dice an attacker rolls against a defending (melee) or dodging (missile) target. */
  defendDice: 4,
  dodgeDice: 4,
  /** Furthest an engaged figure may move. */
  engagedMove: 1,
  /** ST lost when a spell's DX roll fails. */
  failedSpellST: 1
} as const

export type Arc = 'front' | 'side' | 'rear'
export type AttackKind = 'melee' | 'pole' | 'missile' | 'thrown'

/** The weapon a unit attacks with right now. */
export interface Attack {
  name: string
  damage: DiceExpr
  kind: AttackKind
  range: number
  /** Talent needed to use it without penalty; natural weapons have none. */
  talent?: Id
  itemUid?: Id
}

export const isRanged = (a: Attack) => a.kind === 'missile' || a.kind === 'thrown'

// ---------- units ----------

export const isAlive = (u: Unit) => u.stCurrent > 0
export const livingUnits = (s: BattleState) => Object.values(s.units).filter(isAlive)
export const enemiesOf = (s: BattleState, u: Unit) => livingUnits(s).filter(o => o.side !== u.side)
export const alliesOf = (s: BattleState, u: Unit) => livingUnits(s).filter(o => o.side === u.side && o.uid !== u.uid)

export function unitLoadout(u: Unit): Loadout {
  const def = (uid?: Id) => {
    const inst = u.inventory.find(i => i.uid === uid)
    return inst ? ITEMS[inst.defId] : undefined
  }
  const weapon = def(u.readyWeapon)
  const body = def(u.equipped.body)
  const off = def(u.equipped.offHand)
  return {
    weapon: weapon?.kind === 'weapon' ? weapon : undefined,
    armor: body?.kind === 'armor' ? body : undefined,
    shield: off?.kind === 'shield' ? off : undefined
  }
}

export function readyAttack(u: Unit): Attack | undefined {
  const natural = u.naturalWeapons.find(w => w.name === u.readyWeapon)
  if (natural) return { name: natural.name, damage: natural.damage, kind: 'melee', range: 1 }
  const w = unitLoadout(u).weapon
  if (!w) return undefined
  return { name: w.name, damage: w.damage, kind: w.attackKind, range: w.range ?? 1, talent: w.talent, itemUid: u.readyWeapon }
}

// ---------- modifiers and derived stats ----------

export interface StatContext {
  state: BattleState
  target?: Unit
  attack?: Attack
}

function conditionMet(c: ModifierCondition | undefined, u: Unit, ctx?: StatContext): boolean {
  if (!c) return true
  if ('weaponTalent' in c) return ctx?.attack?.talent === c.weaponTalent
  if ('attackKind' in c) return ctx?.attack?.kind === c.attackKind
  const target = ctx?.target
  if (!target || !ctx) return false
  if ('allyAdjacentToTarget' in c) {
    return alliesOf(ctx.state, u).some(a => a.uid !== target.uid && hexDistance(a.pos, target.pos) === 1)
  }
  return target.tags.includes(c.targetTag)
}

/** Sum of a unit's active modifiers to one stat, honoring conditions. */
export function modifierTotal(u: Unit, stat: StatKey, ctx?: StatContext): number {
  let sum = 0
  for (const e of u.effects) {
    if (e.def.kind !== 'modifier') continue
    for (const m of e.def.modifiers) if (m.stat === stat && conditionMet(m.when, u, ctx)) sum += m.value
  }
  return sum
}

export function maOf(u: Unit): number {
  return Math.max(0, movementAllowance(u.base.MA + modifierTotal(u, 'MA'), unitLoadout(u)))
}

export function adjDxOf(u: Unit, ctx?: StatContext): number {
  const attrs = { ST: u.base.ST, DX: u.base.DX + modifierTotal(u, 'DX', ctx), IQ: u.base.IQ }
  return adjustedDx(attrs, u.talents, unitLoadout(u)).value + modifierTotal(u, 'adjDX', ctx)
}

export function hitsStoppedOf(u: Unit): number {
  const gear = unitLoadout(u)
  return (gear.armor?.hitsStopped ?? 0) + (gear.shield?.hitsStopped ?? 0) + modifierTotal(u, 'hitsStopped')
}

/** Moving more than this rules out attacking, casting and other full options. */
export const halfMove = (u: Unit) => Math.floor(maOf(u) / 2)

// ---------- facing and arcs ----------

const DIR_ANGLES = DIRECTIONS.map(d => {
  const p = hexToPixel(d, 1)
  return Math.atan2(p.y, p.x)
})

/** The facing that points most directly from a toward b. */
export function directionTo(a: Hex, b: Hex): Facing {
  const pa = hexToPixel(a, 1)
  const pb = hexToPixel(b, 1)
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x)
  let best = 0
  let bestDiff = Infinity
  DIR_ANGLES.forEach((d, i) => {
    let diff = Math.abs(angle - d)
    if (diff > Math.PI) diff = 2 * Math.PI - diff
    if (diff < bestDiff - 1e-9) {
      bestDiff = diff
      best = i
    }
  })
  return best as Facing
}

/** Which arc of a figure at `pos` facing `facing` the hex `from` lies in: 3 front, 2 side, 1 rear hex. */
export function arcOf(pos: Hex, facing: Facing, from: Hex): Arc {
  const d = directionTo(pos, from)
  const diff = Math.min((d - facing + 6) % 6, (facing - d + 6) % 6)
  return diff <= 1 ? 'front' : diff === 2 ? 'side' : 'rear'
}

/**
 * Engaged: next to a living enemy that has you in its front arc.
 * Reading of the 2019 rules not yet checked.
 */
export function isEngagedAt(state: BattleState, u: Unit, pos: Hex): boolean {
  return enemiesOf(state, u).some(e => hexDistance(e.pos, pos) === 1 && arcOf(e.pos, e.facing, pos) === 'front')
}

/** Began the turn engaged and moved out of engagement: may not attack this turn. */
export function hasDisengaged(state: BattleState, u: Unit): boolean {
  return u.turn.startedEngaged && u.turn.hexesMoved > 0 && !isEngagedAt(state, u, u.pos)
}

// ---------- map ----------

const mapCache = new Map<string, GeneratedMap>()

/** The battle's terrain, regenerated from its seed and cached. */
export function mapOf(state: BattleState): GeneratedMap {
  const m = state.map
  const key = `${m.seed}:${m.biome}:${m.width}:${m.height}`
  let map = mapCache.get(key)
  if (!map) {
    map = generateMap({ seed: m.seed, biome: m.biome, width: m.width, height: m.height })
    mapCache.set(key, map)
  }
  return map
}

/** Other living units block movement and sight; the given uids are left out. */
export function obstructions(state: BattleState, ...except: Id[]): Obstructions {
  const occupied = new Set<HexKey>(livingUnits(state).filter(o => !except.includes(o.uid)).map(o => hexKey(o.pos)))
  return { occupied, overlays: state.map.overlays }
}

/** What blocks or stops a unit's movement: other units, and enemy front hexes, which engage and end movement. */
export function movementObstructions(state: BattleState, u: Unit): Obstructions {
  const stops = new Set<HexKey>()
  for (const e of enemiesOf(state, u)) {
    for (const n of neighbors(e.pos)) if (arcOf(e.pos, e.facing, n) === 'front') stops.add(hexKey(n))
  }
  return { ...obstructions(state, u.uid), stops }
}

/** Where a unit may move this turn, with the cost of each hex. Engaged units shift at most one hex. */
export function movementOptions(state: BattleState, u: Unit): Map<HexKey, number> {
  const map = mapOf(state)
  if (isEngagedAt(state, u, u.pos)) return reachable(map, u.pos, COMBAT.engagedMove, obstructions(state, u.uid))
  return reachable(map, u.pos, maOf(u), movementObstructions(state, u))
}

export function canSee(state: BattleState, from: Unit, to: Hex, ...except: Id[]): boolean {
  return lineOfSight(mapOf(state), from.pos, to, obstructions(state, from.uid, ...except))
}

// ---------- dice ----------

const sumCache = new Map<number, number[]>()

/** Probability of each total of n six-sided dice, indexed by total. */
export function diceDistribution(n: number): number[] {
  let dist = sumCache.get(n)
  if (!dist) {
    dist = [1]
    for (let i = 0; i < n; i++) {
      const next = new Array<number>(dist.length + 6).fill(0)
      dist.forEach((p, s) => {
        for (let f = 1; f <= 6; f++) next[s + f]! += p / 6
      })
      dist = next
    }
    sumCache.set(n, dist)
  }
  return dist
}

/** P(sum of n d6 ≤ t). */
export function probAtMost(n: number, t: number): number {
  const dist = diceDistribution(n)
  let p = 0
  for (let s = 0; s <= Math.min(t, dist.length - 1); s++) p += dist[s]!
  return p
}

/** Expected max(0, roll + mod − stopped), and the chance that value reaches `atLeast`. */
export function damageOdds(d: DiceExpr, bonus: number, stopped: number, atLeast: number): { mean: number; reach: number } {
  const dist = diceDistribution(d.dice)
  let mean = 0
  let reach = 0
  dist.forEach((p, s) => {
    const dmg = Math.max(0, s + d.mod + bonus - stopped)
    mean += p * dmg
    if (dmg >= atLeast) reach += p
  })
  return { mean, reach }
}

// ---------- attacks ----------

/** Number to roll at or under on the attack dice. */
export function toHitTarget(state: BattleState, attacker: Unit, target: Unit, attack: Attack): number {
  const ctx = { state, target, attack }
  let t = adjDxOf(attacker, ctx) + modifierTotal(attacker, 'toHit', ctx)
  const arc = arcOf(target.pos, target.facing, attacker.pos)
  if (arc === 'side') t += COMBAT.sideAttackBonus
  else if (arc === 'rear') t += COMBAT.rearAttackBonus
  if (isRanged(attack)) t -= Math.floor(hexDistance(attacker.pos, target.pos) / COMBAT.rangePenaltyHexes)
  return t
}

export function attackDice(target: Unit, attack: Attack): number {
  if (!isRanged(attack) && target.statuses.includes('defending')) return COMBAT.defendDice
  if (isRanged(attack) && target.statuses.includes('dodging')) return COMBAT.dodgeDice
  return 3
}

/** Chance to hit. On 3 dice, 3–4 always hit and 17–18 always miss. */
export function hitChance(dice: number, target: number): number {
  if (dice === 3) return probAtMost(3, Math.min(16, Math.max(4, target)))
  return probAtMost(dice, target)
}

/** Enemies this attack can reach from the unit's current hex and facing. */
export function attackTargets(state: BattleState, u: Unit, attack: Attack): Unit[] {
  return enemiesOf(state, u).filter(e => {
    if (arcOf(u.pos, u.facing, e.pos) !== 'front') return false
    const dist = hexDistance(u.pos, e.pos)
    if (!isRanged(attack)) return dist === 1
    return dist <= attack.range && canSee(state, u, e.pos, e.uid)
  })
}

/** Expected result of one attack, for the AI and for previews. */
export function attackOdds(state: BattleState, attacker: Unit, target: Unit, attack: Attack) {
  const chance = hitChance(attackDice(target, attack), toHitTarget(state, attacker, target, attack))
  const bonus = modifierTotal(attacker, 'damage', { state, target, attack })
  const odds = damageOdds(attack.damage, bonus, hitsStoppedOf(target), target.stCurrent)
  return { hitChance: chance, damage: chance * odds.mean, kill: chance * odds.reach }
}

/**
 * Applies damage, emits the damage and any death event, and records the
 * hero's killer. Returns the ST actually lost.
 */
export function dealDamage(
  state: BattleState, target: Unit, raw: number, source: string, by?: Unit, ignoresArmor = false
): { lost: number; events: GameEvent[] } {
  const stopped = ignoresArmor ? 0 : Math.min(raw, hitsStoppedOf(target))
  const lost = Math.max(0, raw - stopped)
  const events: GameEvent[] = []
  if (!isAlive(target)) return { lost: 0, events }
  target.stCurrent -= lost
  events.push(ev(state, { kind: 'damage', unit: target.uid, amount: lost, stopped, source }))
  if (!isAlive(target)) events.push(...killUnit(state, target, by))
  return { lost, events }
}

export function killUnit(state: BattleState, u: Unit, by?: Unit): GameEvent[] {
  u.statuses = []
  if (u.origin.type === 'character' && by) {
    state.killedBy = { unitUid: by.uid, name: by.name, talents: by.talents.map(t => t.id) }
  }
  return [
    ev(state, { kind: 'death', unit: u.uid, by: by?.uid }),
    ev(state, { kind: 'narrate', text: `${u.name} falls.` })
  ]
}
