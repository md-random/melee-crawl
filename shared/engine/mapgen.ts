import type { Biome, Facing, GeneratedMap, Hex, HexKey, MapState, OverlayId, Side, Terrain, TerrainRule } from '../types'
import { createRng, type SeededRng } from '../utils/rng'
import { fromKey, hexKey, neighbor, neighbors, offsetToHex, rectangle } from '../utils/hex'

export const TERRAIN: Record<Terrain, TerrainRule> = {
  clear: { passable: true, blocksLOS: false, moveCost: 1 },
  tree: { passable: false, blocksLOS: true, moveCost: 0 },
  boulder: { passable: false, blocksLOS: true, moveCost: 0 },
  water: { passable: true, blocksLOS: false, moveCost: 2 }
}

/**
 * Spell-made terrain layered on top of base terrain. moveCost is added to the
 * base hex's cost. Values are placeholders until checked against the 2019 rules.
 */
export const OVERLAYS: Record<OverlayId, TerrainRule> = {
  fire: { passable: true, blocksLOS: false, moveCost: 1 },
  wall: { passable: false, blocksLOS: true, moveCost: 0 },
  shadow: { passable: true, blocksLOS: true, moveCost: 0 },
  web: { passable: true, blocksLOS: false, moveCost: 3 }
}

interface BiomeProfile {
  /** Fraction of the map each obstacle should cover. */
  density: Record<Exclude<Terrain, 'clear'>, number>
  clusterSize: [min: number, max: number]
}

export const BIOMES: Record<Biome, BiomeProfile> = {
  plains: { density: { tree: 0.06, boulder: 0.04, water: 0.03 }, clusterSize: [2, 5] },
  forest: { density: { tree: 0.2, boulder: 0.03, water: 0.02 }, clusterSize: [3, 8] },
  swamp: { density: { tree: 0.08, boulder: 0.01, water: 0.16 }, clusterSize: [3, 9] },
  rocky: { density: { tree: 0.03, boulder: 0.15, water: 0.02 }, clusterSize: [2, 6] }
}

/** The biome for a battle seed; every biome is equally likely. */
export const biomeFor = (seed: number): Biome => {
  const all = Object.keys(BIOMES) as Biome[]
  return all[Math.abs(seed) % all.length]!
}

const MAX_ATTEMPTS = 20

export type MapParams = Pick<MapState, 'seed' | 'biome' | 'width' | 'height'>

/**
 * Deterministic: the same params always produce the same map, so only
 * MapParams is saved. Retries with derived seeds until every spawn is reachable.
 */
export const generateMap = (params: MapParams): GeneratedMap & { attempts: number } => {
  const spawns = spawnZones(params.width, params.height)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = createRng({ seed: (params.seed + attempt * 7919) | 0, calls: 0 })
    const hexes = scatterObstacles(params, spawns, rng)
    if (spawnsConnected(hexes, spawns)) return { hexes, spawns, attempts: attempt + 1 }
  }
  // Unreachable in practice; an open field is always valid.
  const open = new Map(rectangle(params.width, params.height).map(h => [hexKey(h), 'clear' as Terrain]))
  return { hexes: open, spawns, attempts: MAX_ATTEMPTS }
}

/** Three hexes on each short edge, centred vertically. */
const spawnZones = (width: number, height: number): Record<Side, HexKey[]> => {
  const mid = Math.floor(height / 2)
  const rows = [mid - 1, mid, mid + 1]
  return {
    player: rows.map(row => hexKey(offsetToHex(1, row))),
    enemy: rows.map(row => hexKey(offsetToHex(width - 2, row)))
  }
}

const scatterObstacles = (params: MapParams, spawns: Record<Side, HexKey[]>, rng: SeededRng): Map<HexKey, Terrain> => {
  const all = rectangle(params.width, params.height)
  const hexes = new Map<HexKey, Terrain>(all.map(h => [hexKey(h), 'clear']))

  // Spawn hexes and their neighbours stay clear.
  const protectedKeys = new Set<HexKey>()
  for (const key of [...spawns.player, ...spawns.enemy]) {
    protectedKeys.add(key)
    for (const n of neighbors(fromKey(key))) protectedKeys.add(hexKey(n))
  }
  const canPlace = (h: Hex) => {
    const key = hexKey(h)
    return hexes.get(key) === 'clear' && !protectedKeys.has(key)
  }

  const { density, clusterSize } = BIOMES[params.biome]
  for (const terrain of ['water', 'boulder', 'tree'] as const) {
    const target = Math.round(density[terrain] * all.length)
    let placed = 0
    for (let guard = 0; placed < target && guard < 200; guard++) {
      const start = rng.pick(all)
      if (!canPlace(start)) continue
      // Random-walk growth gives clumps (woods, ponds) instead of noise.
      const cluster = [start]
      hexes.set(hexKey(start), terrain)
      placed++
      const size = rng.int(clusterSize[0], clusterSize[1])
      for (let step = 0; step < size * 3 && cluster.length < size && placed < target; step++) {
        const next = neighbor(rng.pick(cluster), rng.int(0, 5) as Facing)
        if (!canPlace(next)) continue
        hexes.set(hexKey(next), terrain)
        cluster.push(next)
        placed++
      }
    }
  }
  return hexes
}

/** Flood fill from the first player spawn; every spawn hex must be reachable on foot. */
export const spawnsConnected = (hexes: Map<HexKey, Terrain>, spawns: Record<Side, HexKey[]>): boolean => {
  const start = spawns.player[0]
  if (!start) return false
  const seen = new Set<HexKey>([start])
  const queue: HexKey[] = [start]
  while (queue.length) {
    const current = fromKey(queue.shift()!)
    for (const n of neighbors(current)) {
      const key = hexKey(n)
      const terrain = hexes.get(key)
      if (!terrain || seen.has(key) || !TERRAIN[terrain].passable) continue
      seen.add(key)
      queue.push(key)
    }
  }
  return [...spawns.player, ...spawns.enemy].every(k => seen.has(k))
}
