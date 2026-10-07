import { describe, expect, it } from 'vitest'
import type { Biome } from '#shared/types'
import { BIOMES, TERRAIN, biomeFor, generateMap, spawnsConnected } from '#shared/engine/mapgen'

const params = { seed: 1234, biome: 'forest' as Biome, width: 15, height: 11 }

describe('generateMap', () => {
  it('is deterministic for the same params', () => {
    const a = generateMap(params)
    const b = generateMap(params)
    expect([...a.hexes]).toEqual([...b.hexes])
  })

  it('differs between seeds', () => {
    const a = generateMap(params)
    const b = generateMap({ ...params, seed: 5678 })
    expect([...a.hexes]).not.toEqual([...b.hexes])
  })

  it('fills the full rectangle', () => {
    expect(generateMap(params).hexes.size).toBe(15 * 11)
  })

  it('keeps spawns clear and reachable across many seeds and biomes', () => {
    for (const biome of Object.keys(BIOMES) as Biome[]) {
      for (let seed = 0; seed < 200; seed++) {
        const map = generateMap({ ...params, biome, seed })
        for (const key of [...map.spawns.player, ...map.spawns.enemy]) {
          expect(map.hexes.get(key)).toBe('clear')
        }
        expect(spawnsConnected(map.hexes, map.spawns)).toBe(true)
      }
    }
  })

  it('picks every biome across seeds, the same one for the same seed', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, seed) => biomeFor(seed)))
    expect([...seen].sort()).toEqual(Object.keys(BIOMES).sort())
    expect(biomeFor(12345)).toBe(biomeFor(12345))
  })

  it('roughly matches biome density', () => {
    let obstacles = 0
    const runs = 50
    for (let seed = 0; seed < runs; seed++) {
      const map = generateMap({ ...params, seed })
      obstacles += [...map.hexes.values()].filter(t => !TERRAIN[t].passable).length
    }
    const expected = (BIOMES.forest.density.tree + BIOMES.forest.density.boulder) * 15 * 11
    expect(obstacles / runs).toBeGreaterThan(expected * 0.7)
    expect(obstacles / runs).toBeLessThanOrEqual(expected * 1.05)
  })
})
