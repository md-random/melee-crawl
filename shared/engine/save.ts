import type { SaveFile } from '../types'
import { SCHEMA_VERSION } from '../types'

// Loading saves across format changes. Each migration turns a save of
// version n into version n + 1; add one whenever the save format changes.
// A save that can't be brought up to date is handed back as a backup,
// never silently thrown away.

type LooseItem = Record<string, unknown>

interface LooseSave {
  schemaVersion: number
  run?: {
    character?: { inventory?: LooseItem[] }
    battle?: { units?: Record<string, Record<string, unknown>> }
    shop?: { stock?: unknown[] }
  }
  [key: string]: unknown
}

const gradeItems = (items: unknown) => {
  if (!Array.isArray(items)) return
  for (const item of items as LooseItem[]) {
    if (typeof item.grade !== 'string') item.grade = 'ordinary'
    if (!Array.isArray(item.traits)) item.traits = []
  }
}

const MIGRATIONS: Record<number, (save: LooseSave) => LooseSave> = {
  // 1 → 2: battle units gained `traits` (creature traits moved out of talents).
  1: save => {
    for (const unit of Object.values(save.run?.battle?.units ?? {})) {
      if (!Array.isArray(unit.traits)) unit.traits = []
    }
    return save
  },
  2: save => {
    gradeItems(save.run?.character?.inventory)
    for (const unit of Object.values(save.run?.battle?.units ?? {})) gradeItems(unit.inventory)
    const shop = save.run?.shop
    if (shop && Array.isArray(shop.stock)) {
      shop.stock = shop.stock.map((entry, i) =>
        typeof entry === 'string' ? { uid: `shop-migrated-${i}`, defId: entry, grade: 'ordinary', traits: [] } : entry
      )
    }
    return save
  }
}

export interface LoadResult {
  save: SaveFile
  /** The original text of a save that couldn't be loaded, to keep aside. */
  backup?: string
}

const isLooseSave = (data: unknown): data is LooseSave => {
  return typeof data === 'object' && data !== null && typeof (data as { schemaVersion?: unknown }).schemaVersion === 'number'
}

export const loadSave = (raw: string | null, empty: () => SaveFile): LoadResult => {
  if (!raw) return { save: empty() }
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { save: empty(), backup: raw }
  }
  // Unreadable, or written by a newer version of the game.
  if (!isLooseSave(data) || data.schemaVersion > SCHEMA_VERSION) return { save: empty(), backup: raw }
  let save = data
  while (save.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[save.schemaVersion]
    if (!step) return { save: empty(), backup: raw }
    save = { ...step(save), schemaVersion: save.schemaVersion + 1 }
  }
  return { save: save as unknown as SaveFile }
}
