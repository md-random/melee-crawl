import type { MaybeRefOrGetter } from 'vue'
import type { Attributes, CharacterClass, OwnedTalent, Requirement, TalentNode } from '#shared/types'
import { weapons } from '#shared/data/items'
import { NO_TALENT_DX_PENALTY, PROGRESSION } from '#shared/data/progression'
import { TALENTS, WEAPON_TALENTS } from '#shared/data/talents'
import {
  addTalent, canTakeTalent, dependentsOf, hasTalent, iqUsed, rankOf, removeTalent, talentIqCost, talentXpCost
} from '#shared/engine/rules'

export interface TalentNeed { text: string; met: boolean }

export interface TalentRow {
  key: string
  node: TalentNode
  weaponTalent?: string
  label: string
  weaponLine: string
  /** For a per-weapon tile: how many weapons it's learned for. */
  rank: number
  state: 'owned' | 'available' | 'locked'
  cost: string
  action: string
  needs: TalentNeed[]
  blocks: string[]
  canAdd: boolean
  /** Learned in an earlier camp: can't be forgotten. */
  permanent: boolean
  /** Per-weapon talents are one tile with a choice for each weapon talent known. */
  weapons?: TalentRow[]
}

type Pos = TalentNode['pos']

export interface TalentLink { key: string; from: Pos; to: Pos; met: boolean }

export interface TalentHeader { branch: string; name: string; col: number; span: number }

export interface TalentTree {
  cols: number
  rows: number
  headers: TalentHeader[]
  nodes: TalentRow[]
  links: TalentLink[]
}

interface Options {
  attrs: MaybeRefOrGetter<Attributes>
  owned: MaybeRefOrGetter<OwnedTalent[]>
  cls: MaybeRefOrGetter<CharacterClass>
  /** Saved talents. They're permanent: never forgotten or pruned. */
  locked?: MaybeRefOrGetter<OwnedTalent[] | undefined>
  /** Attribute points left to spend. "Raise IQ" advice shows only when above 0. */
  attrPoints?: MaybeRefOrGetter<number | undefined>
  /** XP left to spend (camp). When set, each new talent also costs XP. */
  xp?: MaybeRefOrGetter<number | undefined>
}

export const BRANCH_NAMES: Record<string, string> = {
  blades: 'Blades', heavy: 'Ax/Mace', polearms: 'Polearms', ranged: 'Ranged',
  defense: 'Defense', unarmed: 'Unarmed', mobility: 'Mobility', mastery: 'Mastery', tactics: 'Tactics'
}

const HERO_NODES = Object.values(TALENTS)
  .filter(n => n.for !== 'creature')
  .sort((a, b) => a.pos.row - b.pos.row || a.pos.col - b.pos.col)

const COLS = Math.max(...HERO_NODES.map(n => n.pos.col)) + 1
const ROWS = Math.max(...HERO_NODES.map(n => n.pos.row)) + 1

const HEADERS = Array.from({ length: COLS }, (_, col) => HERO_NODES.find(n => n.pos.col === col)?.branch)
  .reduce<TalentHeader[]>((out, branch, col) => {
    if (!branch) return out
    const last = out.at(-1)
    if (last?.branch === branch && last.col + last.span === col) last.span++
    else out.push({ branch, name: BRANCH_NAMES[branch] ?? branch, col, span: 1 })
    return out
  }, [])

const groupsOf = (req: Requirement | undefined): string[][] => {
  if (!req) return []
  if ('all' in req) return req.all.flatMap(groupsOf)
  if ('any' in req) return [req.any.flatMap(r => groupsOf(r).flat())]
  return 'talent' in req ? [[req.talent]] : []
}

const prereqGroups = (node: TalentNode): TalentNode[][] =>
  [
    ...groupsOf(node.requires),
    ...(node.weaponPrereq ? [[node.weaponPrereq]] : node.perWeapon ? [[...WEAPON_TALENTS]] : [])
  ]
    .map(ids => ids.flatMap(id => (TALENTS[id] ? [TALENTS[id]] : [])))
    .filter(group => group.length > 0)

const LINKS = HERO_NODES.flatMap(node =>
  prereqGroups(node).flat().map(from => ({ key: `${from.id}>${node.id}`, from, to: node }))
)

/** Weapons a weapon talent lets you use. */
const weaponsFor = (talentId: string): string[] => {
  return weapons().filter(w => w.talent === talentId).map(w => w.name)
}

/** Turns rule reasons into plain instructions. */
export const explainReason = (reason: string, canRaiseIQ: boolean): string => {
  const attr = reason.match(/^Needs (ST|DX|IQ) (\d+) \(have (\d+)\)$/)
  if (attr) {
    const [, key, min, have] = attr
    if (key === 'IQ' && !canRaiseIQ) return `Needs IQ ${min}. Yours is ${have}.`
    return `Needs ${key} ${min}. Yours is ${have}: raise ${key} by ${Number(min) - Number(have)}.`
  }
  const iq = reason.match(/^Costs (\d+) IQ \((-?\d+) left\)$/)
  if (iq) return `Costs ${iq[1]} IQ but you only have ${iq[2]} left. ${canRaiseIQ ? 'Raise IQ or forget' : 'Forget'} another talent.`
  const xp = reason.match(/^Costs (\d+) XP \((-?\d+) left\)$/)
  if (xp) return `Costs ${xp[1]} XP but you only have ${xp[2]} unspent.`
  if (reason === 'Already at max rank') return 'Fully learned.'
  return reason
}

