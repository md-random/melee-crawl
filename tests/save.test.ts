import { describe, expect, it } from 'vitest'
import type { SaveFile } from '#shared/types'
import { SCHEMA_VERSION } from '#shared/types'
import { loadSave } from '#shared/engine/save'

const empty = (): SaveFile => ({ schemaVersion: SCHEMA_VERSION, graveyard: [], settings: { animationSpeed: 1, logLimit: 2000 } })

describe('loading saves', () => {
  it('starts empty when there is no save', () => {
    expect(loadSave(null, empty)).toEqual({ save: empty() })
  })

  it('upgrades a version 1 save instead of deleting it', () => {
    const v1 = {
      schemaVersion: 1,
      run: { screen: 'battle', character: { id: 'h', name: 'Hero' }, battle: { units: { h: { uid: 'h' }, enemy0: { uid: 'enemy0' } } } },
      graveyard: [{ name: 'Old hero' }],
      settings: { animationSpeed: 1, logLimit: 2000 }
    }
    const { save, backup } = loadSave(JSON.stringify(v1), empty)
    expect(backup).toBeUndefined()
    expect(save.schemaVersion).toBe(SCHEMA_VERSION)
    expect(save.run?.character.name).toBe('Hero')
    expect(save.graveyard).toHaveLength(1)
    for (const u of Object.values(save.run!.battle!.units)) expect(u.traits).toEqual([])
  })

  it('makes version 2 items Ordinary and turns the shop shelf into items', () => {
    const v2 = {
      schemaVersion: 2,
      run: {
        screen: 'camp',
        character: { id: 'h', name: 'Hero', inventory: [{ uid: 'd', defId: 'dagger' }] },
        battle: { units: { h: { uid: 'h', inventory: [{ uid: 'x', defId: 'leather' }] } } },
        shop: { stock: ['broadsword', 'smallShield'] }
      },
      graveyard: [],
      settings: { animationSpeed: 1, logLimit: 2000 }
    }
    const { save, backup } = loadSave(JSON.stringify(v2), empty)
    expect(backup).toBeUndefined()
    expect(save.run!.character.inventory).toEqual([{ uid: 'd', defId: 'dagger', grade: 'ordinary', traits: [] }])
    expect(save.run!.battle!.units.h!.inventory).toEqual([{ uid: 'x', defId: 'leather', grade: 'ordinary', traits: [] }])
    expect(save.run!.shop!.stock.map(i => [i.defId, i.grade])).toEqual([['broadsword', 'ordinary'], ['smallShield', 'ordinary']])
    expect(new Set(save.run!.shop!.stock.map(i => i.uid)).size).toBe(2)
  })

  it('keeps an unreadable save as a backup instead of losing it', () => {
    expect(loadSave('{not json', empty)).toEqual({ save: empty(), backup: '{not json' })
    const newer = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, graveyard: [] })
    expect(loadSave(newer, empty)).toEqual({ save: empty(), backup: newer })
  })

  it('loads a current save unchanged', () => {
    const current = { ...empty(), graveyard: [] }
    expect(loadSave(JSON.stringify(current), empty).save).toEqual(current)
  })
})
