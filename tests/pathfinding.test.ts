import { describe, expect, it } from 'vitest'
import type { Biome, GeneratedMap, HexKey, Terrain } from '#shared/types'
import { generateMap } from '#shared/engine/mapgen'
import { findPath, lineOfSight, reachable } from '#shared/engine/pathfinding'
import { hexDistance, hexKey, neighbors, rectangle } from '#shared/utils/hex'

/** Open 7×7 field with the given terrain overrides. */
const field = (overrides: Record<HexKey, Terrain> = {}): GeneratedMap => {
  const hexes = new Map<HexKey, Terrain>(rectangle(7, 7).map(h => [hexKey(h), 'clear']))
  for (const [k, t] of Object.entries(overrides)) hexes.set(k, t)
  return { hexes, spawns: { player: [], enemy: [] } }
}

const a = { q: 0, r: 2 }
const b = { q: 4, r: 0 }

describe('reachable', () => {
  it('covers exactly the hexes within MA on open ground', () => {
    const map = field()
    const start = { q: 3, r: 1 }
    const out = reachable(map, start, 2)
    for (const key of map.hexes.keys()) {
      const [q, r] = key.split(',').map(Number)
      expect(out.has(key)).toBe(hexDistance(start, { q: q!, r: r! }) <= 2)
    }
  })

  it('charges water double and never enters trees or occupied hexes', () => {
    const start = { q: 3, r: 1 }
    const [w, t, o] = neighbors(start)
    const map = field({ [hexKey(w!)]: 'water', [hexKey(t!)]: 'tree' })
    const out = reachable(map, start, 1, { occupied: new Set([hexKey(o!)]) })
    expect(out.has(hexKey(w!))).toBe(false)
    expect(reachable(map, start, 2).get(hexKey(w!))).toBe(2)
    expect(out.has(hexKey(t!))).toBe(false)
    expect(out.has(hexKey(o!))).toBe(false)
  })

  it('adds overlay costs and treats walls as impassable', () => {
    const start = { q: 3, r: 1 }
    const [web, wall] = neighbors(start)
    const overlays = {
      [hexKey(web!)]: { overlay: 'web' as const, effectUid: 'e1' },
      [hexKey(wall!)]: { overlay: 'wall' as const, effectUid: 'e2' }
    }
    const out = reachable(field(), start, 10, { overlays })
    expect(out.get(hexKey(web!))).toBe(4)
    expect(out.has(hexKey(wall!))).toBe(false)
  })

  it('enters stop hexes but never moves on from them', () => {
    // A ring of stops around the start: each is reachable, nothing past them is.
    const start = { q: 3, r: 1 }
    const stops = new Set(neighbors(start).map(hexKey))
    const out = reachable(field(), start, 5, { stops })
    expect([...out.keys()].sort()).toEqual([hexKey(start), ...stops].sort())
  })
})

describe('findPath', () => {
  it('finds a shortest path on open ground', () => {
    const path = findPath(field(), a, b)!
    expect(path[0]).toEqual(a)
    expect(path.at(-1)).toEqual(b)
    expect(path).toHaveLength(hexDistance(a, b) + 1)
    for (let i = 1; i < path.length; i++) expect(hexDistance(path[i - 1]!, path[i]!)).toBe(1)
  })

  it('goes around obstacles and returns null when walled in', () => {
    const blocked = Object.fromEntries(neighbors(b).map(n => [hexKey(n), 'boulder' as Terrain]))
    expect(findPath(field(blocked), a, b)).toBeNull()
    expect(findPath(field({ [hexKey(b)]: 'tree' }), a, b)).toBeNull()
  })

  it('connects every spawn on generated maps', () => {
    for (const biome of ['forest', 'swamp', 'rocky'] as Biome[]) {
      for (let seed = 0; seed < 30; seed++) {
        const map = generateMap({ seed, biome, width: 15, height: 11 })
        const [p] = map.spawns.player
        for (const e of map.spawns.enemy) {
          const [eq, er] = e.split(',').map(Number)
          const [pq, pr] = p!.split(',').map(Number)
          expect(findPath(map, { q: pq!, r: pr! }, { q: eq!, r: er! })).not.toBeNull()
        }
      }
    }
  })
})

describe('lineOfSight', () => {
  const mid = { q: 2, r: 1 }

  it('is clear on open ground, blocked by trees, not by water', () => {
    expect(lineOfSight(field(), a, b)).toBe(true)
    expect(lineOfSight(field({ [hexKey(mid)]: 'tree' }), a, b)).toBe(false)
    expect(lineOfSight(field({ [hexKey(mid)]: 'water' }), a, b)).toBe(true)
  })

  it('is blocked by units and shadow overlays but ignores the end hexes', () => {
    expect(lineOfSight(field(), a, b, { occupied: new Set([hexKey(mid)]) })).toBe(false)
    expect(lineOfSight(field(), a, b, { occupied: new Set([hexKey(a), hexKey(b)]) })).toBe(true)
    const overlays = { [hexKey(mid)]: { overlay: 'shadow' as const, effectUid: 'e' } }
    expect(lineOfSight(field(), a, b, { overlays })).toBe(false)
  })
})
