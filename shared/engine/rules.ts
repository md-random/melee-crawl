import type {
  ArmorDef, Attributes, Character, CharacterClass, Id, OwnedTalent, Requirement, ShieldDef, TalentNode, WeaponDef
} from '../types'
import { ITEMS } from '../data/items'
import { BASE_MA, NO_TALENT_DX_PENALTY, PROGRESSION } from '../data/progression'
import { TALENTS } from '../data/talents'

// Character rules shared by the creator, the camp screen and the opponent generator.

export function rankOf(owned: OwnedTalent[], id: Id, weaponTalent?: Id): number {
  return owned.find(t => t.id === id && t.weaponTalent === weaponTalent)?.rank ?? 0
}

export function hasTalent(owned: OwnedTalent[], id: Id, rank = 1): boolean {
  return owned.some(t => t.id === id && t.rank >= rank)
}

/** Human-readable reasons a requirement isn't met; empty when met. */
export function missingRequirements(req: Requirement | undefined, attrs: Attributes, owned: OwnedTalent[]): string[] {
  if (!req) return []
  if ('all' in req) return req.all.flatMap(r => missingRequirements(r, attrs, owned))
  if ('any' in req) {
    const parts = req.any.map(r => missingRequirements(r, attrs, owned))
    return parts.some(p => p.length === 0) ? [] : [`One of: ${parts.map(p => p.join(' and ')).join(' / ')}`]
  }
  if ('talent' in req) {
    return hasTalent(owned, req.talent, req.rank) ? [] : [`Needs ${TALENTS[req.talent]?.name ?? req.talent}`]
  }
  return attrs[req.attr] >= req.min ? [] : [`Needs ${req.attr} ${req.min} (have ${attrs[req.attr]})`]
}

/** IQ cost of one rank of a talent for this owner. */
export function talentIqCost(node: TalentNode, owned: OwnedTalent[], cls: CharacterClass = 'hero'): number {
  const override = node.costOverrides?.find(o => hasTalent(owned, o.ifHasTalent))
  const base = override ? override.iqCost : node.iqCost
  return cls === 'wizard' ? base * PROGRESSION.wizardTalentMultiplier : base
}

/** Total IQ committed to talents, in purchase order (so overrides apply as they did when bought). */
export function iqUsed(owned: OwnedTalent[], cls: CharacterClass = 'hero'): number {
  let total = 0
  const before: OwnedTalent[] = []
  for (const t of owned) {
    const node = TALENTS[t.id]
    if (node) total += talentIqCost(node, before, cls) * t.rank
    before.push(t)
  }
  return total
}

export interface TakeContext {
  attrs: Attributes
  owned: OwnedTalent[]
  cls?: CharacterClass
  audience: 'hero' | 'creature'
  /** Creatures don't spend IQ on talents. */
  checkIq?: boolean
}

/** Whether the next rank of a talent can be taken now, with reasons if not. */
export function canTakeTalent(node: TalentNode, ctx: TakeContext, weaponTalent?: Id): { ok: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (node.for !== 'both' && node.for !== ctx.audience) reasons.push(`${ctx.audience === 'hero' ? 'Creature' : 'Hero'} only`)
  if (node.perWeapon) {
    if (!weaponTalent) reasons.push('Choose a weapon talent')
    else if (!hasTalent(ctx.owned, weaponTalent)) reasons.push(`Needs ${TALENTS[weaponTalent]?.name ?? weaponTalent}`)
  }
  const nextRank = rankOf(ctx.owned, node.id, weaponTalent) + 1
  if (nextRank > node.maxRanks) reasons.push('Already at max rank')
  if (ctx.checkIq !== false) {
    if (ctx.attrs.IQ < node.minIQ) reasons.push(`Needs IQ ${node.minIQ} (have ${ctx.attrs.IQ})`)
    const free = ctx.attrs.IQ - iqUsed(ctx.owned, ctx.cls)
    const cost = talentIqCost(node, ctx.owned, ctx.cls)
    if (cost > free) reasons.push(`Costs ${cost} IQ (${free} left)`)
  }
  reasons.push(...missingRequirements(node.requires, ctx.attrs, ctx.owned))
  reasons.push(...missingRequirements(node.rankRequires?.[nextRank], ctx.attrs, ctx.owned))
  return { ok: reasons.length === 0, reasons }
}

export interface TalentPlan {
  /** Talents learned in order; the last is the one asked for, earlier ones are missing prerequisites. */
  steps: { id: Id; weaponTalent?: Id }[]
  iqCost: number
  /** Non-talent reasons the plan can't be done now (attributes, min IQ, IQ budget). Empty = can learn. */
  blockers: string[]
  result: OwnedTalent[]
}

/**
 * Learning a talent pulls in any prerequisite talents it's missing, so
 * Shield Expertise learns Shield too. For "any of" prerequisites the cheapest option is picked.
 */
