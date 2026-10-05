import type {
  ActionContext, ActionDef, ActionEstimate, ActionTarget, BattleState, ChosenAction, ConsumableDef, EffectDef,
  GameEvent, Hex, HexKey, Id, SpellDef, Unit
} from '../types'
import { ITEMS } from '../data/items'
import { SPELLS } from '../data/spells'
import { fromKey, hexDistance, hexKey } from '../utils/hex'
import {
  adjDxOf, attackDice, attackOdds, attackTargets, canSee, dealDamage, enemiesOf, halfMove, hasDisengaged,
  hitChance, isAlive, isEngagedAt, isRanged, livingUnits, modifierTotal, readyAttack, toHitParts, toHitTarget, COMBAT
} from './combat'
import { applyEffect, areaHexes } from './effects'
import { ev } from './events'

// Every combat choice as an ActionDef. Spells and consumables are generic
// actions over data (SpellDef, ConsumableDef), so new ones need no code here.

const NONE: ActionEstimate = { hitChance: 0, damage: 0, kill: 0, heal: 0, protection: 0, utility: 0 }

const plain = (id: Id) => (): ChosenAction[] => [{ actionId: id }]

/** Moving more than half MA rules out full options. */
function movedTooFar(ctx: ActionContext): string | undefined {
  const moved = ctx.actor.turn.hexesMoved
  const half = halfMove(ctx.actor)
  return moved > half ? `You moved ${moved} hexes; this needs ${half} or fewer (half your MA).` : undefined
}

const DISENGAGED = 'You left an enemy\'s front hexes this turn (disengaged), so you can\'t do this until next turn.'

/** Builds an action whose yes/no check always matches its reason. */
function action(def: Omit<ActionDef, 'isAvailable'>): ActionDef {
  return { ...def, isAvailable: ctx => !def.unavailable(ctx) }
}
const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0)

/** Resolves a target id: unit uids have no comma, hex keys do. */
export function toTarget(state: BattleState, t: Id | HexKey): ActionTarget {
  if (t.includes(',')) return { hex: fromKey(t as HexKey) }
  const u = state.units[t]
  return u ? { unit: u.uid, hex: u.pos } : {}
}

// ---------- attack ----------

