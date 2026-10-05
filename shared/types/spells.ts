import type { Id } from './core'
import type { AreaShape, EffectDef } from './effects'

/**
 * A spell as data. One generic castSpell action reads these, so a new spell
 * is a new entry in data/spells.ts, not new code.
 */
export interface SpellDef {
  id: Id
  name: string
  icon: string
  minIQ: number
  /** ST spent on a successful cast. */
  stCost: number
  /** Max distance in hexes to the target; 0 = self only. */
  range: number
  target: 'self' | 'unit' | 'hex'
  area: AreaShape
  effects: EffectDef[]
  /** Not yet checked against the 2019 rules. */
  unverified?: boolean
}
