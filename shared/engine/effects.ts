import type {
  ActiveEffect, AreaShape, BattleState, Duration, EffectDef, GameEvent, Hex, Id, Rng, Unit
} from '../types'
import { hexDistance, hexKey, hexLine, rectangle } from '../utils/hex'
import { dealDamage, isAlive, livingUnits } from './combat'
import { ev, nextUid } from './events'

// The one path every outcome takes: attacks, spells, potions, scrolls,
// talents and terrain all produce EffectDefs handled here.

export type EffectSource = ActiveEffect['source']

const rollDice = (rng: Rng, d: { dice: number; mod: number }) =>
  Math.max(0, rng.roll(d.dice).reduce((a, b) => a + b, 0) + d.mod)

/** Rounds an effect lasts; undefined means it doesn't run out by itself. */
function roundsFor(d: Duration): number | undefined {
  if (d.type === 'rounds') return d.rounds
  if (d.type === 'maintained') return d.maxRounds
  return undefined
}

/** Hexes covered by an area centred on `center`; lines run from `origin` through it. */
export function areaHexes(state: BattleState, area: AreaShape, center: Hex, origin?: Hex): Hex[] {
  if (area.type === 'single') return [center]
  if (area.type === 'radius') {
    return rectangle(state.map.width, state.map.height).filter(h => hexDistance(h, center) <= area.radius)
  }
  if (!origin) return [center]
  // Extend the line past the target so its full length is covered.
  const far = { q: origin.q + (center.q - origin.q) * area.length, r: origin.r + (center.r - origin.r) * area.length }
  return hexLine(origin, far).slice(1, area.length + 1)
}

export interface ApplyOptions {
  /** Unit that caused it (attacker, caster, drinker). */
  by?: Unit
  target?: Unit
  hex?: Hex
}

/** Applies one effect definition to one unit (or hex, for terrain). */
export function applyEffect(state: BattleState, def: EffectDef, source: EffectSource, opts: ApplyOptions, rng: Rng): GameEvent[] {
  const { target, by } = opts
  switch (def.kind) {
    case 'damage': {
      if (!target || !isAlive(target)) return []
      return dealDamage(state, target, rollDice(rng, def.dice), source.name, by, def.ignoresArmor).events
    }
    case 'heal': {
      if (!target || !isAlive(target)) return []
      const before = target.stCurrent
      target.stCurrent = Math.min(target.base.ST, target.stCurrent + rollDice(rng, def.dice))
      return [ev(state, { kind: 'heal', unit: target.uid, amount: target.stCurrent - before, source: source.name })]
    }
    case 'modifier':
    case 'status':
    case 'grantAction':
      return target && isAlive(target) ? addUnitEffect(state, target, def, source, by) : []
    case 'remove': {
      if (!target) return []
      const gone = target.effects.filter(e =>
        (def.matchSource ? e.source.kind === def.matchSource : true)
        && (def.matchTag ? e.def.kind === 'modifier' && !!e.def.tags?.includes(def.matchTag) : true)
      )
      return gone.flatMap(e => removeEffect(state, target, e, 'dispelled'))
    }
    case 'terrain': {
      if (!opts.hex) return []
      const effect: ActiveEffect = { uid: nextUid(state, 'fx'), def, source, appliedBy: by?.uid, roundsLeft: roundsFor(def.duration) }
      for (const h of areaHexes(state, def.area, opts.hex, by?.pos)) {
        state.map.overlays[hexKey(h)] = { overlay: def.overlay, effectUid: effect.uid }
      }
      state.fieldEffects.push(effect)
      return [ev(state, { kind: 'effectAdded', effect })]
    }
    case 'summon':
      return [ev(state, { kind: 'debug', msg: `Summon not implemented yet: ${def.creatureId}` })]
  }
}

function addUnitEffect(state: BattleState, target: Unit, def: EffectDef, source: EffectSource, by?: Unit): GameEvent[] {
  const events: GameEvent[] = []
  if (def.kind === 'modifier') {
    const same = target.effects.filter(e => e.source.id === source.id && e.def.kind === 'modifier')
    if (same.length && def.stacking === 'ignore') return []
    if (same.length && def.stacking === 'refresh') {
      for (const e of same) e.roundsLeft = roundsFor(def.duration)
      return []
    }
    if (same.length && def.stacking === 'highest') {
      const total = (d: EffectDef) => (d.kind === 'modifier' ? d.modifiers.reduce((s, m) => s + Math.abs(m.value), 0) : 0)
      if (same.some(e => total(e.def) >= total(def))) return []
      for (const e of same) events.push(...removeEffect(state, target, e, 'dispelled'))
    }
  }
  if (def.kind === 'status' && target.statuses.includes(def.status)) {
    // Refresh the existing one instead of stacking a second.
    const existing = target.effects.find(e => e.def.kind === 'status' && e.def.status === def.status)
    if (existing) existing.roundsLeft = roundsFor(def.duration)
    return events
  }
  const duration: Duration = durationOf(def) ?? { type: 'permanent' }
  if (duration.type === 'instant') return events
  const effect: ActiveEffect = {
    uid: nextUid(state, 'fx'), def, source, appliedBy: by?.uid, targetUnit: target.uid, roundsLeft: roundsFor(duration)
  }
  target.effects.push(effect)
  events.push(ev(state, { kind: 'effectAdded', effect }))
  if (def.kind === 'status') {
    target.statuses.push(def.status)
    events.push(ev(state, { kind: 'status', unit: target.uid, status: def.status, on: true }))
  }
  return events
}

