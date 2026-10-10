import { describe, expect, it } from 'vitest'
import { GRADES, GRADE_ORDER } from '#shared/data/grades'
import { ITEM_TRAITS } from '#shared/data/itemTraits'
import { defOf, gradeOf, itemName, newItem } from '#shared/engine/items'

describe('grades', () => {
  it('run Ordinary, Cool, Bitchin, Righteous in green, blue, purple, orange', () => {
    expect(GRADE_ORDER.map(g => GRADES[g].name)).toEqual(['Ordinary', 'Cool', 'Bitchin', 'Righteous'])
    expect(GRADE_ORDER.map(g => GRADES[g].rank)).toEqual([1, 2, 3, 4])
  })

  it('new items are Ordinary with no traits', () => {
    expect(newItem('a', 'dagger')).toEqual({ uid: 'a', defId: 'dagger', grade: 'ordinary', traits: [] })
    expect(gradeOf(newItem('a', 'dagger')).name).toBe('Ordinary')
  })
})

describe('item names', () => {
  it('put the grade before the base name', () => {
    expect(itemName(newItem('a', 'dagger'))).toBe('Ordinary Dagger')
    expect(itemName(newItem('b', 'plate', 'righteous'))).toBe('Righteous Plate Armor')
  })

  it('add trait names between grade and base', () => {
    ITEM_TRAITS.testFlame = { id: 'testFlame', name: 'Flame', type: 'element', appliesTo: ['weapon'], description: '' }
    try {
      expect(itemName(newItem('c', 'broadsword', 'cool', ['testFlame']))).toBe('Cool Flame Broadsword')
    } finally {
      delete ITEM_TRAITS.testFlame
    }
  })

  it('look up the base item', () => {
    expect(defOf(newItem('a', 'dagger'))?.name).toBe('Dagger')
    expect(defOf(newItem('a', 'nothing'))).toBeUndefined()
  })
})
