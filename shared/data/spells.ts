import type { SpellDef } from '../types'

// Spell list. Empty until wizards land; the castSpell action already reads
// from here, so adding a spell is adding an entry.

const LIST: SpellDef[] = []

export const SPELLS: Record<string, SpellDef> = Object.fromEntries(LIST.map(s => [s.id, s]))
