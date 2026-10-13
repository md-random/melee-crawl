import type { AttrKey, TalentAudience, TalentCategory } from '../types'
import { ARCHETYPES, CREATURES } from '../data/creatures'
import { isSvgIcon, svgProblems } from './icons'

export const TALENT_CATEGORIES: TalentCategory[] = ['attack', 'debuff', 'defense', 'movement', 'utility', 'weapon']

export const TALENT_AUDIENCES: TalentAudience[] = ['hero', 'creature', 'both']

export const ATTR_KEYS: AttrKey[] = ['ST', 'DX', 'IQ']

export const MAX_LEVEL = 5

const GAME_TALENTS = ['shield', 'twoWeapons']

const wholeFrom = (value: unknown, min: number): boolean => Number.isInteger(value) && (value as number) >= min

export const levelName = (level: number): string => (level === 0 ? 'base' : `level ${level}`)

export const requiredTalents = (req: unknown): string[] => {
  if (!req || typeof req !== 'object') return []
  const r = req as Record<string, unknown>
  if (Array.isArray(r.all)) return r.all.flatMap(requiredTalents)
  if (Array.isArray(r.any)) return r.any.flatMap(requiredTalents)
  return typeof r.talent === 'string' && r.talent ? [r.talent] : []
}

interface TreeTalent {
  id: unknown
  category?: unknown
  requires?: unknown
  perWeapon?: unknown
  weaponPrereq?: unknown
  pos: { col: number; row: unknown }
}

export const parentIds = (t: TreeTalent, list: readonly TreeTalent[]): unknown[] => [
  ...requiredTalents(t.requires),
  ...(typeof t.weaponPrereq === 'string' && t.weaponPrereq
    ? [t.weaponPrereq]
    : t.perWeapon ? list.filter(w => w.category === 'weapon').map(w => w.id) : [])
]

export const arrangeTalents = <T extends TreeTalent>(list: readonly T[]): T[] => {
  const cols = new Map<T, number>()
  const rows = [...new Set(list.map(t => t.pos.row))].filter((r): r is number => wholeFrom(r, 0)).sort((a, b) => a - b)
  for (const row of rows) {
    const ideal = (t: T): number => {
      if (row === 0) return t.pos.col
      const ids = parentIds(t, list)
      const above = list.filter(p => p.pos.row === row - 1 && ids.includes(p.id) && cols.has(p))
      return above.length ? above.reduce((sum, p) => sum + cols.get(p)!, 0) / above.length : t.pos.col
    }
    let last = -1
    list.filter(t => t.pos.row === row)
      .map((t, i) => ({ t, i, ideal: ideal(t) }))
      .sort((a, b) => a.ideal - b.ideal || a.t.pos.col - b.t.pos.col || a.i - b.i)
      .forEach(({ t, ideal }) => {
        last = row === 0 ? last + 1 : Math.max(Math.round(ideal * 2) / 2, last + 1)
        cols.set(t, last)
      })
  }
  return list.map(t => (cols.has(t) ? { ...t, pos: { ...t.pos, col: cols.get(t)! } } : t))
}

const requirementProblems = (req: unknown, ids: Set<string>, where: string): string[] => {
  if (!req || typeof req !== 'object') return [`${where} is not a requirement`]
  const r = req as Record<string, unknown>
  if ('all' in r || 'any' in r) {
    const parts = r.all ?? r.any
    if (!Array.isArray(parts) || !parts.length) return [`${where} has an empty group`]
    return parts.flatMap(p => requirementProblems(p, ids, where))
  }
  if ('talent' in r) {
    const out: string[] = []
    if (typeof r.talent !== 'string' || !r.talent) out.push(`${where} has no talent picked`)
    else if (!ids.has(r.talent)) out.push(`${where} needs ${r.talent}, which is not a talent`)
    if (r.rank !== undefined && !wholeFrom(r.rank, 1)) out.push(`${where} talent rank must be a whole number, 1 or more`)
    return out
  }
  if ('attr' in r) {
    const out: string[] = []
    if (!ATTR_KEYS.includes(r.attr as AttrKey)) out.push(`${where} attribute must be ST, DX or IQ`)
    if (!wholeFrom(r.min, 0)) out.push(`${where} attribute minimum must be a whole number, 0 or more`)
    return out
  }
  return [`${where} is not a requirement`]
}

