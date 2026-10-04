import type { AttrKey, DiceExpr, Id } from './core'
import type { OwnedTalent } from './talents'

export interface NaturalWeapon {
  name: string                 // bite, claw, gore
  damage: DiceExpr
  attackKind: 'melee' | 'unarmed'
}

/** Bestiary entry: the fixed TFT-style stat block before any level budget. */
export interface CreatureBase {
  id: Id
  name: string
  portraitId: string
  tags: string[]               // 'humanoid', 'beast', 'undead'...
  attrs: { ST: number; DX: number; IQ: number; MA: number }
  naturalWeapons: NaturalWeapon[]
  naturalHitsStopped: number
  baseTalents: OwnedTalent[]
  canUseItems: boolean         // orcs yes, wolves no
  hexSize: 1                   // widen to 1 | 3 | 7 when multi-hex lands
  xpValue: number
  goldDrop: DiceExpr
  /** Stat block is ours / not yet checked against the 2019 rules. */
  unverified?: boolean
}

/** A build recipe walked through the talent tree with a budget. */
export interface Archetype {
  id: Id
  name: string
  appliesTo: { baseIds?: Id[]; tags?: string[] }
  attrBias: Partial<Record<AttrKey, number>>  // weights, sum ≈ 1
  /** Bought in order when affordable; `talentId:weaponTalent` for perWeapon talents. */
  talentPriority: string[]
  gear?: { weapons: Id[]; armor?: Id; shield?: Id }
  aiProfile: AiProfileId
  /** Display title by budget spent, e.g. Grunt / Warrior / Veteran / Chieftain. */
  titles: { minBudget: number; title: string }[]
}

export type AiProfileId = 'brute' | 'duelist' | 'skirmisher' | 'packHunter' | 'archer' | 'caster'

/** Everything needed to regenerate an opponent deterministically. Saved instead of the full build. */
export interface OpponentSpec {
  baseId: Id
  archetypeId: Id
  budget: { attrPoints: number; xp: number }
  seed: number
}

/** Matchmaking output. */
export interface Encounter {
  id: Id
  rating: number
  opponents: OpponentSpec[]
  mapSeed: number
  biome: Biome
}

export type Biome = 'plains' | 'forest' | 'swamp' | 'rocky'
