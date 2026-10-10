import { describe, expect, it } from 'vitest'
import { ITEMS } from '#shared/data/items'
import { applyShop, itemIn, sellPrice, shopStock, type ShopState } from '#shared/engine/shop'

let n = 0
const uid = () => `new${n++}`

/** A hero with a dagger and leather armor, 100 gold, and a shop selling a broadsword and a small shield. */
const start = (): ShopState => ({
  inventory: [{ uid: 'd', defId: 'dagger' }, { uid: 'l', defId: 'leather' }],
  equipped: { mainHand: 'd', body: 'l', belt: [] },
  gold: 100,
  stock: ['broadsword', 'smallShield']
})

describe('shop stock', () => {
  it('has 2 weapons, 2 armors and 2 shields, the same for the same seed', () => {
    const stock = shopStock(7)
    const kinds = stock.map(id => ITEMS[id]!.kind)
    expect(kinds).toEqual(['weapon', 'weapon', 'armor', 'armor', 'shield', 'shield'])
    expect(new Set(stock).size).toBe(6)
    expect(shopStock(7)).toEqual(stock)
  })
})

describe('buying and selling', () => {
  it('buys into an empty slot and takes it off the shelf', () => {
    const { state, error } = applyShop(start(), [{ kind: 'buy', defId: 'smallShield', slot: 'offHand' }], uid)
    expect(error).toBeUndefined()
    expect(itemIn(state, 'offHand')?.def.id).toBe('smallShield')
    expect(state.gold).toBe(100 - ITEMS.smallShield!.cost)
    expect(state.stock).toEqual(['broadsword'])
  })

  it('selling the old item helps pay; dropping it gives nothing', () => {
    const sold = applyShop(start(), [{ kind: 'buy', defId: 'broadsword', slot: 'mainHand', old: 'sell' }], uid).state
    expect(sold.gold).toBe(100 + sellPrice(ITEMS.dagger!) - ITEMS.broadsword!.cost)
    expect(sold.inventory.some(i => i.defId === 'dagger')).toBe(false)
    const dropped = applyShop(start(), [{ kind: 'buy', defId: 'broadsword', slot: 'mainHand', old: 'drop' }], uid).state
    expect(dropped.gold).toBe(100 - ITEMS.broadsword!.cost)
  })

  it('sells for half the price, rounded down', () => {
    const { state } = applyShop(start(), [{ kind: 'sell', slot: 'body' }], uid)
    expect(state.gold).toBe(100 + Math.floor(ITEMS.leather!.cost / 2))
    expect(itemIn(state, 'body')).toBeUndefined()
  })

  it('refuses what it can\'t do', () => {
    const poor = { ...start(), gold: 0 }
    expect(applyShop(poor, [{ kind: 'buy', defId: 'smallShield', slot: 'offHand' }], uid).error).toMatch(/costs/)
    expect(applyShop(start(), [{ kind: 'buy', defId: 'plate', slot: 'body', old: 'sell' }], uid).error).toBe('Not for sale.')
    expect(applyShop(start(), [{ kind: 'buy', defId: 'broadsword', slot: 'mainHand' }], uid).error).toMatch(/Sell or drop/)
    expect(applyShop(start(), [{ kind: 'buy', defId: 'smallShield', slot: 'body', old: 'sell' }], uid).error).toMatch(/doesn't go there/)
  })

  it('leaves the starting state untouched', () => {
    const s = start()
    applyShop(s, [{ kind: 'sell', slot: 'mainHand' }], uid)
    expect(s).toEqual(start())
  })
})
