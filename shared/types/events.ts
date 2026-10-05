import type { Hex, Id } from './core'
import type { ActiveEffect } from './effects'
import type { Phase } from './battle'

/**
 * Everything the engine does is emitted as events.
 * Dice box, Action tab and Log tab all subscribe to the same stream.
 */
export type GameEvent = { round: number; at: number } & (
  | {
      kind: 'roll'; purpose: string; actor?: Id; dice: number[]; total: number; target?: number; success?: boolean
      special?: 'double' | 'triple' | 'fumble' | 'drop'
      /** How the target number (to-hit) or total (damage) was built, e.g. DX 12, Leather −2, rear +4. */
      parts?: { label: string; value: number }[]
      /** Anything else that shaped the roll, e.g. "Bear is defending: 4 dice". */
      note?: string
    }
  | { kind: 'phase'; phase: Phase }
  | { kind: 'move'; unit: Id; from: Hex; to: Hex }
  | { kind: 'face'; unit: Id; facing: number }
  | { kind: 'attack'; unit: Id; target: Id; weapon: string }
  | { kind: 'damage'; unit: Id; amount: number; stopped: number; source: string }
  | { kind: 'heal'; unit: Id; amount: number; source: string }
  | { kind: 'effectAdded'; effect: ActiveEffect }
  | { kind: 'effectRemoved'; effectUid: Id; reason: 'expired' | 'dispelled' | 'ownerDied' }
  | { kind: 'status'; unit: Id; status: string; on: boolean }
  | { kind: 'death'; unit: Id; by?: Id }
  | { kind: 'narrate'; text: string }                     // Action tab
  | { kind: 'debug'; msg: string; data?: unknown }        // Log tab only
)
