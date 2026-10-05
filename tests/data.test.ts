import { describe, expect, it } from 'vitest'
import type { Requirement } from '#shared/types'
import { ARCHETYPES, CREATURES, archetypesFor } from '#shared/data/creatures'
import { ITEMS } from '#shared/data/items'
import { TALENTS } from '#shared/data/talents'

function talentRefs(req?: Requirement): string[] {
  if (!req) return []
  if ('all' in req) return req.all.flatMap(talentRefs)
  if ('any' in req) return req.any.flatMap(talentRefs)
  return 'talent' in req ? [req.talent] : []
}

describe('data integrity', () => {
  it('talent ids match keys and every reference exists', () => {
    for (const [key, t] of Object.entries(TALENTS)) {
      expect(t.id).toBe(key)
      const refs = [...talentRefs(t.requires), ...Object.values(t.rankRequires ?? {}).flatMap(talentRefs), ...(t.costOverrides ?? []).map(o => o.ifHasTalent)]
      for (const r of refs) expect(TALENTS[r], `${key} → ${r}`).toBeDefined()
    }
  })

  it('every weapon names an existing talent', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.kind === 'weapon') expect(TALENTS[item.talent], item.id).toBeDefined()
    }
  })

  it('creatures and archetypes reference existing talents, items and bases', () => {
    for (const c of Object.values(CREATURES)) {
      for (const t of c.baseTalents) expect(TALENTS[t.id], `${c.id} → ${t.id}`).toBeDefined()
      expect(archetypesFor(c).length, `${c.id} has an archetype`).toBeGreaterThan(0)
    }
    for (const a of Object.values(ARCHETYPES)) {
      for (const entry of a.talentPriority) {
        const [id, weapon] = entry.split(':')
        expect(TALENTS[id!], `${a.id} → ${id}`).toBeDefined()
        if (weapon) expect(TALENTS[weapon], `${a.id} → ${weapon}`).toBeDefined()
      }
      for (const id of [...(a.gear?.weapons ?? []), a.gear?.armor, a.gear?.shield].filter(Boolean)) {
        expect(ITEMS[id!], `${a.id} → ${id}`).toBeDefined()
      }
      for (const id of a.appliesTo.baseIds ?? []) expect(CREATURES[id], `${a.id} → ${id}`).toBeDefined()
    }
  })

  it('creatures of one genus share the same archetypes', () => {
    const byGenus = new Map<string, string[]>()
    for (const c of Object.values(CREATURES)) {
      const ids = archetypesFor(c).map(a => a.id).sort()
      const seen = byGenus.get(c.genus)
      if (seen) expect(ids, `${c.id} in genus ${c.genus}`).toEqual(seen)
      else byGenus.set(c.genus, ids)
    }
  })
})