export function planTalent(id: Id, ctx: TakeContext, weaponTalent?: Id, prefer: Id[] = []): TalentPlan {
  const steps: TalentPlan['steps'] = []
  const planned = (tid: Id, wt?: Id) =>
    steps.some(s => s.id === tid && s.weaponTalent === wt) || (!wt && hasTalent(ctx.owned, tid)) || (wt && rankOf(ctx.owned, tid, wt) > 0)
  /** Preferred talents first (e.g. the equipped weapon's), then the cheapest. */
  const cheapest = (ids: Id[]) => ids.find(i => prefer.includes(i))
    ?? [...ids].sort((a, b) => (TALENTS[a]?.iqCost ?? 99) - (TALENTS[b]?.iqCost ?? 99))[0]

  const collect = (tid: Id, wt?: Id) => {
    const node = TALENTS[tid]
    if (!node) return
    const walk = (req?: Requirement) => {
      if (!req) return
      if ('all' in req) req.all.forEach(walk)
      else if ('any' in req) {
        const met = req.any.some(r => missingRequirements(r, ctx.attrs, ctx.owned).length === 0 || ('talent' in r && planned(r.talent)))
        const options = req.any.filter((r): r is { talent: Id } => 'talent' in r).map(r => r.talent)
        const pick = cheapest(options)
        if (!met && pick) collect(pick)
      } else if ('talent' in req && !planned(req.talent)) collect(req.talent)
    }
    walk(node.requires)
    if (node.perWeapon && wt && !planned(wt)) collect(wt)
    steps.push(wt ? { id: tid, weaponTalent: wt } : { id: tid })
  }
  collect(id, weaponTalent)

  let owned = ctx.owned
  const blockers: string[] = []
  for (const s of steps) {
    const node = TALENTS[s.id]!
    const check = canTakeTalent(node, { ...ctx, owned }, s.weaponTalent)
    if (!check.ok) {
      const prefix = s.id === id ? '' : `${node.name}: `
      blockers.push(...check.reasons.map(r => prefix + r))
    }
    owned = addTalent(owned, s.id, s.weaponTalent)
  }
  // Report one IQ budget line for the whole plan instead of per step.
  const iqCost = iqUsed(owned, ctx.cls) - iqUsed(ctx.owned, ctx.cls)
  const free = ctx.attrs.IQ - iqUsed(ctx.owned, ctx.cls)
  const filtered = blockers.filter(b => !/Costs \d+ IQ/.test(b))
  if (iqCost > free) filtered.push(`Costs ${iqCost} IQ (${free} left)`)
  return { steps, iqCost, blockers: [...new Set(filtered)], result: owned }
}

/** Talents that would be removed along with this one. */
export function dependentsOf(owned: OwnedTalent[], id: Id, weaponTalent: Id | undefined, attrs: Attributes, cls: CharacterClass = 'hero'): OwnedTalent[] {
  const after = removeTalent(owned, id, weaponTalent, attrs, cls)
  return owned.filter(t => !(t.id === id && t.weaponTalent === weaponTalent) && !after.some(a => a.id === t.id && a.weaponTalent === t.weaponTalent))
}

/** Returns a new list with one more rank of the talent. */
export function addTalent(owned: OwnedTalent[], id: Id, weaponTalent?: Id): OwnedTalent[] {
  const i = owned.findIndex(t => t.id === id && t.weaponTalent === weaponTalent)
  if (i === -1) return [...owned, { id, rank: 1, ...(weaponTalent ? { weaponTalent } : {}) }]
  return owned.map((t, j) => (j === i ? { ...t, rank: t.rank + 1 } : t))
}

/** Removes one rank, and anything that no longer qualifies afterwards. */
export function removeTalent(owned: OwnedTalent[], id: Id, weaponTalent: Id | undefined, attrs: Attributes, cls: CharacterClass = 'hero'): OwnedTalent[] {
  let next = owned
    .map(t => (t.id === id && t.weaponTalent === weaponTalent ? { ...t, rank: t.rank - 1 } : t))
    .filter(t => t.rank > 0)
  // Re-validate in order so dependants of the removed talent drop too.
  for (let changed = true; changed;) {
    changed = false
    const kept: OwnedTalent[] = []
    for (const t of next) {
      const node = TALENTS[t.id]
      const ok = node && Array.from({ length: t.rank }).every((_, r) =>
        canTakeTalent(node, { attrs, owned: [...kept, ...(r ? [{ ...t, rank: r }] : [])], cls, audience: 'hero' }, t.weaponTalent).ok
      )
      if (ok) kept.push(t)
      else changed = true
    }
    next = kept
  }
  return next
}

// ---------- equipment ----------

export interface Loadout {
  weapon?: WeaponDef
  armor?: ArmorDef
  shield?: ShieldDef
}

export interface DxPart { label: string; value: number }

