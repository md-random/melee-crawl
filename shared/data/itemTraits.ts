import type { ItemTraitDef } from '../types'

const LIST: ItemTraitDef[] = []

export const ITEM_TRAITS: Record<string, ItemTraitDef> = Object.fromEntries(LIST.map(t => [t.id, t]))
