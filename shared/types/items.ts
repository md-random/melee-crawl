import type { DiceExpr, Id } from './core'
import type { EffectDef } from './effects'

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'potion' | 'scroll' | 'misc'
export type EquipSlot = 'mainHand' | 'offHand' | 'body' | 'belt'

export type GradeId = 'ordinary' | 'cool' | 'bitchin' | 'righteous'

export interface GradeDef {
  id: GradeId
  name: string
  rank: number
  color: string
  traitSlots: number
}

export type ItemTraitType = 'element' | 'attribute' | 'movement' | 'attack' | 'defense'

export interface ItemTraitDef {
  id: Id
  name: string
  type: ItemTraitType
  appliesTo: ItemKind[]
  description: string
}

interface ItemBase {
  id: Id
  name: string
  kind: ItemKind
  weight: number
  cost: number
  icon: string
  /** Stats not yet checked against the 2019 rules. */
  unverified?: boolean
}

export interface WeaponDef extends ItemBase {
  kind: 'weapon'
  talent: Id                   // talent required to use without penalty
  damage: DiceExpr
  minST: number
  hands: 1 | 2
  attackKind: 'melee' | 'pole' | 'missile' | 'thrown'
  range?: number               // missile / thrown
}

export interface ArmorDef extends ItemBase {
  kind: 'armor'
  hitsStopped: number
  dxPenalty: number
  maxMA: number
}

export interface ShieldDef extends ItemBase {
  kind: 'shield'
  hitsStopped: number
  dxPenalty: number
}

/** Potions and scrolls: used in combat via an Action, produce Effects. */
export interface ConsumableDef extends ItemBase {
  kind: 'potion' | 'scroll'
  actionId: Id                 // 'drinkPotion' | 'readScroll'
  effects: EffectDef[]
  target: 'self' | 'unit' | 'hex'
}

export type ItemDef = WeaponDef | ArmorDef | ShieldDef | ConsumableDef

/** An owned copy of an item. */
export interface ItemInstance {
  uid: Id
  defId: Id
  grade: GradeId
  traits: Id[]
  charges?: number
}

export interface Equipment {
  mainHand?: Id                // ItemInstance uid
  offHand?: Id
  body?: Id
  belt: Id[]                   // quick-access consumables
}
