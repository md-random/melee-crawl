import type { ArmorDef, ItemDef, ShieldDef, WeaponDef, WeaponSpec } from '../types'
import WEAPON_LIST from './weapons.json'

// Damage and ST minimums follow the classic Melee tables; weights (kg) and
// costs ($) are placeholders. All marked unverified until checked against
// the 2019 rules.

const armor = (a: Omit<ArmorDef, 'kind' | 'unverified'>): ArmorDef => ({ kind: 'armor', unverified: true, ...a })
const shield = (s: Omit<ShieldDef, 'kind' | 'unverified'>): ShieldDef => ({ kind: 'shield', unverified: true, ...s })

const WEAPON_DEFS: WeaponDef[] = (WEAPON_LIST as WeaponSpec[]).map(w => ({ kind: 'weapon', ...w }))

const LIST: ItemDef[] = [
  ...WEAPON_DEFS,

  // ---------- armor ----------
  armor({ id: 'leather', name: 'Leather Armor', icon: '🥋', hitsStopped: 2, dxPenalty: 2, maxMA: 8, weight: 7, cost: 50 }),
  armor({ id: 'chainmail', name: 'Chainmail', icon: '⛓', hitsStopped: 3, dxPenalty: 4, maxMA: 6, weight: 12, cost: 150 }),
  armor({ id: 'plate', name: 'Plate Armor', icon: '🛡', hitsStopped: 5, dxPenalty: 6, maxMA: 6, weight: 25, cost: 500 }),

  // ---------- shields ----------
  shield({ id: 'smallShield', name: 'Small Shield', icon: '🛡', hitsStopped: 1, dxPenalty: 0, weight: 3, cost: 30 }),
  shield({ id: 'largeShield', name: 'Large Shield', icon: '🛡', hitsStopped: 2, dxPenalty: 1, weight: 6, cost: 60 })
]

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(LIST.map(i => [i.id, i]))

export const weapons = (): WeaponDef[] => LIST.filter((i): i is WeaponDef => i.kind === 'weapon')
export const armors = (): ArmorDef[] => LIST.filter((i): i is ArmorDef => i.kind === 'armor')
export const shields = (): ShieldDef[] => LIST.filter((i): i is ShieldDef => i.kind === 'shield')
