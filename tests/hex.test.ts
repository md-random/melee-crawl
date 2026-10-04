import { describe, expect, it } from 'vitest'
import {
  fromKey, hexDistance, hexKey, hexLine, hexToOffset, hexToPixel,
  neighbors, offsetToHex, pixelToHex, rectangle
} from '#shared/utils/hex'

describe('hex math', () => {
  const origin = { q: 0, r: 0 }

  it('has six neighbours at distance 1', () => {
    const ns = neighbors(origin)
    expect(ns).toHaveLength(6)
    for (const n of ns) expect(hexDistance(origin, n)).toBe(1)
  })

  it('measures distance', () => {
    expect(hexDistance(origin, { q: 3, r: -1 })).toBe(3)
    expect(hexDistance({ q: -2, r: 2 }, { q: 2, r: -1 })).toBe(4)
  })

  it('round-trips keys, offsets and pixels', () => {
    for (const h of rectangle(8, 6)) {
      expect(fromKey(hexKey(h))).toEqual(h)
      const { col, row } = hexToOffset(h)
      expect(offsetToHex(col, row)).toEqual(h)
      expect(pixelToHex(hexToPixel(h, 30), 30)).toEqual(h)
    }
  })

  it('draws contiguous lines', () => {
    const line = hexLine(origin, { q: 4, r: -2 })
    expect(line).toHaveLength(5)
    expect(line[0]).toEqual(origin)
    expect(line.at(-1)).toEqual({ q: 4, r: -2 })
    for (let i = 1; i < line.length; i++) expect(hexDistance(line[i - 1]!, line[i]!)).toBe(1)
  })
})
