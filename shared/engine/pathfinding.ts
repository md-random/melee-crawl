import type { GeneratedMap, Hex, HexKey, MapState } from '../types'
import { fromKey, hexDistance, hexKey, hexLine, neighbors } from '../utils/hex'
import { OVERLAYS, TERRAIN } from './mapgen'

/** Things on top of base terrain that affect movement and sight. */
export interface Obstructions {
  overlays?: MapState['overlays']
  /** Hexes holding a unit: can't be entered, and block line of sight. */
  occupied?: ReadonlySet<HexKey>
  /** Hexes that end movement: can be entered but not left (engagement). */
  stops?: ReadonlySet<HexKey>
}

/** Cost to enter a hex, or null if it can't be entered. */
export function enterCost(map: GeneratedMap, key: HexKey, obs: Obstructions = {}): number | null {
  const terrain = map.hexes.get(key)
  if (!terrain || !TERRAIN[terrain].passable || obs.occupied?.has(key)) return null
  const overlay = obs.overlays?.[key]
  if (!overlay) return TERRAIN[terrain].moveCost
  const rule = OVERLAYS[overlay.overlay]
  return rule.passable ? TERRAIN[terrain].moveCost + rule.moveCost : null
}

export function blocksSight(map: GeneratedMap, key: HexKey, obs: Obstructions = {}): boolean {
  const terrain = map.hexes.get(key)
  if (!terrain || TERRAIN[terrain].blocksLOS || obs.occupied?.has(key)) return true
  const overlay = obs.overlays?.[key]
  return !!overlay && OVERLAYS[overlay.overlay].blocksLOS
}

/** Pops the cheapest entry. Maps are ~150 hexes, so a linear scan is fine. */
function popMin(open: [HexKey, number][]): [HexKey, number] {
  let i = 0
  for (let j = 1; j < open.length; j++) if (open[j]![1] < open[i]![1]) i = j
  return open.splice(i, 1)[0]!
}

/** Every hex reachable within `ma` movement points, mapped to its cheapest cost. Includes the start hex. */
export function reachable(map: GeneratedMap, from: Hex, ma: number, obs: Obstructions = {}): Map<HexKey, number> {
  const start = hexKey(from)
  const best = new Map<HexKey, number>([[start, 0]])
  const open: [HexKey, number][] = [[start, 0]]
  while (open.length) {
    const [key, cost] = popMin(open)
    if (cost > best.get(key)!) continue
    if (key !== start && obs.stops?.has(key)) continue
    for (const n of neighbors(fromKey(key))) {
      const nk = hexKey(n)
      const step = enterCost(map, nk, obs)
      if (step === null) continue
      const total = cost + step
      if (total > ma || total >= (best.get(nk) ?? Infinity)) continue
      best.set(nk, total)
      open.push([nk, total])
    }
  }
  return best
}

/** Cheapest path (A*), both ends included, or null if the goal can't be reached. */
export function findPath(map: GeneratedMap, from: Hex, to: Hex, obs: Obstructions = {}): Hex[] | null {
  const start = hexKey(from)
  const goal = hexKey(to)
  if (start === goal) return [from]
  if (enterCost(map, goal, obs) === null) return null
  const g = new Map<HexKey, number>([[start, 0]])
  const came = new Map<HexKey, HexKey>()
  const open: [HexKey, number][] = [[start, hexDistance(from, to)]]
  while (open.length) {
    const [key] = popMin(open)
    if (key === goal) {
      const path = [fromKey(goal)]
      for (let k = goal; came.has(k);) {
        k = came.get(k)!
        path.unshift(fromKey(k))
      }
      return path
    }
    if (key !== start && obs.stops?.has(key)) continue
    for (const n of neighbors(fromKey(key))) {
      const nk = hexKey(n)
      const step = enterCost(map, nk, obs)
      if (step === null) continue
      const total = g.get(key)! + step
      if (total >= (g.get(nk) ?? Infinity)) continue
      g.set(nk, total)
      came.set(nk, key)
      open.push([nk, total + hexDistance(n, to)])
    }
  }
  return null
}

/** True if no hex strictly between a and b blocks sight. */
export function lineOfSight(map: GeneratedMap, a: Hex, b: Hex, obs: Obstructions = {}): boolean {
  return hexLine(a, b).slice(1, -1).every(h => !blocksSight(map, hexKey(h), obs))
}
