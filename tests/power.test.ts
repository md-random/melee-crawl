import { describe, expect, it } from 'vitest'
import type { ArmorDef, WeaponDef } from '#shared/types'
import { ITEMS } from '#shared/data/items'
import { comparePower, gearPower, withItem } from '#shared/engine/power'
import { addTalent } from '#shared/engine/rules'

const attrs = { ST: 12, DX: 12, IQ: 8 }
const talents = addTalent(addTalent([], 'sword'), 'dagger')
const dagger = ITEMS.dagger as WeaponDef
const broadsword = ITEMS.broadsword as WeaponDef
const leather = ITEMS.leather as ArmorDef
const chainmail = ITEMS.chainmail as ArmorDef

describe('gear power', () => {
  it('works out the chance to hit and damage per turn from the dice', () => {
    const p = gearPower(attrs, talents, { weapon: broadsword })
    expect(p.hit).toBeCloseTo(160 / 216)
    expect(p.perTurn).toBeCloseTo((160 / 216) * 7)
    expect(p.stops).toBe(0)
  })

  it('counts nothing for no weapon', () => {
    expect(gearPower(attrs, talents, { armor: leather })).toEqual({ hit: 0, perTurn: 0, stops: 2 })
  })

  it('compares a new weapon with the current one', () => {
    const current = { weapon: dagger }
    const c = comparePower(attrs, talents, current, withItem(current, broadsword))
    expect(c.before.perTurn).toBeCloseTo((160 / 216) * 2.5)
    expect(c.power).toBeCloseTo((160 / 216) * 4.5)
  })

  it('weighs heavier armor: lower chance to hit, more damage stopped', () => {
    const current = { weapon: broadsword, armor: leather }
    const c = comparePower(attrs, talents, current, withItem(current, chainmail))
    expect(c.before.hit).toBeCloseTo(108 / 216)
    expect(c.after.hit).toBeCloseTo(56 / 216)
    expect(c.power).toBeCloseTo((56 / 216) * 7 - (108 / 216) * 7 + 1)
  })

  it('a shield replaces a second weapon', () => {
    expect(withItem({ weapon: dagger, offWeapon: dagger }, ITEMS.smallShield!).offWeapon).toBeUndefined()
  })
})
