import type { TalentNode } from '../types'
import TALENT_LIST from './talents.json'

export const TALENTS: Record<string, TalentNode> = Object.fromEntries((TALENT_LIST as TalentNode[]).map(t => [t.id, t]))

export const WEAPON_TALENTS: string[] = Object.values(TALENTS)
  .filter(t => t.category === 'weapon')
  .sort((a, b) => a.pos.col - b.pos.col)
  .map(t => t.id)
