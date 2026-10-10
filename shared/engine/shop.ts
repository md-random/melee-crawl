import type { Equipment, Id, ItemDef, ItemInstance } from '../types'
import { ITEMS, armors, shields, weapons } from '../data/items'
import { createRng } from '../utils/rng'

// Camp shop. The hero owns only what they wield and wear: buying fills a slot,
// and whatever was there is sold or dropped.

export type GearSlot = 'mainHand' | 'offHand' | 'body'

export type ShopAction =
  | { kind: 'buy'; defId: Id; slot: GearSlot; old?: 'sell' | 'drop' }
  | { kind: 'sell'; slot: GearSlot }

export interface ShopState {
  inventory: ItemInstance[]
  equipped: Equipment
  gold: number
  /** Item ids for sale, one of each. */
  stock: Id[]
}

/** Selling gives back this share of the price, rounded down. */
export const SELL_RATE = 0.5
export const sellPrice = (def: ItemDef) => Math.floor(def.cost * SELL_RATE)

/** What one camp visit has for sale: 2 weapons, 2 armors and 2 shields unless `counts` says otherwise, picked from the seed. */
export function shopStock(seed: number, counts: { weapon?: number; armor?: number; shield?: number } = {}): Id[] {
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
  ]
}

/** The item in a slot, if any. */
export function itemIn(state: Pick<ShopState, 'inventory' | 'equipped'>, slot: GearSlot): { uid: Id; def: ItemDef } | undefined {
  const uid = state.equipped[slot]
  const inst = uid ? state.inventory.find(i => i.uid === uid) : undefined
  const def = inst ? ITEMS[inst.defId] : undefined
  return inst && def ? { uid: inst.uid, def } : undefined
}

/** Whether an item can go in a slot: weapons in either hand, shields in the off hand, armor on the body. */
export function fits(def: ItemDef, slot: GearSlot): boolean {
  if (def.kind === 'weapon') return slot === 'mainHand' || slot === 'offHand'
  if (def.kind === 'shield') return slot === 'offHand'
  if (def.kind === 'armor') return slot === 'body'
  return false
}

/**
 * Applies shop actions in order to a copy of the state. Stops at the first
 * one that can't be done and says why.
 */
export function applyShop(start: ShopState, actions: ShopAction[], newUid: () => Id): { state: ShopState; error?: string } {
  const state: ShopState = {
    inventory: start.inventory.map(i => ({ ...i })),
    equipped: { ...start.equipped, belt: [...start.equipped.belt] },
    gold: start.gold,
    stock: [...start.stock]
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
    const def = ITEMS[a.defId]
    const at = state.stock.indexOf(a.defId)
    if (!def || at === -1) return { state, error: 'Not for sale.' }
    if (!fits(def, a.slot)) return { state, error: `${def.name} doesn't go there.` }
    if (current) {
      if (!a.old) return { state, error: `Sell or drop your ${current.def.name} first.` }
      if (a.old === 'sell') state.gold += sellPrice(current.def)
      clear(a.slot)
    }
    if (state.gold < def.cost) return { state, error: `${def.name} costs ${def.cost} gold.` }
    state.gold -= def.cost
    state.stock.splice(at, 1)
    const uid = newUid()
    state.inventory.push({ uid, defId: def.id })
    state.equipped[a.slot] = uid
  }
  return { state }
}
