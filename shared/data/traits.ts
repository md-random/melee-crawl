import type { TraitDef } from '../types'

// Creature traits: innate abilities written on a stat block, never bought.
// All ours, not from the 2019 rules. Ferocity, Venom, Pounce and War Cry
// have no battle effect yet (deferred until the full talent work).

const LIST: TraitDef[] = [
  {
    id: 'thickHide', name: 'Thick Hide', description: 'Stops 1 hit of damage per rank.', icon: '🦏', maxRanks: 2,
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'hitsStopped', value: 1 }], duration: { type: 'permanent' }, stacking: 'stack' }]
  },
  {
    id: 'keenSenses', name: 'Keen Senses', description: '+1 initiative.', icon: '👃', maxRanks: 1,
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'initiative', value: 1 }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  },
  {
    id: 'swift', name: 'Swift', description: '+2 MA.', icon: '💨', maxRanks: 1,
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'MA', value: 2 }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  },
  {
    id: 'packTactics', name: 'Pack Tactics', description: '+1 to hit when an ally is next to the target.', icon: '🐺', maxRanks: 1,
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'toHit', value: 1, when: { allyAdjacentToTarget: true } }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  },
  { id: 'ferocity', name: 'Ferocity', description: 'Keeps fighting for one turn after reaching 0 ST.', icon: '😤', maxRanks: 1, effects: [] },
  { id: 'venom', name: 'Venom', description: 'Bite poisons: 1 damage per turn for 3 turns.', icon: '🐍', maxRanks: 1, effects: [{ kind: 'grantAction', actionId: 'venomBite' }] },
  { id: 'pounce', name: 'Pounce', description: 'Charge attack with +1 damage; may knock the target down.', icon: '🐆', maxRanks: 1, effects: [{ kind: 'grantAction', actionId: 'pounce' }] },
  { id: 'warCry', name: 'War Cry', description: 'Once per battle: enemies within 2 hexes get −1 DX for 3 turns.', icon: '📢', maxRanks: 1, effects: [{ kind: 'grantAction', actionId: 'warCry' }] }
]

export const TRAITS: Record<string, TraitDef> = Object.fromEntries(LIST.map(t => [t.id, { ...t, unverified: true }]))
