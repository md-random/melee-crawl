import type { Hex, HexKey, Id } from './core'
import type { BattleState, ChosenAction, Unit } from './battle'
import type { GameEvent } from './events'

export interface Rng {
  roll(dice: number, sides?: number): number[]
}

export interface ActionContext {
  state: BattleState
  /** May be a copy placed at a planned hex and facing (AI look-ahead). */
  actor: Unit
  rng: Rng
  /** The concrete choice: which spell, which item. */
  choice: ChosenAction
}

export interface ActionTarget { unit?: Id; hex?: Hex }

export interface ActionCost {
  st?: number
  consumesItem?: boolean
}

/**
 * What an action is expected to do. The AI scores only these numbers,
 * so new actions (spells, potions, scrolls) need no AI code.
 */
export interface ActionEstimate {
  /** 0..1 */
  hitChance: number
  /** Expected ST loss to enemies, after armor, times hit chance. Negative = harms allies. */
  damage: number
  /** Chance the target dies. */
  kill: number
  /** Expected ST restored to allies. */
  heal: number
  /** Expected damage to the actor this action prevents (defend, dodge). */
  protection: number
  /** Rough ST-equivalent value of statuses or modifiers applied. */
  utility: number
}

/**
 * Every combat choice: attack, dodge, defend, ready weapon, use item,
 * cast spell, talent-granted actions. Shared by UI menu, AI and engine.
 */
export interface ActionDef {
  id: Id
  label: string
  icon: string
  /** One line for the action menu: what it does. */
  hint: string
  /** 'select' takes effect when chosen (defend, dodge); 'resolve' acts in adjDX order. */
  timing: 'select' | 'resolve'
  /** Needs a target chosen when it resolves; with none left, the action is lost. */
  targeted: boolean
  /** Concrete variants: one per known spell or belt item; one plain choice otherwise. */
  choices(actor: Unit): ChosenAction[]
  /**
   * Why the action can't be taken now (TFT option rules: engaged, disengaged,
   * hexes moved...), in plain words for the player; undefined when it can.
   */
  unavailable(ctx: ActionContext): string | undefined
  /** Same rule as `unavailable`, as a yes/no. */
  isAvailable(ctx: ActionContext): boolean
  /** Unit uids or hex keys. Empty for self-only actions. */
  targets(ctx: ActionContext): (Id | HexKey)[]
  cost(ctx: ActionContext): ActionCost
  estimate(ctx: ActionContext, target: ActionTarget): ActionEstimate
  resolve(ctx: ActionContext, target: ActionTarget): GameEvent[]
}
