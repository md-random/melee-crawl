import type { WeaponDef } from '../types'
import { ARCHETYPES } from '../data/creatures'
import { TALENTS } from '../data/talents'
import { isSvgIcon, svgProblems } from './icons'

export const ATTACK_KINDS: WeaponDef['attackKind'][] = ['melee', 'pole', 'missile', 'thrown']

export const RANGED_KINDS: WeaponDef['attackKind'][] = ['missile', 'thrown']

export const WEAPON_TALENTS = Object.values(TALENTS).filter(t => t.category === 'weapon')

const wholeFrom =(value: unknown, min: number): boolean => Number.isInteger(value) && (value as number) >= min

export const weaponProblems = (list: unknown, otherItemIds: readonly string[] = []): string[] => {
  if (!Array.isArray(list)) return ['Weapons must be a list']
  const out: string[] = []
  const seen = new Set<string>()
  list.forEach((weapon: unknown, i) => {
    if (!weapon || typeof weapon !== 'object') {
      out.push(`Weapon ${i + 1} is not a weapon`)
      return
    }
    const w = weapon as Record<string, unknown>
    const where = typeof w.id === 'string' && w.id ? w.id : `Weapon ${i + 1}`
    if (typeof w.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(w.id)) out.push(`${where}: id must start with a lowercase letter and use only letters and digits`)
    else if (seen.has(w.id)) out.push(`${where}: id is used twice`)
    else if (otherItemIds.includes(w.id)) out.push(`${where}: id is used by another item`)
    else seen.add(w.id)
    if (typeof w.name !== 'string' || !w.name.trim()) out.push(`${where}: no name`)
    if (typeof w.icon !== 'string') out.push(`${where}: icon must be text`)
    else if (isSvgIcon(w.icon)) out.push(...svgProblems(w.icon).map(p => `${where}: ${p}`))
    if (typeof w.talent !== 'string' || TALENTS[w.talent]?.category !== 'weapon') out.push(`${where}: talent must be a weapon talent`)
    const damage = w.damage as Record<string, unknown> | undefined
    if (!damage || typeof damage !== 'object' || !wholeFrom(damage.dice, 0)) out.push(`${where}: damage dice must be a whole number, 0 or more`)
    if (!damage || typeof damage !== 'object' || !Number.isInteger(damage.mod)) out.push(`${where}: damage modifier must be a whole number`)
    if (!wholeFrom(w.minST, 0)) out.push(`${where}: min ST must be a whole number, 0 or more`)
    if (w.hands !== 1 && w.hands !== 2) out.push(`${where}: hands must be 1 or 2`)
    const kind = w.attackKind as WeaponDef['attackKind']
    if (!ATTACK_KINDS.includes(kind)) out.push(`${where}: attack kind must be melee, pole, missile or thrown`)
    else if (RANGED_KINDS.includes(kind)) {
      if (!wholeFrom(w.range, 1)) out.push(`${where}: range must be a whole number, 1 or more`)
    } else if (w.range !== undefined) out.push(`${where}: only missile and thrown weapons have a range`)
    if (!wholeFrom(w.cost, 0)) out.push(`${where}: cost must be a whole number, 0 or more`)
    if (w.unverified !== undefined && typeof w.unverified !== 'boolean') out.push(`${where}: unverified must be true or false`)
  })
  for (const a of Object.values(ARCHETYPES)) {
    for (const id of a.gear?.weapons ?? []) if (!seen.has(id)) out.push(`${a.name} archetype needs weapon ${id}`)
  }
  return out
}
