import type {
  ArmorDef, AttrKey, Attributes, CreatureBase, Id, NaturalWeapon, OpponentSpec, OwnedTalent, ShieldDef, WeaponDef
} from '../types'
import { ARCHETYPES, CREATURES, archetypesFor } from '../data/creatures'
import { ITEMS } from '../data/items'
import { PROGRESSION } from '../data/progression'
import { TALENTS } from '../data/talents'
import { createRng, type SeededRng } from '../utils/rng'
import { addTalent, adjustedDx, canTakeTalent, hasTalent, loadoutProblems, movementAllowance } from './rules'

/** A fully built opponent, regenerated from its OpponentSpec whenever needed. */
export interface OpponentBuild {
  spec: OpponentSpec
  name: string
  title: string
  portraitId: string
  attrs: Attributes
  ma: number
  adjDx: number
  talents: OwnedTalent[]
  naturalWeapons: NaturalWeapon[]
  hitsStopped: number
  weapon?: WeaponDef
  armor?: ArmorDef
  shield?: ShieldDef
  xpValue: number
}

function weightedAttr(rng: SeededRng, bias: Partial<Record<AttrKey, number>>): AttrKey {
  const entries = (Object.entries(bias) as [AttrKey, number][]).filter(([, w]) => w > 0)
  let roll = rng.next() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) {
    roll -= w
    if (roll < 0) return k
  }
  return entries.at(-1)![0]
}

/** Budget score drives the title: 1 per attribute point, 1 per talent's worth of XP. */
export function budgetScore(budget: OpponentSpec['budget']): number {
  return budget.attrPoints + Math.floor(budget.xp / PROGRESSION.talentXpCost)
}

/**
 * Deterministic: base creature + archetype + budget + seed always give the same build.
 * Attribute points follow the archetype's bias; XP buys talents down its priority list
 * through the normal talent rules; humanoids then pick the best gear they can wield.
 */
export function buildOpponent(spec: OpponentSpec): OpponentBuild {
  const base: CreatureBase | undefined = CREATURES[spec.baseId]
  const arch = ARCHETYPES[spec.archetypeId]
  if (!base || !arch) throw new Error(`Unknown opponent ${spec.baseId}/${spec.archetypeId}`)
  const rng = createRng({ seed: spec.seed, calls: 0 })

  const attrs: Attributes = { ST: base.attrs.ST, DX: base.attrs.DX, IQ: base.attrs.IQ }
  for (let i = 0; i < spec.budget.attrPoints; i++) attrs[weightedAttr(rng, arch.attrBias)]++

  // Humanoids learn talents within their IQ like heroes; beasts don't spend IQ.
  const audience = base.canUseItems ? 'hero' : 'creature'
  let talents = [...base.baseTalents]
  let xp = spec.budget.xp
  for (const entry of arch.talentPriority) {
    if (xp < PROGRESSION.talentXpCost) break
    const [id, weaponTalent] = entry.split(':') as [Id, Id | undefined]
    const node = TALENTS[id]
    if (!node) continue
    const ctx = { attrs, owned: talents, audience, checkIq: base.canUseItems } as const
    // Creature talents (for: 'creature') are always allowed for this archetype's base.
    if (!canTakeTalent(node, { ...ctx, audience: node.for === 'creature' ? 'creature' : audience }, weaponTalent).ok) continue
    talents = addTalent(talents, id, weaponTalent)
    xp -= PROGRESSION.talentXpCost
  }

  let weapon: WeaponDef | undefined
  let armor: ArmorDef | undefined
  let shield: ShieldDef | undefined
  if (base.canUseItems && arch.gear) {
    const options = arch.gear.weapons.map(id => ITEMS[id]).filter((w): w is WeaponDef => w?.kind === 'weapon' && attrs.ST >= w.minST)
    weapon = options.find(w => hasTalent(talents, w.talent)) ?? options[0]
    const a = arch.gear.armor ? ITEMS[arch.gear.armor] : undefined
    armor = a?.kind === 'armor' ? a : undefined
    const s = arch.gear.shield ? ITEMS[arch.gear.shield] : undefined
    shield = s?.kind === 'shield' && loadoutProblems(attrs, { weapon, shield: s }).length === 0 ? s : undefined
  }

  const talentMod = (stat: 'MA' | 'hitsStopped') => talents.reduce((sum, t) => {
    for (const e of TALENTS[t.id]?.effects ?? []) {
      if (e.kind === 'modifier') for (const m of e.modifiers) if (m.stat === stat && !m.when) sum += m.value * t.rank
    }
    return sum
  }, 0)

  const gear = { weapon, armor, shield }
  const score = budgetScore(spec.budget)
  const title = [...arch.titles].reverse().find(t => score >= t.minBudget)?.title ?? ''
  const name = !title ? base.name : base.canUseItems ? `${base.name} ${title}` : `${title} ${base.name}`

  return {
    spec,
    name,
    title,
    portraitId: base.portraitId,
    attrs,
    ma: movementAllowance(base.attrs.MA + talentMod('MA'), gear),
    adjDx: adjustedDx(attrs, talents, gear).value,
    talents,
    naturalWeapons: base.naturalWeapons,
    hitsStopped: base.naturalHitsStopped + talentMod('hitsStopped') + (armor?.hitsStopped ?? 0) + (shield?.hitsStopped ?? 0),
    weapon,
    armor,
    shield,
    xpValue: base.xpValue + spec.budget.xp / 10 + spec.budget.attrPoints * 10
  }
}

/** Picks a base creature and a fitting archetype. Used until matchmaking exists. */
export function randomSpec(seed: number, budget: OpponentSpec['budget'], baseIds: Id[] = Object.keys(CREATURES)): OpponentSpec {
  const rng = createRng({ seed, calls: 0 })
  const base = CREATURES[rng.pick(baseIds)]!
  const arch = rng.pick(archetypesFor(base))
  return { baseId: base.id, archetypeId: arch.id, budget, seed: rng.int(0, 2 ** 31 - 1) }
}
