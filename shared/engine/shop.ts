import type { Equipment, Id, ItemDef, ItemInstance } from '../types'
import { armors, shields, weapons } from '../data/items'
import { createRng } from '../utils/rng'
import { defOf, itemName, newItem } from './items'

// Camp shop. The hero owns only what they wield and wear: buying fills a slot,
// and whatever was there is sold or dropped.

export type GearSlot = 'mainHand' | 'offHand' | 'body'

export type ShopAction =
  | { kind: 'buy'; uid: Id; slot: GearSlot; old?: 'sell' | 'drop' }
  | { kind: 'sell'; slot: GearSlot }

export interface ShopState {
  inventory: ItemInstance[]
  equipped: Equipment
  gold: number
  /** Items for sale. Buying moves the item itself to the hero. */
  stock: ItemInstance[]
}

/** Selling gives back this share of the price, rounded down. */
export const SELL_RATE = 0.5
export const sellPrice = (def: ItemDef) => Math.floor(def.cost * SELL_RATE)

/** What one camp visit has for sale: 2 weapons, 2 armors and 2 shields unless `counts` says otherwise, picked from the seed. */
export const shopStock = (seed: number, counts: { weapon?: number; armor?: number; shield?: number } = {}): ItemInstance[] => {
  const rng = createRng({ seed, calls: 0 })
  const pick = (ids: Id[], n: number) => {
    const pool = [...ids]
    const out: Id[] = []
    while (pool.length && out.length < n) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!)
    return out
  }
  return [
    ...pick(weapons().map(i => i.id), counts.weapon ?? 2),
    ...pick(armors().map(i => i.id), counts.armor ?? 2),
    ...pick(shields().map(i => i.id), counts.shield ?? 2)
  ].map((defId, i) => newItem(`shop-${seed}-${i}`, defId))
}

/** The item in a slot, if any. */
export const itemIn = (state: Pick<ShopState, 'inventory' | 'equipped'>, slot: GearSlot): { uid: Id; def: ItemDef; inst: ItemInstance } | undefined => {
  const uid = state.equipped[slot]
  const inst = uid ? state.inventory.find(i => i.uid === uid) : undefined
  const def = inst ? defOf(inst) : undefined
  return inst && def ? { uid: inst.uid, def, inst } : undefined
}

/** Whether an item can go in a slot: weapons in either hand, shields in the off hand, armor on the body. */
export const fits = (def: ItemDef, slot: GearSlot): boolean => {
  if (def.kind === 'weapon') return slot === 'mainHand' || slot === 'offHand'
  if (def.kind === 'shield') return slot === 'offHand'
  if (def.kind === 'armor') return slot === 'body'
  return false
}

/**
 * Applies shop actions in order to a copy of the state. Stops at the first
 * one that can't be done and says why.
 */
export const applyShop = (start: ShopState, actions: ShopAction[]): { state: ShopState; error?: string } => {
  const state: ShopState = {
    inventory: start.inventory.map(i => ({ ...i, traits: [...i.traits] })),
    equipped: { ...start.equipped, belt: [...start.equipped.belt] },
    gold: start.gold,
    stock: start.stock.map(i => ({ ...i, traits: [...i.traits] }))
  }
  const clear = (slot: GearSlot) => {
    const uid = state.equipped[slot]
    state.inventory = state.inventory.filter(i => i.uid !== uid)
    state.equipped[slot] = undefined
  }
  for (const a of actions) {
    const current = itemIn(state, a.slot)
    if (a.kind === 'sell') {
      if (!current) return { state, error: 'Nothing to sell there.' }
      state.gold += sellPrice(current.def)
      clear(a.slot)
      continue
    }
    const at = state.stock.findIndex(i => i.uid === a.uid)
    const item = state.stock[at]
    const def = item ? defOf(item) : undefined
    if (!item || !def) return { state, error: 'Not for sale.' }
    const name = itemName(item, def)
    if (!fits(def, a.slot)) return { state, error: `${name} doesn't go there.` }
    if (current) {
      if (!a.old) return { state, error: `Sell or drop your ${itemName(current.inst, current.def)} first.` }
      if (a.old === 'sell') state.gold += sellPrice(current.def)
      clear(a.slot)
    }
    if (state.gold < def.cost) return { state, error: `${name} costs ${def.cost} gold.` }
    state.gold -= def.cost
    state.stock.splice(at, 1)
    state.inventory.push(item)
    state.equipped[a.slot] = item.uid
  }
  return { state }
}
