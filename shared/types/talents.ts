import type { AttrKey, Id } from './core'
import type { EffectDef } from './effects'

export type TalentAudience = 'hero' | 'creature' | 'both'
export type TalentCategory = 'attack' | 'debuff' | 'defense' | 'movement' | 'utility' | 'weapon'

/** Prerequisite expression tree: supports AND / OR / talent / attribute gates. */
export type Requirement =
  | { all: Requirement[] }
  | { any: Requirement[] }
  | { talent: Id; rank?: number }
  | { attr: AttrKey; min: number }

/** One node of the talent tree. Pure data; lives in data/talents.ts. */
export interface TalentNode {
  id: Id
  name: string
  description: string
  for: TalentAudience
  official: boolean            // true = from TFT 2019 talent list, false = ours
  category: TalentCategory
  icon: string

  // tree layout (hand-placed)
  branch: string
  pos: { col: number; row: number }

  // costs & gates
  iqCost: number
  minIQ: number
  requires?: Requirement
  /** Extra gate for a specific rank, e.g. Toughness rank 2 needs ST 14. */
  rankRequires?: Record<number, Requirement>
  /** e.g. Sword costs 1 if Dagger is owned */
  costOverrides?: { ifHasTalent: Id; iqCost: number }[]
  maxRanks: number             // Missile Weapons = 3, Toughness = 2
  perWeapon?: boolean          // Weapon Expertise / Mastery: one per weapon talent
  weaponPrereq?: Id

  /** Passive effects applied per rank (permanent modifiers, granted actions). */
  effects: EffectDef[]
  /** Unverified rules values awaiting check against ITL. */
  unverified?: boolean
}

export interface OwnedTalent {
  id: Id
  rank: number
  weaponTalent?: Id            // for perWeapon talents
}

/** Derived per render, never saved. */
export type TalentNodeState = 'owned' | 'available' | 'reachable' | 'locked'

export interface ProgressionRules {
  startingAttrPoints: number   // 32
  minAttr: number              // 8
  /** Cumulative XP → attribute total. Unverified, from secondary source. */
  attrXpTable: { totalXp: number; attrTotal: number }[]
  talentXpCost: number         // 500 (unverified)
  talentXpByRow: number[]
  wizardTalentMultiplier: number // 2
}
