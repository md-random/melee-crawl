import type { MaybeRefOrGetter } from 'vue'
import type { Attributes, CharacterClass, OwnedTalent, TalentNode } from '#shared/types'
import { weapons } from '#shared/data/items'
import { NO_TALENT_DX_PENALTY, PROGRESSION } from '#shared/data/progression'
import { TALENTS, WEAPON_TALENTS } from '#shared/data/talents'
import {
  addTalent, canTakeTalent, dependentsOf, hasTalent, iqUsed, rankOf, removeTalent, talentIqCost
} from '#shared/engine/rules'

export interface TalentRow {
  key: string
  node: TalentNode
  weaponTalent?: string
  label: string
  weaponLine: string
  /** For a per-weapon tile: how many weapons it's learned for. */
  rank: number
  state: 'owned' | 'available' | 'locked'
  lines: string[]
  canAdd: boolean
  /** Learned in an earlier camp: can't be forgotten. */
  permanent: boolean
  /** Per-weapon talents are one tile with a choice for each weapon talent known. */
  weapons?: TalentRow[]
}

export interface TalentBranch { name: string; rows: TalentRow[] }

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

const BRANCH_NAMES: Record<string, string> = {
  blades: 'Blades', heavy: 'Heavy weapons', polearms: 'Polearms', ranged: 'Ranged',
  defense: 'Defense', unarmed: 'Unarmed', mobility: 'Mobility', mastery: 'Mastery'
}

/** Static tile list: hero-visible talents by branch, one tile per talent. */
const LAYOUT = Object.entries(BRANCH_NAMES).map(([branch, name]) => {
  const rows: { node: TalentNode; label: string }[] = []
  for (const node of Object.values(TALENTS)) {
    if (node.branch !== branch || node.for === 'creature') continue
    rows.push({ node, label: node.name })
  }
  rows.sort((a, b) => a.node.pos.row - b.node.pos.row || a.node.pos.col - b.node.pos.col)
  return { name, rows }
})

/** Weapons a weapon talent lets you use. */
function weaponsFor(talentId: string): string[] {
  return weapons().filter(w => w.talent === talentId).map(w => w.name)
}

/** Turns rule reasons into plain instructions. */
export function explainReason(reason: string, canRaiseIQ: boolean): string {
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
export function useTalents(opts: Options) {
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
  const price = (iq: number) => (toValue(opts.xp) === undefined ? `${iq} IQ` : `${iq} IQ and ${PROGRESSION.talentXpCost} XP`)

  function rowFor(r: { node: TalentNode; weaponTalent?: string; label: string }): TalentRow {
    const { node, weaponTalent } = r
    const rank = rankOf(owned.value, node.id, weaponTalent)
    const check = canTakeTalent(node, ctx(), weaponTalent)
    const canAdd = check.ok
    const cost = talentIqCost(node, owned.value, cls.value)
    const lines: string[] = []

    if (rank > 0) {
      if (canAdd) lines.push(`Learned, rank ${rank} of ${node.maxRanks}. Click to raise to rank ${rank + 1} for ${price(cost)}.`)
      else if (isLocked(node.id, weaponTalent)) lines.push(`Learned${node.maxRanks > 1 ? `, rank ${rank} of ${node.maxRanks}` : ''}. Permanent.`)
      else {
        const after = removeTalent(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        const refund = iqSpent.value - iqUsed(after, cls.value)
        const deps = dependentsOf(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        const depNames = deps.map(d => d.weaponTalent ? `${TALENTS[d.id]!.name} (${TALENTS[d.weaponTalent]!.name})` : TALENTS[d.id]!.name)
        lines.push(`Click to forget: +${refund} IQ.${deps.length ? ` Also forgets ${depNames.join(', ')}` : ''}`)
      }
      if (!canAdd && rank < node.maxRanks) lines.push(...check.reasons.map(explain))
    } else if (canAdd) {
      lines.push(`Click to learn for ${price(cost)}.`)
    } else {
      lines.push(...check.reasons.map(explain))
    }

    const uses = weaponsFor(weaponTalent ?? node.id)
    return {
      ...r,
      key: `${node.id}:${weaponTalent ?? ''}`,
      weaponLine: uses.length ? `Weapons: ${uses.join(', ')}.` : '',
      rank,
      state: rank > 0 ? 'owned' : canAdd ? 'available' : 'locked',
      lines,
      canAdd,
      permanent: isLocked(node.id, weaponTalent)
    }
  }

  /** One tile for a per-weapon talent, with a choice for each weapon talent known. */
  function perWeaponRow(node: TalentNode): TalentRow {
    const weapons = WEAPON_TALENTS
      .filter(w => hasTalent(owned.value, w) || rankOf(owned.value, node.id, w) > 0)
      .map(w => rowFor({ node, weaponTalent: w, label: TALENTS[w]!.name }))
    const learned = weapons.filter(w => w.rank > 0).length
    const anyAvailable = weapons.some(w => w.canAdd)
    // Reasons that hold whichever weapon is picked (IQ, DX).
    const general = canTakeTalent(node, ctx()).reasons.filter(r => r !== 'Choose a weapon talent').map(explain)
    const lines = !weapons.length
      ? ['Learn a weapon talent first.', ...general]
      : anyAvailable ? [`Click a weapon to learn it for ${price(talentIqCost(node, owned.value, cls.value))}.`] : general
    return {
      key: `${node.id}:`,
      node,
      label: node.name,
      weaponLine: '',
      rank: learned,
      state: learned ? 'owned' : anyAvailable ? 'available' : 'locked',
      lines,
      canAdd: false,
      permanent: false,
      weapons
    }
  }

  /** Every tile's state and text, worked out once per change. */
  const branches = computed<TalentBranch[]>(() => LAYOUT.map(b => ({
    name: b.name,
    rows: b.rows.map(r => (r.node.perWeapon ? perWeaponRow(r.node) : rowFor(r)))
  })))

  /** New talent list after clicking a tile: learn, next rank, or forget. */
  function toggle(row: TalentRow): OwnedTalent[] {
    if (row.canAdd) return addTalent(owned.value, row.node.id, row.weaponTalent)
    if (row.rank > 0 && !isLocked(row.node.id, row.weaponTalent)) {
      return removeTalent(owned.value, row.node.id, row.weaponTalent, attrs.value, cls.value)
    }
    return owned.value
  }

  /** Talents that still qualify, e.g. after lowering IQ. Locked talents always stay. */
  function prune(): OwnedTalent[] {
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
  function talentNote(talentId: string, what: string): string {
    const t = TALENTS[talentId]!
    if (hasTalent(owned.value, talentId)) return `You know ${t.name}, so no penalty.`
    const check = canTakeTalent(t, ctx())
    return `You don't know ${t.name}: −${NO_TALENT_DX_PENALTY} DX while using ${what}. `
      + (check.ok
        ? `Learn ${t.name} in Talents for ${price(talentIqCost(t, owned.value, cls.value))} to remove this.`
        : `You can't learn it yet: ${check.reasons.map(explain).join(' ')}`)
  }

  return { branches, iqSpent, iqLeft, toggle, prune, talentNote }
}
