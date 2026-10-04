import type { TalentNode } from '../types'

// IQ costs, minimum IQ and prerequisites for official talents come from the
// TFT 2019 talent list (thefantasytrip.game). The list gives no effects, so
// official talents carry no effect values yet (unverified) — the rules engine
// handles weapon talents directly. Creature talents are ours.

type Node = Omit<TalentNode, 'maxRanks' | 'effects'> & Partial<Pick<TalentNode, 'maxRanks' | 'effects'>>

const official = (n: Omit<Node, 'for' | 'official' | 'unverified'>): Node => ({ for: 'both', official: true, unverified: true, ...n })
const creature = (n: Omit<Node, 'for' | 'official' | 'iqCost' | 'minIQ'>): Node => ({ for: 'creature', official: false, iqCost: 0, minIQ: 0, ...n })

const NODES: Node[] = [
  // ---------- blades ----------
  official({ id: 'dagger', name: 'Dagger', description: 'Use daggers without penalty.', category: 'weapon', icon: '🗡', branch: 'blades', pos: { col: 0, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({
    id: 'sword', name: 'Sword', description: 'Use swords without penalty.', category: 'weapon', icon: '⚔', branch: 'blades', pos: { col: 0, row: 1 },
    iqCost: 2, minIQ: 7, costOverrides: [{ ifHasTalent: 'dagger', iqCost: 1 }]
  }),

  // ---------- heavy weapons ----------
  official({ id: 'axMace', name: 'Ax/Mace', description: 'Use axes, maces, hammers and clubs without penalty.', category: 'weapon', icon: '🪓', branch: 'heavy', pos: { col: 1, row: 0 }, iqCost: 2, minIQ: 7 }),

  // ---------- polearms ----------
  official({ id: 'poleWeapons', name: 'Pole Weapons', description: 'Use spears, halberds and pikes without penalty.', category: 'weapon', icon: '🔱', branch: 'polearms', pos: { col: 2, row: 0 }, iqCost: 2, minIQ: 7 }),

  // ---------- ranged ----------
  official({ id: 'bow', name: 'Bow', description: 'Use bows without penalty.', category: 'weapon', icon: '🏹', branch: 'ranged', pos: { col: 3, row: 0 }, iqCost: 2, minIQ: 7 }),
  official({ id: 'crossbow', name: 'Crossbow', description: 'Use crossbows without penalty.', category: 'weapon', icon: '🎯', branch: 'ranged', pos: { col: 4, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({ id: 'thrownWeapons', name: 'Thrown Weapons', description: 'Throw weapons effectively.', category: 'weapon', icon: '🌀', branch: 'ranged', pos: { col: 3, row: 1 }, iqCost: 2, minIQ: 8 }),

  // ---------- defense ----------
  official({ id: 'shield', name: 'Shield', description: 'Use a shield without penalty.', category: 'defense', icon: '🛡', branch: 'defense', pos: { col: 5, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({
    id: 'shieldExpertise', name: 'Shield Expertise', description: 'Expert use of a shield.', category: 'defense', icon: '🛡', branch: 'defense', pos: { col: 5, row: 2 },
    iqCost: 2, minIQ: 10, requires: { talent: 'shield' }
  }),
  official({
    id: 'toughness', name: 'Toughness', description: 'Shrug off damage. Two ranks.', category: 'defense', icon: '💪', branch: 'defense', pos: { col: 6, row: 1 },
    iqCost: 2, minIQ: 9, maxRanks: 2, requires: { attr: 'ST', min: 12 }, rankRequires: { 2: { attr: 'ST', min: 14 } }
  }),

  // ---------- unarmed ----------
  official({ id: 'brawling', name: 'Brawling', description: 'Fight effectively without weapons.', category: 'attack', icon: '👊', branch: 'unarmed', pos: { col: 7, row: 0 }, iqCost: 1, minIQ: 7 }),

  // ---------- mobility ----------
  official({ id: 'running', name: 'Running', description: 'Move faster.', category: 'movement', icon: '🏃', branch: 'mobility', pos: { col: 8, row: 0 }, iqCost: 2, minIQ: 8 }),
  official({ id: 'alertness', name: 'Alertness', description: 'Harder to surprise; notices more.', category: 'utility', icon: '👁', branch: 'mobility', pos: { col: 8, row: 1 }, iqCost: 2, minIQ: 9 }),

  // ---------- mastery ----------
  official({
    id: 'twoWeapons', name: 'Two Weapons', description: 'Fight with a weapon in each hand. Needs talents for both weapons.', category: 'attack', icon: '⚔', branch: 'mastery', pos: { col: 0, row: 3 },
    iqCost: 2, minIQ: 11,
    // Official text: talents for both weapons. Approximated as "any weapon talent"; the engine checks the actual pair.
    requires: { all: [{ attr: 'DX', min: 11 }, { any: [{ talent: 'dagger' }, { talent: 'sword' }, { talent: 'axMace' }] }] }
  }),
  official({
    id: 'weaponExpertise', name: 'Weapon Expertise', description: 'Expert with one weapon type. Taken once per weapon talent.', category: 'attack', icon: '⭐', branch: 'mastery', pos: { col: 1, row: 3 },
    iqCost: 3, minIQ: 11, perWeapon: true, requires: { attr: 'DX', min: 12 }
  }),

  // ---------- creature-only (ours) ----------
  creature({
    id: 'thickHide', name: 'Thick Hide', description: 'Stops 1 hit of damage per rank.', category: 'defense', icon: '🦏', branch: 'creature', pos: { col: 0, row: 0 }, maxRanks: 2,
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'hitsStopped', value: 1 }], duration: { type: 'permanent' }, stacking: 'stack' }]
  }),
  creature({
    id: 'keenSenses', name: 'Keen Senses', description: '+1 initiative.', category: 'utility', icon: '👃', branch: 'creature', pos: { col: 1, row: 0 },
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'initiative', value: 1 }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  }),
  creature({
    id: 'swift', name: 'Swift', description: '+2 MA.', category: 'movement', icon: '💨', branch: 'creature', pos: { col: 2, row: 0 },
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'MA', value: 2 }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  }),
  creature({
    id: 'packTactics', name: 'Pack Tactics', description: '+1 to hit when an ally is next to the target.', category: 'attack', icon: '🐺', branch: 'creature', pos: { col: 3, row: 0 },
    effects: [{ kind: 'modifier', modifiers: [{ stat: 'toHit', value: 1, when: { allyAdjacentToTarget: true } }], duration: { type: 'permanent' }, stacking: 'ignore' }]
  }),
  creature({
    id: 'ferocity', name: 'Ferocity', description: 'Keeps fighting for one turn after reaching 0 ST.', category: 'defense', icon: '😤', branch: 'creature', pos: { col: 4, row: 0 },
    requires: { attr: 'ST', min: 10 }
  }),
  creature({
    id: 'venom', name: 'Venom', description: 'Bite poisons: 1 damage per turn for 3 turns.', category: 'debuff', icon: '🐍', branch: 'creature', pos: { col: 5, row: 0 },
    effects: [{ kind: 'grantAction', actionId: 'venomBite' }]
  }),
  creature({
    id: 'pounce', name: 'Pounce', description: 'Charge attack with +1 damage; may knock the target down.', category: 'attack', icon: '🐆', branch: 'creature', pos: { col: 6, row: 0 },
    requires: { attr: 'DX', min: 12 },
    effects: [{ kind: 'grantAction', actionId: 'pounce' }]
  }),
  creature({
    id: 'warCry', name: 'War Cry', description: 'Once per battle: enemies within 2 hexes get −1 DX for 3 turns.', category: 'debuff', icon: '📢', branch: 'creature', pos: { col: 7, row: 0 },
    effects: [{ kind: 'grantAction', actionId: 'warCry' }]
  })
]

export const TALENTS: Record<string, TalentNode> = Object.fromEntries(
  NODES.map(n => [n.id, { maxRanks: 1, effects: [], ...n }])
)

/** Weapon talents a perWeapon talent can be taken for. */
export const WEAPON_TALENTS = ['dagger', 'sword', 'axMace', 'poleWeapons', 'bow', 'crossbow', 'thrownWeapons'] as const
