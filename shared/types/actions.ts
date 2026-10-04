import type { Hex, HexKey, Id } from './core'
import type { BattleState, Unit } from './battle'
import type { GameEvent } from './events'

export interface Rng {
  roll(dice: number, sides?: number): number[]
}

export interface ActionContext {
  state: BattleState
  actor: Unit
  rng: Rng
}

export interface ActionTarget { unit?: Id; hex?: Hex }

/**
 * Every combat choice: attack, dodge, defend, ready weapon, drink potion,
 * read scroll, cast spell, talent-granted actions. Shared by UI menu, AI and engine.
 */
export interface ActionDef {
  id: Id
  label: string
  icon: string
  /** TFT option rules: engaged/disengaged, hexes moved, etc. */
  isAvailable(ctx: ActionContext): boolean
  targets(ctx: ActionContext): (Id | HexKey)[]
  resolve(ctx: ActionContext, target: ActionTarget): GameEvent[]
}