const attack = action({
  id: 'attack',
  label: 'Attack',
  icon: '⚔',
  hint: 'Strike an enemy in your front hexes, or shoot one in range.',
  timing: 'resolve',
  targeted: true,
  choices: plain('attack'),
  unavailable(ctx) {
    const a = readyAttack(ctx.actor)
    if (!a) return 'You have no weapon ready.'
    const far = movedTooFar(ctx)
    if (far) return far
    if (hasDisengaged(ctx.state, ctx.actor)) return DISENGAGED
    // Bows and thrown weapons can't be used while engaged (unverified).
    if (isRanged(a) && isEngagedAt(ctx.state, ctx.actor, ctx.actor.pos)) return 'You can\'t shoot or throw while engaged.'
    if (attackTargets(ctx.state, ctx.actor, a).length) return undefined
    return isRanged(a)
      ? `No enemy within ${a.range} hexes in sight and in your front hexes.`
      : 'No enemy next to you in your 3 front hexes. Face one when you move.'
  },
  targets(ctx) {
    const a = readyAttack(ctx.actor)
    return a ? attackTargets(ctx.state, ctx.actor, a).map(u => u.uid) : []
  },
  cost: () => ({}),
  estimate(ctx, target) {
    const a = readyAttack(ctx.actor)
    const t = target.unit ? ctx.state.units[target.unit] : undefined
    if (!a || !t) return NONE
    const odds = attackOdds(ctx.state, ctx.actor, t, a)
    return { ...NONE, hitChance: odds.hitChance, damage: odds.damage, kill: odds.kill }
  },
  resolve(ctx, target) {
    const { state, actor, rng } = ctx
    const a = readyAttack(actor)
    const t = target.unit ? state.units[target.unit] : undefined
    if (!a || !t || !isAlive(t)) return [ev(state, { kind: 'narrate', text: `${actor.name} has no one to attack.` })]
    const dice = attackDice(t, a)
    const parts = toHitParts(state, actor, t, a)
    const need = parts.reduce((s, p) => s + p.value, 0)
    const note = dice === 3 ? undefined : `${t.name} is ${isRanged(a) ? 'dodging' : 'defending'}: ${dice} dice`
    const rolled = rng.roll(dice)
    const total = sum(rolled)
    // On 3 dice: 3 triples damage, 4 doubles it, 17 drops the weapon, 18 breaks it (unverified).
    const special = dice === 3
      ? total === 3 ? 'triple' : total === 4 ? 'double' : total === 17 ? 'drop' : total === 18 ? 'fumble' : undefined
      : undefined
    const hit = special === 'triple' || special === 'double' || (total <= need && special !== 'drop' && special !== 'fumble')
    const events: GameEvent[] = [
      ev(state, { kind: 'attack', unit: actor.uid, target: t.uid, weapon: a.name }),
      ev(state, { kind: 'roll', purpose: `${actor.name} attacks ${t.name}`, actor: actor.uid, dice: rolled, total, target: need, success: hit, special, parts, note })
    ]
    if (hit) {
      const mult = special === 'triple' ? 3 : special === 'double' ? 2 : 1
      const dmgDice = rng.roll(a.damage.dice)
      const bonus = modifierTotal(actor, 'damage', { state, target: t, attack: a })
      const raw = Math.max(0, (sum(dmgDice) + a.damage.mod + bonus) * mult)
      const dmgParts = [
        { label: `${a.damage.dice} dice`, value: sum(dmgDice) },
        ...(a.damage.mod ? [{ label: a.name, value: a.damage.mod }] : []),
        ...(bonus ? [{ label: 'Damage bonus', value: bonus }] : [])
      ]
      const dmgNote = mult > 1 ? `${special} damage: ×${mult}` : undefined
      events.push(ev(state, { kind: 'roll', purpose: `${a.name} damage`, actor: actor.uid, dice: dmgDice, total: raw, parts: dmgParts, note: dmgNote }))
      events.push(...dealDamage(state, t, raw, a.name, actor).events)
    } else {
      events.push(ev(state, { kind: 'narrate', text: `${actor.name} misses ${t.name}.` }))
    }
    if (special === 'drop' || special === 'fumble') events.push(...loseWeapon(state, actor, special))
    // A thrown weapon leaves the hand; it's recovered after the battle (unverified).
    if (a.kind === 'thrown' && actor.readyWeapon === a.itemUid) actor.readyWeapon = undefined
    return events
  }
})

/** 17 drops the weapon, 18 breaks it. Natural weapons can't be lost. */
function loseWeapon(state: BattleState, u: Unit, how: 'drop' | 'fumble'): GameEvent[] {
  const uid = u.readyWeapon
  if (!uid || !u.inventory.some(i => i.uid === uid)) return []
  u.readyWeapon = undefined
  if (how === 'fumble') {
    u.inventory = u.inventory.filter(i => i.uid !== uid)
    if (u.equipped.mainHand === uid) u.equipped.mainHand = undefined
  }
  return [ev(state, { kind: 'narrate', text: how === 'drop' ? `${u.name} drops their weapon.` : `${u.name}'s weapon breaks.` })]
}

// ---------- defend / dodge ----------

/** Expected damage from enemies that could attack this unit next, and how much rolling one more die cuts it. */
function protectionFrom(ctx: ActionContext, ranged: boolean): number {
  const { state, actor } = ctx
  let saved = 0
  for (const e of enemiesOf(state, actor)) {
    const a = readyAttack(e)
    if (!a || isRanged(a) !== ranged) continue
    const reachable = ranged
      ? hexDistance(e.pos, actor.pos) <= a.range && canSee(state, e, actor.pos, actor.uid)
      : hexDistance(e.pos, actor.pos) <= 1
    if (!reachable) continue
    const need = toHitTarget(state, e, actor, a)
    const odds = attackOdds(state, e, actor, a)
    const p3 = hitChance(3, need)
    const p4 = hitChance(4, need)
    saved += p3 > 0 ? odds.damage * (1 - p4 / p3) : 0
  }
  return saved
}

