import type { Attributes, ItemDef, OwnedTalent } from '../types'
import { damageOdds, hitChance } from './combat'
import { adjustedDx, type Loadout } from './rules'

export interface GearPower {
  hit: number
  perTurn: number
  stops: number
}

export interface PowerComparison {
  before: GearPower
  after: GearPower
  power: number
}

export const gearPower = (attrs: Attributes, talents: OwnedTalent[], gear: Loadout): GearPower => {
  const stops = (gear.armor?.hitsStopped ?? 0) + (gear.shield?.hitsStopped ?? 0)
  if (!gear.weapon) return { hit: 0, perTurn: 0, stops }
  const hit = hitChance(3, adjustedDx(attrs, talents, gear).value)
  return { hit, perTurn: hit * damageOdds(gear.weapon.damage, 0, 0, 0).mean, stops }
}

export const withItem = (gear: Loadout, def: ItemDef): Loadout => {
  if (def.kind === 'weapon') return { ...gear, weapon: def }
  if (def.kind === 'armor') return { ...gear, armor: def }
  if (def.kind === 'shield') return { ...gear, shield: def, offWeapon: undefined }
  return gear
}

export const comparePower = (attrs: Attributes, talents: OwnedTalent[], current: Loadout, next: Loadout): PowerComparison => {
  const before = gearPower(attrs, talents, current)
  const after = gearPower(attrs, talents, next)
  return { before, after, power: after.perTurn - before.perTurn + after.stops - before.stops }
}
