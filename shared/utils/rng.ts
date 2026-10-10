import type { Rng, RngState } from '../types'

/**
 * Counter-based seeded RNG (splitmix32). Output n depends only on (seed, n),
 * so a saved { seed, calls } resumes the exact sequence in O(1) — reloading
 * a battle can't reroll dice.
 */
export interface SeededRng extends Rng {
  readonly state: RngState
  /** Float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}

const splitmix32 = (x: number): number => {
  let z = (x + 0x9e3779b9) | 0
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
  return (z ^ (z >>> 15)) >>> 0
}

/** Mutates `state.calls`, so passing a stored state keeps it in sync. */
export const createRng = (state: RngState): SeededRng => {
  const next = () => {
    const v = splitmix32((state.seed + Math.imul(state.calls, 0x9e3779b9)) | 0)
    state.calls++
    return v / 4294967296
  }
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))

  return {
    state,
    next,
    int,
    pick: items => {
      if (items.length === 0) throw new Error('pick from empty list')
      return items[int(0, items.length - 1)]!
    },
    roll: (dice, sides = 6) => Array.from({ length: dice }, () => int(1, sides))
  }
}

export const randomSeed = (): number => {
  return Math.floor(Math.random() * 2 ** 31)
}