function statusAction(id: 'defend' | 'dodge', label: string, icon: string, status: 'defending' | 'dodging', hint: string): ActionDef {
  const ranged = id === 'dodge'
  return action({
    id,
    label,
    icon,
    hint,
    timing: 'select',
    targeted: false,
    choices: plain(id),
    unavailable: movedTooFar,
    targets: () => [],
    cost: () => ({}),
    estimate: ctx => ({ ...NONE, protection: protectionFrom(ctx, ranged) }),
    resolve(ctx) {
      const def: EffectDef = { kind: 'status', status, duration: { type: 'rounds', rounds: 1 } }
      return [
        ...applyEffect(ctx.state, def, { kind: 'action', id, name: label }, { target: ctx.actor, by: ctx.actor }, ctx.rng),
        ev(ctx.state, { kind: 'narrate', text: `${ctx.actor.name} ${id === 'defend' ? 'defends' : 'dodges'}.` })
      ]
    }
  })
}

// ---------- ready weapon ----------

const readyWeapon = action({
  id: 'readyWeapon',
  label: 'Ready weapon',
  icon: '🤚',
  hint: 'Switch to another weapon you carry.',
  timing: 'resolve',
  targeted: false,
  choices: actor => actor.inventory
    .filter(i => i.uid !== actor.readyWeapon && ITEMS[i.defId]?.kind === 'weapon')
    .map(i => ({ actionId: 'readyWeapon', itemUid: i.uid })),
  unavailable: ctx => movedTooFar(ctx)
    ?? (ctx.actor.inventory.some(i => i.uid === ctx.choice.itemUid) ? undefined : 'You don\'t carry that weapon.'),
  targets: () => [],
  cost: () => ({}),
  // Worth something only when the unit has nothing to attack with.
  estimate: ctx => ({ ...NONE, utility: readyAttack(ctx.actor) ? 0 : 1 }),
  resolve(ctx) {
    const inst = ctx.actor.inventory.find(i => i.uid === ctx.choice.itemUid)
    if (!inst) return []
    ctx.actor.readyWeapon = inst.uid
    return [ev(ctx.state, { kind: 'narrate', text: `${ctx.actor.name} readies ${ITEMS[inst.defId]?.name ?? 'a weapon'}.` })]
  }
})

// ---------- pass ----------

const pass = action({
  id: 'pass',
  label: 'Do nothing',
  icon: '⏸',
  hint: 'End your turn without acting.',
  timing: 'resolve',
  targeted: false,
  choices: plain('pass'),
  unavailable: () => undefined,
  targets: () => [],
  cost: () => ({}),
  estimate: () => NONE,
  resolve: () => []
})

// ---------- effects from data (spells, consumables) ----------

/** Units a data-driven effect list would touch, and its expected value from the actor's side. */
function estimateEffects(state: BattleState, actor: Unit, effects: EffectDef[], affected: Unit[]): ActionEstimate {
  const out = { ...NONE, hitChance: 1 }
  for (const u of affected) {
    const enemy = u.side !== actor.side
    for (const def of effects) {
      if (def.kind === 'damage') {
        const mean = def.dice.dice * 3.5 + def.dice.mod
        const dmg = Math.min(u.stCurrent, Math.max(0, mean))
        out.damage += enemy ? dmg : -dmg
        if (enemy && mean >= u.stCurrent) out.kill = Math.max(out.kill, 0.5)
      } else if (def.kind === 'heal') {
        const heal = Math.min(u.base.ST - u.stCurrent, Math.max(0, def.dice.dice * 3.5 + def.dice.mod))
        out.heal += enemy ? -heal : heal
      } else if (def.kind === 'modifier') {
        const rounds = def.duration.type === 'rounds' ? def.duration.rounds : 3
        const value = def.modifiers.reduce((s, m) => s + m.value, 0) * Math.min(rounds, 3) * 0.5
        out.utility += enemy ? -value : value
      } else if (def.kind === 'status') {
        out.utility += enemy ? 1 : 0
      }
    }
  }
  return out
}

function unitsInArea(state: BattleState, hexes: Hex[]): Unit[] {
  const keys = new Set(hexes.map(hexKey))
  return livingUnits(state).filter(u => keys.has(hexKey(u.pos)))
}

const spellOf = (choice: ChosenAction): SpellDef | undefined => (choice.spellId ? SPELLS[choice.spellId] : undefined)

