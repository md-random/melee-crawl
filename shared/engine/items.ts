import type { GradeDef, GradeId, Id, ItemDef, ItemInstance } from '../types'
import { GRADES } from '../data/grades'
import { ITEMS } from '../data/items'
import { ITEM_TRAITS } from '../data/itemTraits'

export const newItem = (uid: Id, defId: Id, grade: GradeId = 'ordinary', traits: Id[] = []): ItemInstance =>
  ({ uid, defId, grade, traits: [...traits] })

export const defOf = (inst: Pick<ItemInstance, 'defId'>): ItemDef | undefined => ITEMS[inst.defId]

export const gradeOf = (inst: Pick<ItemInstance, 'grade'>): GradeDef => GRADES[inst.grade] ?? GRADES.ordinary

export const itemName = (inst: Pick<ItemInstance, 'defId' | 'grade' | 'traits'>, def: ItemDef | undefined = defOf(inst)): string => {
  const traits = inst.traits.flatMap(id => (ITEM_TRAITS[id] ? [ITEM_TRAITS[id].name] : []))
  return [gradeOf(inst).name, ...traits, def?.name ?? inst.defId].join(' ')
}