/**
 * Talent picking for the creator and the camp screen. Pure derivation: returns new
 * talent lists instead of mutating, so the owner keeps the state (props down, events up).
 */
export const useTalents = (opts: Options) => {
  const attrs = computed(() => toValue(opts.attrs))
  const owned = computed(() => toValue(opts.owned))
  const cls = computed(() => toValue(opts.cls))
  const locked = computed(() => toValue(opts.locked) ?? [])
  const explain = (reason: string) => explainReason(reason, (toValue(opts.attrPoints) ?? 0) > 0)

  const iqSpent = computed(() => iqUsed(owned.value, cls.value))
  const iqLeft = computed(() => attrs.value.IQ - iqSpent.value)

  const ctx = () => ({ attrs: attrs.value, owned: owned.value, cls: cls.value, audience: 'hero' as const, xp: toValue(opts.xp) })
  const isLocked = (id: string, wt?: string) => locked.value.some(t => t.id === id && t.weaponTalent === wt)
  /** What one more rank costs: IQ, plus XP at camp. */
  const price = (node: TalentNode, iq: number) => (toValue(opts.xp) === undefined ? `${iq} IQ` : `${iq} IQ and ${talentXpCost(node.id)} XP`)

  const costText = (node: TalentNode): string => {
    const base = price(node, talentIqCost(node, owned.value, cls.value))
    const scale = cls.value === 'wizard' ? PROGRESSION.wizardTalentMultiplier : 1
    const others = (node.costOverrides ?? []).filter(o => !hasTalent(owned.value, o.ifHasTalent))
    if (!others.length) return base
    return `${base} (${others.map(o => `${o.iqCost * scale} IQ with ${TALENTS[o.ifHasTalent]?.name ?? o.ifHasTalent}`).join(', ')})`
  }

  const budgetReasons = (reasons: string[]) => reasons.filter(r => r.startsWith('Costs ')).map(explain)

  const reqNeeds = (req: Requirement | undefined): TalentNeed[] => {
    if (!req) return []
    if ('all' in req) return req.all.flatMap(reqNeeds)
    if ('any' in req) {
      const parts = req.any.map(reqNeeds)
      return [{
        text: `One of: ${parts.map(p => p.map(n => n.text).join(' and ')).join(', ')}`,
        met: parts.some(p => p.every(n => n.met))
      }]
    }
    if ('talent' in req) {
      const name = TALENTS[req.talent]?.name ?? req.talent
      return [{ text: req.rank && req.rank > 1 ? `${name} rank ${req.rank}` : name, met: hasTalent(owned.value, req.talent, req.rank) }]
    }
    const have = attrs.value[req.attr]
    return [{ text: `${req.attr} ${req.min} (yours ${have})`, met: have >= req.min }]
  }

  const needsFor = (node: TalentNode, weaponTalent?: string): TalentNeed[] => {
    const iq = attrs.value.IQ
    const out: TalentNeed[] = [{ text: `IQ ${node.minIQ} (yours ${iq})`, met: iq >= node.minIQ }]
    if (node.perWeapon) {
      const weaponName = weaponTalent ? TALENTS[weaponTalent]?.name ?? weaponTalent : undefined
      out.push(weaponTalent
        ? { text: weaponName!, met: hasTalent(owned.value, weaponTalent) }
        : { text: 'A weapon talent', met: WEAPON_TALENTS.some(w => hasTalent(owned.value, w)) })
      if (node.weaponPrereq) {
        const pre = TALENTS[node.weaponPrereq]?.name ?? node.weaponPrereq
        out.push(weaponTalent
          ? { text: `${pre} (${weaponName})`, met: rankOf(owned.value, node.weaponPrereq, weaponTalent) > 0 }
          : { text: `${pre} for that weapon`, met: owned.value.some(t => t.id === node.weaponPrereq) })
      }
    }
    out.push(...reqNeeds(node.requires))
    out.push(...reqNeeds(node.rankRequires?.[rankOf(owned.value, node.id, weaponTalent) + 1]))
    return out
  }

  const rowFor = (r: { node: TalentNode; weaponTalent?: string; label: string }): TalentRow => {
    const { node, weaponTalent } = r
    const rank = rankOf(owned.value, node.id, weaponTalent)
    const check = canTakeTalent(node, ctx(), weaponTalent)
    const canAdd = check.ok
    const cost = talentIqCost(node, owned.value, cls.value)
    let action = ''

    if (rank > 0) {
      if (canAdd) action = `Learned, rank ${rank} of ${node.maxRanks}. Click to raise to rank ${rank + 1} for ${price(node, cost)}.`
      else if (isLocked(node.id, weaponTalent)) action = `Learned${node.maxRanks > 1 ? `, rank ${rank} of ${node.maxRanks}` : ''}. Permanent.`
      else {
        const after = removeTalent(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        const refund = iqSpent.value - iqUsed(after, cls.value)
        const deps = dependentsOf(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        const depNames = deps.map(d => d.weaponTalent ? `${TALENTS[d.id]!.name} (${TALENTS[d.weaponTalent]!.name})` : TALENTS[d.id]!.name)
        action = `Click to forget: +${refund} IQ.${deps.length ? ` Also forgets ${depNames.join(', ')}.` : ''}`
      }
    } else if (canAdd) {
      action = `Click to learn for ${price(node, cost)}.`
    }

    const uses = weaponsFor(weaponTalent ?? node.id)
    return {
      ...r,
      key: `${node.id}:${weaponTalent ?? ''}`,
      weaponLine: uses.length ? `Weapons: ${uses.join(', ')}.` : '',
      rank,
      state: rank > 0 ? 'owned' : canAdd ? 'available' : 'locked',
      cost: costText(node),
      action,
      needs: needsFor(node, weaponTalent),
      blocks: rank < node.maxRanks ? budgetReasons(check.reasons) : [],
      canAdd,
      permanent: isLocked(node.id, weaponTalent)
    }
  }

  /** One tile for a per-weapon talent, with a choice for each weapon talent known. */
  const perWeaponRow = (node: TalentNode): TalentRow => {
    const weapons = WEAPON_TALENTS
      .filter(w => hasTalent(owned.value, w) || rankOf(owned.value, node.id, w) > 0)
      .map(w => rowFor({ node, weaponTalent: w, label: TALENTS[w]!.name }))
    const learned = weapons.filter(w => w.rank > 0).length
    const anyAvailable = weapons.some(w => w.canAdd)
    return {
      key: `${node.id}:`,
      node,
      label: node.name,
      weaponLine: '',
      rank: learned,
      state: learned ? 'owned' : anyAvailable ? 'available' : 'locked',
      cost: costText(node),
      action: anyAvailable ? 'Click a weapon to learn it.' : '',
      needs: needsFor(node),
      blocks: budgetReasons(canTakeTalent(node, ctx()).reasons),
      canAdd: false,
      permanent: false,
      weapons
    }
  }

  const linked = (from: TalentNode, to: TalentNode) =>
    hasTalent(owned.value, from.id) &&
    owned.value.some(t => t.id === to.id && (!to.perWeapon || !!to.weaponPrereq || t.weaponTalent === from.id))

  const tree = computed<TalentTree>(() => ({
    cols: COLS,
    rows: ROWS,
    headers: HEADERS,
    nodes: HERO_NODES.map(node => (node.perWeapon ? perWeaponRow(node) : rowFor({ node, label: node.name }))),
    links: LINKS.map(l => ({ key: l.key, from: l.from.pos, to: l.to.pos, met: linked(l.from, l.to) }))
  }))

  /** New talent list after clicking a tile: learn, next rank, or forget. */
  const toggle = (row: TalentRow): OwnedTalent[] => {
    if (row.weapons) return owned.value
    if (row.canAdd) return addTalent(owned.value, row.node.id, row.weaponTalent)
    if (row.rank > 0 && !isLocked(row.node.id, row.weaponTalent)) {
      return removeTalent(owned.value, row.node.id, row.weaponTalent, attrs.value, cls.value)
    }
    return owned.value
  }

  /** Talents that still qualify, e.g. after lowering IQ. Locked talents always stay. */
  const prune = (): OwnedTalent[] => {
    let kept: OwnedTalent[] = []
    for (const t of owned.value) {
      const node = TALENTS[t.id]
      for (let r = 0; r < t.rank && node; r++) {
        // XP was checked when each was picked; lowering an attribute doesn't change it.
        if (!isLocked(t.id, t.weaponTalent) && !canTakeTalent(node, { ...ctx(), xp: undefined, owned: kept }, t.weaponTalent).ok) break
        kept = addTalent(kept, t.id, t.weaponTalent)
      }
    }
    return kept
  }

  /** Equipment note: whether a weapon or shield's talent is known, and how to get it. */
  const talentNote = (talentId: string, what: string): string => {
    const t = TALENTS[talentId]!
    if (hasTalent(owned.value, talentId)) return `You know ${t.name}, so no penalty.`
    const check = canTakeTalent(t, ctx())
    return `You don't know ${t.name}: −${NO_TALENT_DX_PENALTY} DX while using ${what}. `
      + (check.ok
        ? `Learn ${t.name} in Talents for ${price(t, talentIqCost(t, owned.value, cls.value))} to remove this.`
        : `You can't learn it yet: ${check.reasons.map(explain).join(' ')}`)
  }

  return { tree, iqSpent, iqLeft, toggle, prune, talentNote }
}
