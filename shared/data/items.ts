import type { ArmorDef, ItemDef, ShieldDef, WeaponDef } from '../types'

// Damage and ST minimums follow the classic Melee tables; weights (kg) and
// costs ($) are placeholders. All marked unverified until checked against
// the 2019 rules.

const weapon = (w: Omit<WeaponDef, 'kind' | 'unverified'>): WeaponDef => ({ kind: 'weapon', unverified: true, ...w })
const armor = (a: Omit<ArmorDef, 'kind' | 'unverified'>): ArmorDef => ({ kind: 'armor', unverified: true, ...a })
const shield = (s: Omit<ShieldDef, 'kind' | 'unverified'>): ShieldDef => ({ kind: 'shield', unverified: true, ...s })

const LIST: ItemDef[] = [
  // ---------- blades ----------
  weapon({ id: 'dagger', name: 'Dagger', icon: '🗡', talent: 'dagger', damage: { dice: 1, mod: -1 }, minST: 0, hands: 1, attackKind: 'melee', weight: 0.5, cost: 10 }),
  weapon({ id: 'rapier', name: 'Rapier', icon: '🤺', talent: 'sword', damage: { dice: 1, mod: 0 }, minST: 9, hands: 1, attackKind: 'melee', weight: 1, cost: 40 }),
  weapon({ id: 'cutlass', name: 'Cutlass', icon: '⚔', talent: 'sword', damage: { dice: 2, mod: -2 }, minST: 10, hands: 1, attackKind: 'melee', weight: 1.5, cost: 50 }),
  weapon({ id: 'shortsword', name: 'Shortsword', icon: '⚔', talent: 'sword', damage: { dice: 2, mod: -1 }, minST: 11, hands: 1, attackKind: 'melee', weight: 1.5, cost: 60 }),
  weapon({ id: 'broadsword', name: 'Broadsword', icon: '⚔', talent: 'sword', damage: { dice: 2, mod: 0 }, minST: 12, hands: 1, attackKind: 'melee', weight: 2, cost: 80 }),
  weapon({ id: 'bastardSword', name: 'Bastard Sword', icon: '⚔', talent: 'sword', damage: { dice: 2, mod: 1 }, minST: 13, hands: 1, attackKind: 'melee', weight: 2.5, cost: 100 }),
  weapon({ id: 'twoHandedSword', name: 'Two-Handed Sword', icon: '⚔', talent: 'sword', damage: { dice: 3, mod: -1 }, minST: 14, hands: 2, attackKind: 'melee', weight: 3.5, cost: 120 }),

  // ---------- axes and maces ----------
  weapon({ id: 'club', name: 'Club', icon: '🏏', talent: 'axMace', damage: { dice: 1, mod: 0 }, minST: 9, hands: 1, attackKind: 'melee', weight: 1.5, cost: 5 }),
  weapon({ id: 'hammer', name: 'Hammer', icon: '🔨', talent: 'axMace', damage: { dice: 1, mod: 1 }, minST: 10, hands: 1, attackKind: 'melee', weight: 1.5, cost: 30 }),
  weapon({ id: 'smallAx', name: 'Small Ax', icon: '🪓', talent: 'axMace', damage: { dice: 1, mod: 2 }, minST: 10, hands: 1, attackKind: 'melee', weight: 1.5, cost: 30 }),
  weapon({ id: 'mace', name: 'Mace', icon: '🔨', talent: 'axMace', damage: { dice: 2, mod: -1 }, minST: 11, hands: 1, attackKind: 'melee', weight: 2, cost: 50 }),
  weapon({ id: 'battleaxe', name: 'Battleaxe', icon: '🪓', talent: 'axMace', damage: { dice: 3, mod: 0 }, minST: 15, hands: 2, attackKind: 'melee', weight: 4, cost: 100 }),

  // ---------- pole weapons ----------
  weapon({ id: 'spear', name: 'Spear', icon: '🔱', talent: 'poleWeapons', damage: { dice: 1, mod: 1 }, minST: 9, hands: 1, attackKind: 'pole', weight: 2, cost: 20 }),
  weapon({ id: 'halberd', name: 'Halberd', icon: '🔱', talent: 'poleWeapons', damage: { dice: 2, mod: 0 }, minST: 13, hands: 2, attackKind: 'pole', weight: 4, cost: 80 }),

  // ---------- missile ----------
  weapon({ id: 'smallBow', name: 'Small Bow', icon: '🏹', talent: 'bow', damage: { dice: 1, mod: -1 }, minST: 9, hands: 2, attackKind: 'missile', range: 15, weight: 1, cost: 40 }),
  weapon({ id: 'longbow', name: 'Longbow', icon: '🏹', talent: 'bow', damage: { dice: 1, mod: 2 }, minST: 11, hands: 2, attackKind: 'missile', range: 20, weight: 1.5, cost: 100 }),
  weapon({ id: 'lightCrossbow', name: 'Light Crossbow', icon: '🎯', talent: 'crossbow', damage: { dice: 2, mod: 0 }, minST: 12, hands: 2, attackKind: 'missile', range: 20, weight: 3, cost: 120 }),
  weapon({ id: 'javelin', name: 'Javelin', icon: '🌀', talent: 'thrownWeapons', damage: { dice: 1, mod: 1 }, minST: 9, hands: 1, attackKind: 'thrown', range: 8, weight: 1, cost: 15 }),

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