export const talentProblems = (list: unknown, weapons: unknown = []): string[] => {
  if (!Array.isArray(list)) return ['Talents must be a list']
  const out: string[] = []
  const ids = new Set(list.flatMap(t => (t && typeof t === 'object' && typeof t.id === 'string' ? [t.id as string] : [])))
  const seen = new Set<string>()
  const byId = new Map<string, Record<string, unknown>>()
  list.forEach((talent: unknown, i) => {
    if (!talent || typeof talent !== 'object') {
      out.push(`Talent ${i + 1} is not a talent`)
      return
    }
    const t = talent as Record<string, unknown>
    const where = typeof t.id === 'string' && t.id ? t.id : `Talent ${i + 1}`
    if (typeof t.id !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(t.id)) out.push(`${where}: id must start with a lowercase letter and use only letters and digits`)
    else if (seen.has(t.id)) out.push(`${where}: id is used twice`)
    else {
      seen.add(t.id)
      byId.set(t.id, t)
    }
    if (typeof t.name !== 'string' || !t.name.trim()) out.push(`${where}: no name`)
    if (typeof t.description !== 'string') out.push(`${where}: description must be text`)
    if (!TALENT_AUDIENCES.includes(t.for as TalentAudience)) out.push(`${where}: for must be hero, creature or both`)
    if (!TALENT_CATEGORIES.includes(t.category as TalentCategory)) out.push(`${where}: category must be ${TALENT_CATEGORIES.join(', ')}`)
    if (typeof t.icon !== 'string') out.push(`${where}: icon must be text`)
    else if (isSvgIcon(t.icon)) out.push(...svgProblems(t.icon).map(p => `${where}: ${p}`))
    if (typeof t.branch !== 'string' || !t.branch.trim()) out.push(`${where}: no branch`)
    const pos = t.pos as Record<string, unknown> | undefined
    if (!pos || typeof pos !== 'object' || typeof pos.col !== 'number' || !(pos.col >= 0)) out.push(`${where}: column must be 0 or more`)
    if (!wholeFrom(pos?.row, 0) || (pos?.row as number) > MAX_LEVEL) out.push(`${where}: level must be base or 1 to ${MAX_LEVEL}`)
    if (!wholeFrom(t.iqCost, 0)) out.push(`${where}: IQ cost must be a whole number, 0 or more`)
    if (!wholeFrom(t.minIQ, 0)) out.push(`${where}: min IQ must be a whole number, 0 or more`)
    if (!wholeFrom(t.maxRanks, 1)) out.push(`${where}: max ranks must be a whole number, 1 or more`)
    if (t.requires !== undefined) out.push(...requirementProblems(t.requires, ids, `${where}: requirement`))
    if (t.rankRequires !== undefined) {
      if (!t.rankRequires || typeof t.rankRequires !== 'object') out.push(`${where}: rank requirements must be a list by rank`)
      else {
        for (const [rank, req] of Object.entries(t.rankRequires)) {
          const n = Number(rank)
          if (!Number.isInteger(n) || n < 2 || (wholeFrom(t.maxRanks, 1) && n > (t.maxRanks as number))) {
            out.push(`${where}: rank ${rank} requirement is outside ranks 2 to max ranks`)
          }
          out.push(...requirementProblems(req, ids, `${where}: rank ${rank} requirement`))
        }
      }
    }
    if (t.costOverrides !== undefined) {
      if (!Array.isArray(t.costOverrides)) out.push(`${where}: cost overrides must be a list`)
      else {
        for (const o of t.costOverrides as Record<string, unknown>[]) {
          if (typeof o?.ifHasTalent !== 'string' || !o.ifHasTalent) out.push(`${where}: cost override has no talent picked`)
          else if (!ids.has(o.ifHasTalent)) out.push(`${where}: cost override needs ${o.ifHasTalent}, which is not a talent`)
          if (!wholeFrom(o?.iqCost, 0)) out.push(`${where}: cost override IQ cost must be a whole number, 0 or more`)
        }
      }
    }
    if (t.perWeapon !== undefined && typeof t.perWeapon !== 'boolean') out.push(`${where}: per weapon must be true or false`)
    if (t.weaponPrereq !== undefined) {
      if (!t.perWeapon) out.push(`${where}: weapon prerequisite needs the talent to be per weapon`)
      if (typeof t.weaponPrereq !== 'string' || !ids.has(t.weaponPrereq)) out.push(`${where}: weapon prerequisite ${String(t.weaponPrereq)} is not a talent`)
    }
    if (!Array.isArray(t.effects)) out.push(`${where}: effects must be a list`)
    if (t.unverified !== undefined && typeof t.unverified !== 'boolean') out.push(`${where}: unverified must be true or false`)
  })
  const tree = [...byId.values()].filter(t => t.pos && typeof t.pos === 'object') as unknown as TreeTalent[]
  const rowOf = (id: unknown) => (typeof id === 'string' ? (byId.get(id)?.pos as TreeTalent['pos'] | undefined)?.row : undefined)
  for (const t of byId.values()) {
    const pre = typeof t.weaponPrereq === 'string' ? byId.get(t.weaponPrereq) : undefined
    if (pre && !pre.perWeapon) out.push(`${t.id}: weapon prerequisite ${t.weaponPrereq} is not per weapon`)
    const row = (t.pos as TreeTalent['pos'] | undefined)?.row
    if (!wholeFrom(row, 0) || (row as number) > MAX_LEVEL) continue
    const level = row as number
    for (const id of requiredTalents(t.requires)) {
      if (byId.has(id) && rowOf(id) !== level - 1) out.push(`${t.id}: needs ${id}, which is not on the level above`)
    }
    if (pre && rowOf(pre.id) !== level - 1) out.push(`${t.id}: weapon prerequisite ${t.weaponPrereq} is not on the level above`)
    if (level > 0 && !parentIds(t as unknown as TreeTalent, tree).some(id => rowOf(id) === level - 1)) {
      out.push(`${t.id}: not attached to a ${levelName(level - 1)} talent`)
    }
  }
  if (Array.isArray(weapons)) {
    for (const w of weapons as Record<string, unknown>[]) {
      if (typeof w?.talent === 'string' && byId.get(w.talent)?.category !== 'weapon') out.push(`${String(w.name)} weapon needs weapon talent ${w.talent}`)
    }
  }
  for (const c of Object.values(CREATURES)) {
    for (const t of c.baseTalents) if (!seen.has(t.id)) out.push(`${c.name} creature needs talent ${t.id}`)
  }
  for (const a of Object.values(ARCHETYPES)) {
    for (const entry of a.talentPriority) {
      for (const id of entry.split(/[:|]/)) if (!seen.has(id)) out.push(`${a.name} archetype needs talent ${id}`)
    }
  }
  for (const id of GAME_TALENTS) if (!seen.has(id)) out.push(`The game needs talent ${id}`)
  return out
}
