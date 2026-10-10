import type {
  ArmorDef, AttrKey, Attributes, CreatureBase, EffectDef, Id, NaturalWeapon, OpponentSpec, OwnedTalent, OwnedTrait, ShieldDef, WeaponDef
} from '../types'
import { ARCHETYPES, CREATURES, archetypesFor } from '../data/creatures'
import { ITEMS } from '../data/items'
import { PROGRESSION } from '../data/progression'
import { TALENTS } from '../data/talents'
import { TRAITS } from '../data/traits'
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
  traits: OwnedTrait[]
  naturalWeapons: NaturalWeapon[]
  hitsStopped: number
  weapon?: WeaponDef
  armor?: ArmorDef
  shield?: ShieldDef
  xpValue: number
}

const weightedAttr = (rng: SeededRng, bias: Partial<Record<AttrKey, number>>): AttrKey => {
  const entries = (Object.entries(bias) as [AttrKey, number][]).filter(([, w]) => w > 0)
  let roll = rng.next() * entries.reduce((s, [, w]) => s + w, 0)
  for (const [k, w] of entries) {
    roll -= w
    if (roll < 0) return k
  }
  return entries.at(-1)![0]
}

/** Budget score drives the title: 1 per attribute point, 1 per talent's worth of XP. */
export const budgetScore = (budget: OpponentSpec['budget']): number => {
  return budget.attrPoints + Math.floor(budget.xp / PROGRESSION.talentXpCost)
}

/**
 * Deterministic: base creature + archetype + budget + seed always give the same build.
 * Attribute points follow the archetype's bias. Creatures that use gear spend XP on
 * talents down the archetype's priority list (hero rules) and pick the best gear they
 * can wield; beasts don't buy talents, so their XP becomes attribute points instead.
 */
export const buildOpponent = (spec: OpponentSpec): OpponentBuild => {
  const base: CreatureBase | undefined = CREATURES[spec.baseId]
  const arch = ARCHETYPES[spec.archetypeId]
  if (!base || !arch) throw new Error(`Unknown opponent ${spec.baseId}/${spec.archetypeId}`)
  const rng = createRng({ seed: spec.seed, calls: 0 })

  const attrs: Attributes = { ST: base.attrs.ST, DX: base.attrs.DX, IQ: base.attrs.IQ }
  // Beasts turn XP into attribute points at the talent rate (500 XP = 1 point).
  const xpPoints = base.canUseItems ? 0 : Math.floor(spec.budget.xp / PROGRESSION.talentXpCost)
  for (let i = 0; i < spec.budget.attrPoints + xpPoints; i++) attrs[weightedAttr(rng, arch.attrBias)]++

  // Creatures that use gear learn talents within their IQ like heroes.
  let talents = [...base.baseTalents]
  let xp = base.canUseItems ? spec.budget.xp : 0
  for (const entry of arch.talentPriority) {
    if (xp < PROGRESSION.talentXpCost) break
    const [id, weaponTalent] = entry.split(':') as [Id, Id | undefined]
    const node = TALENTS[id]
    if (!node || !canTakeTalent(node, { attrs, owned: talents, audience: 'hero' }, weaponTalent).ok) continue
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

  // Unconditional MA and armor bonuses from talents and traits, per rank.
  const owned: { effects: EffectDef[]; rank: number }[] = [
    ...talents.map(t => ({ effects: TALENTS[t.id]?.effects ?? [], rank: t.rank })),
    ...base.traits.map(t => ({ effects: TRAITS[t.id]?.effects ?? [], rank: t.rank }))
  ]
  const talentMod = (stat: 'MA' | 'hitsStopped') => owned.reduce((sum, o) => {
    for (const e of o.effects) {
      if (e.kind === 'modifier') for (const m of e.modifiers) if (m.stat === stat && !m.when) sum += m.value * o.rank
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
    traits: base.traits,
    naturalWeapons: base.naturalWeapons,
    hitsStopped: base.naturalHitsStopped + talentMod('hitsStopped') + (armor?.hitsStopped ?? 0) + (shield?.hitsStopped ?? 0),
    weapon,
    armor,
    shield,
    xpValue: base.xpValue + spec.budget.xp / 10 + spec.budget.attrPoints * 10
  }
}

/**
 * One archetype per genus in a fight, so all orcs in it fight alike.
 * The first spec of each genus sets it. Every base in a genus shares the
 * same archetype list (checked in data tests), so the swap is always legal.
 */
export const alignByGenus = (specs: OpponentSpec[]): OpponentSpec[] => {
  const chosen = new Map<Id, Id>()
  return specs.map(s => {
    const genus = CREATURES[s.baseId]?.genus ?? s.baseId
    const archetypeId = chosen.get(genus)
    if (!archetypeId) {
      chosen.set(genus, s.archetypeId)
      return s
    }
    return archetypeId === s.archetypeId ? s : { ...s, archetypeId }
  })
}

/** Picks a base creature and a fitting archetype. Used until matchmaking exists. */
export const randomSpec = (seed: number, budget: OpponentSpec['budget'], baseIds: Id[] = Object.keys(CREATURES)): OpponentSpec => {
  const rng = createRng({ seed, calls: 0 })
  const base = CREATURES[rng.pick(baseIds)]!
  const arch = rng.pick(archetypesFor(base))
  return { baseId: base.id, archetypeId: arch.id, budget, seed: rng.int(0, 2 ** 31 - 1) }
}
