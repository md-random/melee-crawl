import type { DiceExpr, Id } from './core'

/** Anything a modifier can change. Derived values (adjDX etc.) are always base + modifiers. */
export type StatKey =
  | 'ST' | 'DX' | 'IQ' | 'MA'
  | 'adjDX'        // DX used for rolls
  | 'toHit'        // bonus/penalty to attack rolls only
  | 'damage'       // added to damage dealt
  | 'hitsStopped'  // armor-like reduction of damage taken
  | 'initiative'

export interface Modifier {
  stat: StatKey
  value: number
  /** Optional narrowing, e.g. only with swords, only vs. adjacent enemies. */
  when?: ModifierCondition
}

export type ModifierCondition =
  | { weaponTalent: Id }
  | { attackKind: 'melee' | 'missile' | 'thrown' | 'unarmed' }
  | { allyAdjacentToTarget: true }
  | { targetTag: string }

export type StatusId =
  | 'prone' | 'knockedDown' | 'engaged' | 'grappled' | 'stunned'
  | 'blinded' | 'invisible' | 'poisoned' | 'entangled' | 'defending' | 'dodging'

export type Duration =
  | { type: 'instant' }
  | { type: 'permanent' }                       // talents, natural traits
  | { type: 'rounds'; rounds: number }
  | { type: 'untilDispelled' }
  | { type: 'maintained'; stPerTurn: number; maxRounds?: number } // TFT continuing spells

/** How a new effect interacts with an existing one from the same def. */
export type StackRule = 'stack' | 'refresh' | 'highest' | 'ignore'

export type AreaShape =
  | { type: 'single' }
  | { type: 'radius'; radius: number }
  | { type: 'line'; length: number }

/** Data definition of an outcome. Produced by attacks, talents, items, spells, terrain. */
export type EffectDef =
  | { kind: 'damage'; dice: DiceExpr; ignoresArmor?: boolean }
  | { kind: 'heal'; dice: DiceExpr }
  | { kind: 'modifier'; modifiers: Modifier[]; duration: Duration; stacking: StackRule; tags?: string[] }
  | { kind: 'status'; status: StatusId; duration: Duration; tickDamage?: DiceExpr }
  | { kind: 'summon'; creatureId: Id; count: number; duration: Duration }
  | { kind: 'terrain'; overlay: OverlayId; area: AreaShape; duration: Duration }
  | { kind: 'remove'; matchTag?: string; matchSource?: EffectSourceKind }
  | { kind: 'grantAction'; actionId: Id }

export type OverlayId = 'fire' | 'wall' | 'shadow' | 'web'

export type EffectSourceKind = 'talent' | 'item' | 'spell' | 'action' | 'terrain' | 'wound' | 'armor'

/** A live effect on a unit or hex during battle. */
export interface ActiveEffect {
  uid: Id
  def: EffectDef
  source: { kind: EffectSourceKind; id: Id; name: string }
  appliedBy?: Id        // unit uid; summons die / maintained spells end with their owner
  targetUnit?: Id
  roundsLeft?: number   // for 'rounds' and 'maintained' durations
}
