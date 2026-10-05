import type { Id } from './core'
import type { BattleState } from './battle'
import type { Character, CharacterClass, RunStats } from './character'
import type { Encounter } from './creatures'

/** Bump with a migration in engine/save.ts whenever the save format changes. */
export const SCHEMA_VERSION = 2

/** NetHack-style grave record; the leaderboard is a sorted list of these. */
export interface Tombstone {
  characterId: Id
  name: string
  class: CharacterClass
  level: number
  score: number
  stats: RunStats
  killedBy: { name: string; title?: string; talents: string[] }
  battleNo: number
  diedAt: number
}

export type RunScreen = 'creator' | 'camp' | 'battle' | 'tombstone'

/** The single localStorage document. Autosaved after every action. */
export interface SaveFile {
  schemaVersion: number
  run?: {
    screen: RunScreen
    character: Character
    nextEncounter?: Encounter
    battle?: BattleState
  }
  graveyard: Tombstone[]
  settings: { animationSpeed: number; logLimit: number }
}
