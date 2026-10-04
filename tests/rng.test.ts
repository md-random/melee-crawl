import { describe, expect, it } from 'vitest'
import { createRng } from '#shared/utils/rng'

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng({ seed: 42, calls: 0 })
    const b = createRng({ seed: 42, calls: 0 })
    expect(a.roll(10)).toEqual(b.roll(10))
  })

  it('resumes from a saved state without rerolling', () => {
    const full = createRng({ seed: 7, calls: 0 })
    const first = full.roll(5)
    const rest = full.roll(5)

    const saved = { seed: 7, calls: 0 }
    expect(createRng(saved).roll(5)).toEqual(first)
    expect(saved.calls).toBe(5)
    expect(createRng({ ...saved }).roll(5)).toEqual(rest)
  })

  it('rolls within range and covers every face', () => {
    const rng = createRng({ seed: 1, calls: 0 })
    const faces = new Set(rng.roll(2000))
    expect([...faces].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('3d6 averages about 10.5', () => {
    const rng = createRng({ seed: 99, calls: 0 })
    let sum = 0
    for (let i = 0; i < 20000; i++) sum += rng.roll(3).reduce((s, d) => s + d, 0)
    expect(sum / 20000).toBeCloseTo(10.5, 0)
  })
})
