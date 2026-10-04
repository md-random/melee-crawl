import type { MaybeRefOrGetter } from 'vue'
import type { Attributes, CharacterClass, OwnedTalent, TalentNode, WeaponDef } from '#shared/types'
import { weapons } from '#shared/data/items'
import { NO_TALENT_DX_PENALTY } from '#shared/data/progression'
import { TALENTS, WEAPON_TALENTS } from '#shared/data/talents'
import {
  addTalent, canTakeTalent, dependentsOf, hasTalent, iqUsed, planTalent, rankOf, removeTalent, type TalentPlan
} from '#shared/engine/rules'

export interface TalentRow {
  key: string
  node: TalentNode
  weaponTalent?: string
  label: string
  weaponLine: string
  rank: number
  state: 'owned' | 'available' | 'locked'
  lines: string[]
  plan: TalentPlan
}

export interface TalentBranch { name: string; rows: TalentRow[] }

interface Options {
  attrs: MaybeRefOrGetter<Attributes>
  owned: MaybeRefOrGetter<OwnedTalent[]>
  cls: MaybeRefOrGetter<CharacterClass>
  /** Equipped weapon: prerequisite choices lean toward its talent. */
  weapon?: MaybeRefOrGetter<WeaponDef | undefined>
  /** Saved talents. They're permanent: never forgotten or pruned. */
  locked?: MaybeRefOrGetter<OwnedTalent[] | undefined>
}

const BRANCH_NAMES: Record<string, string> = {
  blades: 'Blades', heavy: 'Heavy weapons', polearms: 'Polearms', ranged: 'Ranged',
  defense: 'Defense', unarmed: 'Unarmed', mobility: 'Mobility', mastery: 'Mastery'
}

/** Static tile list: hero-visible talents by branch, one row per weapon for per-weapon talents. */
const LAYOUT = Object.entries(BRANCH_NAMES).map(([branch, name]) => {
  const rows: { node: TalentNode; weaponTalent?: string; label: string }[] = []
  for (const node of Object.values(TALENTS)) {
    if (node.branch !== branch || node.for === 'creature') continue
    if (node.perWeapon) {
      for (const w of WEAPON_TALENTS) rows.push({ node, weaponTalent: w, label: `${node.name} (${TALENTS[w]!.name})` })
    } else rows.push({ node, label: node.name })
  }
  rows.sort((a, b) => a.node.pos.row - b.node.pos.row || a.node.pos.col - b.node.pos.col)
  return { name, rows }
})

/** Weapons a weapon talent lets you use. */
function weaponsFor(talentId: string): string[] {
  return weapons().filter(w => w.talent === talentId).map(w => w.name)
}