export function removeEffect(state: BattleState, u: Unit, e: ActiveEffect, reason: 'expired' | 'dispelled' | 'ownerDied'): GameEvent[] {
  u.effects = u.effects.filter(x => x.uid !== e.uid)
  const events = [ev(state, { kind: 'effectRemoved', effectUid: e.uid, reason })]
  if (e.def.kind === 'status') {
    const status = e.def.status
    if (!u.effects.some(x => x.def.kind === 'status' && x.def.status === status)) {
      u.statuses = u.statuses.filter(s => s !== status)
      events.push(ev(state, { kind: 'status', unit: u.uid, status, on: false }))
    }
  }
  return events
}

function removeFieldEffect(state: BattleState, e: ActiveEffect, reason: 'expired' | 'dispelled' | 'ownerDied'): GameEvent[] {
  state.fieldEffects = state.fieldEffects.filter(x => x.uid !== e.uid)
  state.map.overlays = Object.fromEntries(Object.entries(state.map.overlays).filter(([, o]) => o.effectUid !== e.uid))
  return [ev(state, { kind: 'effectRemoved', effectUid: e.uid, reason })]
}

/**
 * End of turn: poison and other ticking damage, maintained-spell upkeep,
 * then durations count down and expired effects drop.
 */
export function tickEffects(state: BattleState, rng: Rng): GameEvent[] {
  const events: GameEvent[] = []
  const owner = (id?: Id) => (id ? state.units[id] : undefined)
  // Maintained spells end when their caster dies.
  const ownerGone = (e: ActiveEffect) => {
    const o = owner(e.appliedBy)
    return isMaintained(e) && !!e.appliedBy && (!o || !isAlive(o))
  }

  for (const u of livingUnits(state)) {
    for (const e of [...u.effects]) {
      if (ownerGone(e)) {
        events.push(...removeEffect(state, u, e, 'ownerDied'))
        continue
      }
      // Damage over time (poison, burning) goes past armor (unverified).
      if (e.def.kind === 'status' && e.def.tickDamage && isAlive(u)) {
        events.push(...dealDamage(state, u, rollDice(rng, e.def.tickDamage), e.source.name, owner(e.appliedBy), true).events)
      }
      events.push(...payUpkeep(state, e))
      if (e.roundsLeft !== undefined && --e.roundsLeft <= 0) events.push(...removeEffect(state, u, e, 'expired'))
    }
  }
  for (const e of [...state.fieldEffects]) {
    if (ownerGone(e)) {
      events.push(...removeFieldEffect(state, e, 'ownerDied'))
      continue
    }
    events.push(...payUpkeep(state, e))
    if (e.roundsLeft !== undefined && --e.roundsLeft <= 0) events.push(...removeFieldEffect(state, e, 'expired'))
  }
  return events
}

function durationOf(def: EffectDef): Duration | undefined {
  return def.kind === 'modifier' || def.kind === 'status' || def.kind === 'terrain' || def.kind === 'summon' ? def.duration : undefined
}

const isMaintained = (e: ActiveEffect) => durationOf(e.def)?.type === 'maintained'

/** Maintained spells cost their caster ST every turn. */
function payUpkeep(state: BattleState, e: ActiveEffect): GameEvent[] {
  const d = durationOf(e.def)
  if (d?.type !== 'maintained' || !e.appliedBy) return []
  const caster = state.units[e.appliedBy]
  if (!caster || !isAlive(caster)) return []
  return dealDamage(state, caster, d.stPerTurn, `Maintaining ${e.source.name}`, undefined, true).events
}

/** Permanent effects a unit carries into battle: one per talent rank for stacking modifiers. */
export function talentEffects(u: Pick<Unit, 'uid' | 'talents'>, talents: Record<string, { name: string; effects: EffectDef[] }>): ActiveEffect[] {
  const out: ActiveEffect[] = []
  for (const t of u.talents) {
    const node = talents[t.id]
    if (!node) continue
    node.effects.forEach((def, i) => {
      const copies = def.kind === 'modifier' && def.stacking === 'stack' ? t.rank : 1
      for (let r = 0; r < copies; r++) {
        out.push({
          uid: `${u.uid}:${t.id}${t.weaponTalent ? `:${t.weaponTalent}` : ''}:${i}:${r}`,
          def,
          source: { kind: 'talent', id: t.id, name: node.name },
          targetUnit: u.uid
        })
      }
    })
  }
  return out
}
