import { describe, expect, it } from 'vitest'
import { ITEMS } from '#shared/data/items'
import { newItem } from '#shared/engine/items'
import { applyShop, itemIn, sellPrice, shopStock, type ShopState } from '#shared/engine/shop'

/** A hero with a dagger and leather armor, 100 gold, and a shop selling a broadsword and a small shield. */
const start = (): ShopState => ({
  inventory: [newItem('d', 'dagger'), newItem('l', 'leather')],
  equipped: { mainHand: 'd', body: 'l', belt: [] },
  gold: 100,
  stock: [newItem('s-broad', 'broadsword', 'cool'), newItem('s-shield', 'smallShield')]
})

describe('shop stock', () => {
  it('has 2 weapons, 2 armors and 2 shields, the same for the same seed', () => {
    const stock = shopStock(7)
    const kinds = stock.map(i => ITEMS[i.defId]!.kind)
    expect(kinds).toEqual(['weapon', 'weapon', 'armor', 'armor', 'shield', 'shield'])
    expect(new Set(stock.map(i => i.defId)).size).toBe(6)
    expect(new Set(stock.map(i => i.uid)).size).toBe(6)
    expect(stock.every(i => i.grade === 'ordinary' && i.traits.length === 0)).toBe(true)
    expect(shopStock(7)).toEqual(stock)
  })

  it('takes other counts', () => {
    const kinds = shopStock(7, { weapon: 4, armor: 1, shield: 0 }).map(i => ITEMS[i.defId]!.kind)
    expect(kinds).toEqual(['weapon', 'weapon', 'weapon', 'weapon', 'armor'])
  })
})

describe('buying and selling', () => {
  it('buys into an empty slot and takes it off the shelf', () => {
    const { state, error } = applyShop(start(), [{ kind: 'buy', uid: 's-shield', slot: 'offHand' }])
    expect(error).toBeUndefined()
    expect(itemIn(state, 'offHand')?.def.id).toBe('smallShield')
    expect(state.gold).toBe(100 - ITEMS.smallShield!.cost)
    expect(state.stock.map(i => i.uid)).toEqual(['s-broad'])
  })

  it('moves the item itself to the hero, grade and all', () => {
    const { state } = applyShop(start(), [{ kind: 'buy', uid: 's-broad', slot: 'mainHand', old: 'sell' }])
    expect(itemIn(state, 'mainHand')?.inst).toEqual(newItem('s-broad', 'broadsword', 'cool'))
  })

  it('selling the old item helps pay; dropping it gives nothing', () => {
    const sold = applyShop(start(), [{ kind: 'buy', uid: 's-broad', slot: 'mainHand', old: 'sell' }]).state
    expect(sold.gold).toBe(100 + sellPrice(ITEMS.dagger!) - ITEMS.broadsword!.cost)
    expect(sold.inventory.some(i => i.defId === 'dagger')).toBe(false)
    const dropped = applyShop(start(), [{ kind: 'buy', uid: 's-broad', slot: 'mainHand', old: 'drop' }]).state
    expect(dropped.gold).toBe(100 - ITEMS.broadsword!.cost)
  })

  it('sells for half the price, rounded down', () => {
    const { state } = applyShop(start(), [{ kind: 'sell', slot: 'body' }])
    expect(state.gold).toBe(100 + Math.floor(ITEMS.leather!.cost / 2))
    expect(itemIn(state, 'body')).toBeUndefined()
  })

  it('refuses what it can\'t do', () => {
    const poor = { ...start(), gold: 0 }
    expect(applyShop(poor, [{ kind: 'buy', uid: 's-shield', slot: 'offHand' }]).error).toMatch(/costs/)
    expect(applyShop(start(), [{ kind: 'buy', uid: 'nope', slot: 'body', old: 'sell' }]).error).toBe('Not for sale.')
    expect(applyShop(start(), [{ kind: 'buy', uid: 's-broad', slot: 'mainHand' }]).error).toBe('Sell or drop your Ordinary Dagger first.')
    expect(applyShop(start(), [{ kind: 'buy', uid: 's-shield', slot: 'body', old: 'sell' }]).error).toBe('Ordinary Small Shield doesn\'t go there.')
  })

  it('leaves the starting state untouched', () => {
    const s = start()
    applyShop(s, [{ kind: 'sell', slot: 'mainHand' }, { kind: 'buy', uid: 's-broad', slot: 'mainHand' }])
    expect(s).toEqual(start())
  })
})
