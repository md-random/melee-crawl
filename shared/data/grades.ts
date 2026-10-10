import type { GradeDef, GradeId } from '../types'

export const GRADES: Record<GradeId, GradeDef> = {
  ordinary: { id: 'ordinary', name: 'Ordinary', rank: 1, color: '#43b85c', traitSlots: 0 },
  cool: { id: 'cool', name: 'Cool', rank: 2, color: '#3d8ee8', traitSlots: 1 },
  bitchin: { id: 'bitchin', name: 'Bitchin', rank: 3, color: '#a35ee8', traitSlots: 2 },
  righteous: { id: 'righteous', name: 'Righteous', rank: 4, color: '#f28c28', traitSlots: 0 }
}

export const GRADE_ORDER: GradeId[] = ['ordinary', 'cool', 'bitchin', 'righteous']