const castSpell: ActionDef = action({
  id: 'castSpell',
  label: 'Cast spell',
  icon: '✨',
  hint: 'Cast a spell you know. Costs ST; a failed roll still costs 1.',
  timing: 'resolve',
  targeted: true,
  choices: actor => actor.spells.map(spellId => ({ actionId: 'castSpell', spellId })),
  unavailable(ctx) {
    const s = spellOf(ctx.choice)
    if (!s) return 'Unknown spell.'
    const far = movedTooFar(ctx)
    if (far) return far
    if (hasDisengaged(ctx.state, ctx.actor)) return DISENGAGED
    if (ctx.actor.base.IQ < s.minIQ) return `${s.name} needs IQ ${s.minIQ}.`
    if (ctx.actor.stCurrent <= s.stCost) return `${s.name} costs ${s.stCost} ST; you have ${ctx.actor.stCurrent}.`
    return castSpell.targets(ctx).length ? undefined : `No target within ${s.range} hexes in sight.`
  },
  targets(ctx) {
    const s = spellOf(ctx.choice)
    if (!s) return []
    if (s.target === 'self' || s.range === 0) return [ctx.actor.uid]
    const inRange = livingUnits(ctx.state).filter(u =>
      hexDistance(ctx.actor.pos, u.pos) <= s.range && (u.uid === ctx.actor.uid || canSee(ctx.state, ctx.actor, u.pos, u.uid))
    )
    // Hex spells aim at a unit's hex; that keeps the choice list short.
    return s.target === 'unit' ? inRange.map(u => u.uid) : inRange.map(u => hexKey(u.pos))
  },
  cost: ctx => ({ st: spellOf(ctx.choice)?.stCost ?? 0 }),
  estimate(ctx, target) {
    const s = spellOf(ctx.choice)
    if (!s || !target.hex) return NONE
    const affected = unitsInArea(ctx.state, areaHexes(ctx.state, s.area, target.hex, ctx.actor.pos))
    const est = estimateEffects(ctx.state, ctx.actor, s.effects, affected)
    const chance = hitChance(3, adjDxOf(ctx.actor))
    return {
      hitChance: chance,
      damage: est.damage * chance,
      kill: est.kill * chance,
      heal: est.heal * chance,
      protection: 0,
      utility: est.utility * chance
    }
  },
  resolve(ctx, target) {
    const { state, actor, rng } = ctx
    const s = spellOf(ctx.choice)
    if (!s || !target.hex) return []
    const need = adjDxOf(actor)
    const rolled = rng.roll(3)
    const total = sum(rolled)
    const ok = total <= 4 || (total <= need && total < 17)
    const events: GameEvent[] = [
      ev(state, { kind: 'roll', purpose: `${actor.name} casts ${s.name}`, actor: actor.uid, dice: rolled, total, target: need, success: ok })
    ]
    if (!ok) {
      events.push(ev(state, { kind: 'narrate', text: `${actor.name}'s ${s.name} fails.` }))
      events.push(...dealDamage(state, actor, COMBAT.failedSpellST, `Failed ${s.name}`, undefined, true).events)
      return events
    }
    events.push(...dealDamage(state, actor, s.stCost, s.name, undefined, true).events)
    events.push(ev(state, { kind: 'narrate', text: `${actor.name} casts ${s.name}.` }))
    const source = { kind: 'spell' as const, id: s.id, name: s.name }
    const hexes = areaHexes(state, s.area, target.hex, actor.pos)
    for (const def of s.effects) {
      if (def.kind === 'terrain') events.push(...applyEffect(state, def, source, { by: actor, hex: target.hex }, rng))
      else for (const u of unitsInArea(state, hexes)) events.push(...applyEffect(state, def, source, { by: actor, target: u }, rng))
    }
    return events
  }
})

function consumableOf(actor: Unit, choice: ChosenAction): ConsumableDef | undefined {
  const inst = actor.inventory.find(i => i.uid === choice.itemUid)
  const def = inst ? ITEMS[inst.defId] : undefined
  return def && (def.kind === 'potion' || def.kind === 'scroll') ? def : undefined
}