/** adj DX with its breakdown, e.g. DX 13 − 2 leather − 4 no talent. */
export function adjustedDx(attrs: Attributes, owned: OwnedTalent[], gear: Loadout): { value: number; parts: DxPart[] } {
  const parts: DxPart[] = [{ label: 'DX', value: attrs.DX }]
  if (gear.armor?.dxPenalty) parts.push({ label: gear.armor.name, value: -gear.armor.dxPenalty })
  if (gear.shield?.dxPenalty) parts.push({ label: gear.shield.name, value: -gear.shield.dxPenalty })
  if (gear.shield && !hasTalent(owned, 'shield')) parts.push({ label: 'No Shield talent', value: -NO_TALENT_DX_PENALTY })
  if (gear.weapon && !hasTalent(owned, gear.weapon.talent)) {
    parts.push({ label: `No ${TALENTS[gear.weapon.talent]?.name ?? gear.weapon.talent} talent`, value: -NO_TALENT_DX_PENALTY })
  }
  return { value: parts.reduce((s, p) => s + p.value, 0), parts }
}

export function movementAllowance(baseMA: number, gear: Loadout): number {
  return gear.armor ? Math.min(baseMA, gear.armor.maxMA) : baseMA
}

/** Problems with a loadout for this ST; empty when valid. */
export function loadoutProblems(attrs: Attributes, gear: Loadout): string[] {
  const out: string[] = []
  if (gear.weapon && attrs.ST < gear.weapon.minST) out.push(`${gear.weapon.name} needs ST ${gear.weapon.minST}`)
  if (gear.weapon?.hands === 2 && gear.shield) out.push(`${gear.weapon.name} is two-handed; no shield`)
  return out
}

export function loadoutOf(c: Pick<Character, 'inventory' | 'equipped'>): Loadout {
  const def = (uid?: Id) => {
    const inst = c.inventory.find(i => i.uid === uid)
    return inst ? ITEMS[inst.defId] : undefined
  }
  const weapon = def(c.equipped.mainHand)
  const body = def(c.equipped.body)
  const off = def(c.equipped.offHand)
  return {
    weapon: weapon?.kind === 'weapon' ? weapon : undefined,
    armor: body?.kind === 'armor' ? body : undefined,
    shield: off?.kind === 'shield' ? off : undefined
  }
}

// ---------- character creation ----------

export interface CreationInput {
  name: string
  attrs: Attributes
  talents: OwnedTalent[]
  weaponId: Id
  armorId?: Id
  shieldId?: Id
}

export function attrPointsLeft(attrs: Attributes): number {
  return PROGRESSION.startingAttrPoints - attrs.ST - attrs.DX - attrs.IQ
}

export function creationProblems(input: CreationInput): string[] {
  const out: string[] = []
  if (!input.name.trim()) out.push('Name your character')
  for (const k of ['ST', 'DX', 'IQ'] as const) {
    if (input.attrs[k] < PROGRESSION.minAttr) out.push(`${k} must be at least ${PROGRESSION.minAttr}`)
  }
  const left = attrPointsLeft(input.attrs)
  if (left !== 0) out.push(left > 0 ? `${left} attribute points left to spend` : `${-left} attribute points over`)
  if (iqUsed(input.talents) > input.attrs.IQ) out.push('Talents cost more IQ than you have')
  const weapon = ITEMS[input.weaponId]
  if (weapon?.kind !== 'weapon') out.push('Choose a weapon')
  else {
    const armor = input.armorId ? ITEMS[input.armorId] : undefined
    const shield = input.shieldId ? ITEMS[input.shieldId] : undefined
    out.push(...loadoutProblems(input.attrs, {
      weapon,
      armor: armor?.kind === 'armor' ? armor : undefined,
      shield: shield?.kind === 'shield' ? shield : undefined
    }))
  }
  return out
}

/** Builds a new level-0 hero. Call only when creationProblems() is empty. */
export function createCharacter(input: CreationInput, newId: () => Id): Character {
  const inventory = [input.weaponId, input.armorId, input.shieldId]
    .filter((id): id is Id => !!id)
    .map(defId => ({ uid: newId(), defId }))
  const uidOf = (defId?: Id) => inventory.find(i => i.defId === defId)?.uid
  return {
    id: newId(),
    name: input.name.trim(),
    portraitId: 'warrior',
    class: 'hero',
    createdAt: Date.now(),
    base: { ...input.attrs },
    talents: input.talents,
    spells: [],
    xp: { earned: 0, unspent: 0 },
    gold: 0,
    inventory,
    equipped: { mainHand: uidOf(input.weaponId), body: uidOf(input.armorId), offHand: uidOf(input.shieldId), belt: [] },
    plannedTalents: [],
    stats: { battlesWon: 0, kills: 0, xpEarned: 0, goldEarned: 0, turnsSurvived: 0 }
  }
}

/** Level shown in UI and used by matchmaking: attribute points above the starting 32. */
export function levelOf(attrs: Attributes): number {
  return attrs.ST + attrs.DX + attrs.IQ - PROGRESSION.startingAttrPoints
}

export { BASE_MA }
