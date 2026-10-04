import type { Attributes, Id } from './core'
import type { Equipment, ItemInstance } from './items'
import type { OwnedTalent } from './talents'

export type CharacterClass = 'hero' | 'wizard'

export interface RunStats {
  battlesWon: number
  kills: number
  xpEarned: number
  goldEarned: number
  turnsSurvived: number
}

/** The player's persistent character between battles. Current ST is always max outside battle. */
export interface Character {
  id: Id
  name: string
  portraitId: string
  class: CharacterClass
  createdAt: number

  base: Attributes             // purchased ST / DX / IQ
  talents: OwnedTalent[]
  spells: Id[]                 // empty for heroes (v2)
  xp: { earned: number; unspent: number }
  gold: number

  inventory: ItemInstance[]
  equipped: Equipment
  plannedTalents: Id[]         // talent-tree planning mode

  stats: RunStats
}