const useItem = action({
  id: 'useItem',
  label: 'Use item',
  icon: '🧪',
  hint: 'Drink a potion or read a scroll from your belt.',
  timing: 'resolve',
  targeted: true,
  choices: actor => actor.equipped.belt
    .filter(uid => consumableOf(actor, { actionId: 'useItem', itemUid: uid }))
    .map(itemUid => ({ actionId: 'useItem', itemUid })),
  unavailable: ctx => movedTooFar(ctx) ?? (consumableOf(ctx.actor, ctx.choice) ? undefined : 'That item isn\'t on your belt.'),
  targets(ctx) {
    const c = consumableOf(ctx.actor, ctx.choice)
    if (!c) return []
    if (c.target === 'self') return [ctx.actor.uid]
    // Items reach adjacent hexes only (unverified).
    const near = livingUnits(ctx.state).filter(u => hexDistance(u.pos, ctx.actor.pos) <= 1)
    return c.target === 'unit' ? near.map(u => u.uid) : near.map(u => hexKey(u.pos))
  },
  cost: () => ({ consumesItem: true }),
  estimate(ctx, target) {
    const c = consumableOf(ctx.actor, ctx.choice)
    if (!c || !target.hex) return NONE
    return estimateEffects(ctx.state, ctx.actor, c.effects, unitsInArea(ctx.state, [target.hex]))
  },
  resolve(ctx, target) {
    const { state, actor, rng } = ctx
    const c = consumableOf(actor, ctx.choice)
    if (!c || !target.hex) return []
    const uid = ctx.choice.itemUid
    actor.inventory = actor.inventory.filter(i => i.uid !== uid)
    actor.equipped.belt = actor.equipped.belt.filter(b => b !== uid)
    const events = [ev(state, { kind: 'narrate', text: `${actor.name} uses ${c.name}.` })]
    const source = { kind: 'item' as const, id: c.id, name: c.name }
    for (const def of c.effects) {
      if (def.kind === 'terrain') events.push(...applyEffect(state, def, source, { by: actor, hex: target.hex }, rng))
      else for (const u of unitsInArea(state, [target.hex])) events.push(...applyEffect(state, def, source, { by: actor, target: u }, rng))
    }
    return events
  }
})

// ---------- registry ----------

export const ACTIONS: Record<Id, ActionDef> = Object.fromEntries([
  attack,
  statusAction('defend', 'Defend', '🛡', 'defending', 'Melee attackers roll 4 dice against you this turn instead of 3.'),
  statusAction('dodge', 'Dodge', '💨', 'dodging', 'Missile and thrown attackers roll 4 dice against you this turn.'),
  readyWeapon,
  castSpell,
  useItem,
  pass
].map(a => [a.id, a]))

/** Choice key used in PendingInput: 'attack', 'castSpell:<spellId>', 'useItem:<itemUid>'. */
export function choiceKey(c: ChosenAction): string {
  const param = c.spellId ?? c.itemUid
  return param ? `${c.actionId}:${param}` : c.actionId
}

export function parseChoiceKey(key: string): ChosenAction {
  const [actionId, param] = key.split(':') as [Id, Id | undefined]
  if (!param) return { actionId }
  return actionId === 'castSpell' ? { actionId, spellId: param } : { actionId, itemUid: param }
}

/** Actions granted by talents or items (grantAction effects) that exist in the registry. */
function grantedActions(u: Unit): ActionDef[] {
  return u.effects
    .flatMap(e => (e.def.kind === 'grantAction' ? [ACTIONS[e.def.actionId]] : []))
    .filter((a): a is ActionDef => !!a)
}

export function contextFor(state: BattleState, actor: Unit, choice: ChosenAction, rng: ActionContext['rng']): ActionContext {
  return { state, actor, choice, rng }
}

const actionsFor = (actor: Unit) => [...new Set([...Object.values(ACTIONS), ...grantedActions(actor)])]

/** Every concrete choice the unit can take now. Always includes 'pass'. */
export function availableChoices(state: BattleState, actor: Unit, rng: ActionContext['rng']): ChosenAction[] {
  return actionsFor(actor).flatMap(def => def.choices(actor).filter(c => def.isAvailable(contextFor(state, actor, c, rng))))
}

/** Every choice the unit has, with the reason when it can't be taken now. For the action menu. */
export function allChoices(state: BattleState, actor: Unit, rng: ActionContext['rng']): { choice: ChosenAction; def: ActionDef; reason?: string }[] {
  return actionsFor(actor).flatMap(def => def.choices(actor).map(choice => ({
    choice, def, reason: def.unavailable(contextFor(state, actor, choice, rng))
  })))
}