/** Turns rule reasons into plain instructions. */
export function explainReason(reason: string): string {
  const attr = reason.match(/^(?:(.+): )?Needs (ST|DX|IQ) (\d+) \(have (\d+)\)$/)
  if (attr) {
    const [, who, key, min, have] = attr
    return `${who ? `${who} needs` : 'Needs'} ${key} ${min}. Yours is ${have}: raise ${key} by ${Number(min) - Number(have)}.`
  }
  const iq = reason.match(/^Costs (\d+) IQ \((-?\d+) left\)$/)
  if (iq) return `Costs ${iq[1]} IQ but you only have ${iq[2]} left. Raise IQ or forget another talent.`
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
  const weapon = computed(() => toValue(opts.weapon))
  const prefer = computed(() => (weapon.value ? [weapon.value.talent] : []))

  const iqSpent = computed(() => iqUsed(owned.value, cls.value))
  const iqLeft = computed(() => attrs.value.IQ - iqSpent.value)

  const ctx = () => ({ attrs: attrs.value, owned: owned.value, cls: cls.value, audience: 'hero' as const })
  const isLocked = (id: string, wt?: string) => locked.value.some(t => t.id === id && t.weaponTalent === wt)

  /** "the Sword talent (for your Shortsword)" / "the Dagger talent (for Dagger)" */
  function talentPhrase(s: { id: string; weaponTalent?: string }): string {
    const t = TALENTS[s.id]!
    if (s.weaponTalent) return `${t.name} (${TALENTS[s.weaponTalent]!.name})`
    const uses = weaponsFor(s.id)
    if (!uses.length) return `the ${t.name} talent`
    const w = weapon.value
    return w && uses.includes(w.name) ? `the ${t.name} talent (for your ${w.name})` : `the ${t.name} talent (for ${uses.join(', ')})`
  }
  const names = (ids: { id: string; weaponTalent?: string }[]) => ids.map(talentPhrase).join(', ')

  function rowFor(r: { node: TalentNode; weaponTalent?: string; label: string }): TalentRow {
    const { node, weaponTalent } = r
    const rank = rankOf(owned.value, node.id, weaponTalent)
    const plan = planTalent(node.id, ctx(), weaponTalent, prefer.value)
    const canAdd = plan.blockers.length === 0
    const extra = plan.steps.slice(0, -1)
    const lines: string[] = []

    if (rank > 0) {
      if (canAdd) lines.push(`Learned, rank ${rank} of ${node.maxRanks}. Click to raise to rank ${rank + 1} for ${plan.iqCost} IQ.`)
      else if (isLocked(node.id, weaponTalent)) lines.push(`Learned${node.maxRanks > 1 ? `, rank ${rank} of ${node.maxRanks}` : ''}. Permanent.`)
      else {
        const after = removeTalent(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        const refund = iqSpent.value - iqUsed(after, cls.value)
        const deps = dependentsOf(owned.value, node.id, weaponTalent, attrs.value, cls.value)
        lines.push(`Learned${node.maxRanks > 1 ? `, rank ${rank} of ${node.maxRanks}` : ''}. Click to forget it and get ${refund} IQ back.`)
        if (deps.length) lines.push(`Forgetting it also forgets ${names(deps)}.`)
      }
      if (!canAdd && rank < node.maxRanks) lines.push(...plan.blockers.map(explainReason))
    } else if (canAdd) {
      lines.push(extra.length
        ? `Click to learn. Also learns ${names(extra)}, which it needs. Total ${plan.iqCost} IQ.`
        : `Click to learn for ${plan.iqCost} IQ.`)
    } else {
      if (extra.length) lines.push(`Also needs ${names(extra)}. Learning this learns it too. Total ${plan.iqCost} IQ.`)
      lines.push(...plan.blockers.map(explainReason))
    }

    const uses = weaponsFor(weaponTalent ?? node.id)
    return {
      ...r,
      key: `${node.id}:${weaponTalent ?? ''}`,
      weaponLine: uses.length ? `Weapons: ${uses.join(', ')}.` : '',
      rank,
      state: rank > 0 ? 'owned' : canAdd ? 'available' : 'locked',
      lines,
      plan
    }
  }

  /** Every tile's state and text, worked out once per change. */
  const branches = computed<TalentBranch[]>(() => LAYOUT.map(b => ({ name: b.name, rows: b.rows.map(rowFor) })))

  /** New talent list after clicking a tile: learn (with prerequisites), next rank, or forget. */
  function toggle(row: TalentRow): OwnedTalent[] {
    if (row.plan.blockers.length === 0) return row.plan.result
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
        if (!isLocked(t.id, t.weaponTalent) && !canTakeTalent(node, { ...ctx(), owned: kept }, t.weaponTalent).ok) break
        kept = addTalent(kept, t.id, t.weaponTalent)
      }
    }
    return kept
  }

  /** Equipment note: whether a weapon or shield's talent is known, and how to get it. */
  function talentNote(talentId: string, what: string): string {
    const t = TALENTS[talentId]!
    if (hasTalent(owned.value, talentId)) return `You know ${t.name}, so no penalty.`
    const plan = planTalent(talentId, ctx())
    return `You don't know ${t.name}: −${NO_TALENT_DX_PENALTY} DX while using ${what}. `
      + (plan.blockers.length
        ? `You can't learn it yet: ${plan.blockers.map(explainReason).join(' ')}`
        : `Learn ${t.name} in Talents for ${plan.iqCost} IQ to remove this.`)
  }

  return { branches, iqSpent, iqLeft, toggle, prune, talentNote }
}
