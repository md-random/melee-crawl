import type { Id } from './core'
import type { EffectDef } from './effects'

/**
 * A creature's innate ability (thick hide, venom, pounce). Written on the
 * stat block, never bought; talents stay for creatures that use gear.
 */
export interface TraitDef {
  id: Id
  name: string
  description: string
  icon: string
  /** Most traits have one rank; Thick Hide can have two. */
  maxRanks: number
  /** Applied once per rank for stacking modifiers. */
  effects: EffectDef[]
  /** Ours, not from the 2019 rules. */
  unverified?: boolean
}

export interface OwnedTrait {
  id: Id
  rank: number
}
