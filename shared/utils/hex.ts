import type { Facing, Hex, HexKey } from '../types'

// Axial coordinates, flat-top hexes. Reference: redblobgames.com/grids/hexagons

/** Indexed by Facing: NE, SE, S, SW, NW, N. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 }
]

export const hexKey = (h: Hex): HexKey => `${h.q},${h.r}`

export const fromKey = (key: HexKey): Hex => {
  const [q, r] = key.split(',').map(Number)
  return { q: q!, r: r! }
}

export const hexEquals = (a: Hex, b: Hex) => a.q === b.q && a.r === b.r
export const hexAdd = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r })
export const neighbor = (h: Hex, dir: Facing): Hex => hexAdd(h, DIRECTIONS[dir]!)
export const neighbors = (h: Hex): Hex[] => DIRECTIONS.map(d => hexAdd(h, d))

export const hexDistance = (a: Hex, b: Hex): number => {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

const hexRound = (q: number, r: number): Hex => {
  const s = -q - r
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)
  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)
  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs
  // +0 normalizes -0 so keys stay stable
  return { q: rq + 0, r: rr + 0 }
}

/** Hexes on the straight line from a to b, inclusive. Used for line of sight. */
export const hexLine = (a: Hex, b: Hex): Hex[] => {
  const n = hexDistance(a, b)
  if (n === 0) return [a]
  // nudge avoids ties on hex edges
  const aq = a.q + 1e-6
  const ar = a.r + 1e-6
  const out: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push(hexRound(aq + (b.q - aq) * t, ar + (b.r - ar) * t))
  }
  return out
}

// ---------- offset (col,row) <-> axial, for rectangular maps ----------

export const offsetToHex = (col: number, row: number): Hex => ({ q: col, r: row - Math.floor(col / 2) })
export const hexToOffset = (h: Hex) => ({ col: h.q, row: h.r + Math.floor(h.q / 2) })

/** All hexes of a width × height rectangle (even-q layout). */
export const rectangle = (width: number, height: number): Hex[] => {
  const out: Hex[] = []
  for (let col = 0; col < width; col++) {
    for (let row = 0; row < height; row++) out.push(offsetToHex(col, row))
  }
  return out
}

// ---------- pixels ----------

const SQRT3 = Math.sqrt(3)

export interface Point { x: number; y: number }

export const hexToPixel = (h: Hex, size: number): Point => {
  return { x: size * 1.5 * h.q, y: size * SQRT3 * (h.r + h.q / 2) }
}

export const pixelToHex = (p: Point, size: number): Hex => {
  const q = (2 / 3) * p.x / size
  const r = (-p.x / 3 + (SQRT3 / 3) * p.y) / size
  return hexRound(q, r)
}

export const hexCorners = (center: Point, size: number): Point[] => {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i
    return { x: center.x + size * Math.cos(a), y: center.y + size * Math.sin(a) }
  })
}
