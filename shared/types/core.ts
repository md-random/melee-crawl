// Core primitives shared by every module. No Vue imports anywhere in shared/.

export type Id = string

/** Axial hex coordinate. */
export interface Hex { q: number; r: number }
/** Map key form of a Hex: `${q},${r}` */
export type HexKey = `${number},${number}`
/** 0..5, clockwise from north-east (flat-top hexes): NE, SE, S, SW, NW, N. */
export type Facing = 0 | 1 | 2 | 3 | 4 | 5

export type AttrKey = 'ST' | 'DX' | 'IQ'
export type Attributes = Record<AttrKey, number>

/** TFT damage notation, e.g. 2d-1 → { dice: 2, mod: -1 } */
export interface DiceExpr { dice: number; mod: number }

/** Seeded RNG state; `calls` lets a reload resume the exact same sequence. */
export interface RngState { seed: number; calls: number }

export type Side = 'player' | 'enemy'
