import type { TalentNode } from '../types'

// IQ costs, minimum IQ and prerequisites for official talents come from the
// TFT 2019 talent list (thefantasytrip.game). The list gives no effects, so
// official talents carry no effect values yet (unverified) — the rules engine
// handles weapon talents directly. Creature abilities are traits (data/traits.ts).

type Node = Omit<TalentNode, 'maxRanks' | 'effects'> & Partial<Pick<TalentNode, 'maxRanks' | 'effects'>>

const official = (n: Omit<Node, 'for' | 'official' | 'unverified'>): Node => ({ for: 'both', official: true, unverified: true, ...n })

const NODES: Node[] = [
  // ---------- blades ----------
  official({ id: 'dagger', name: 'Dagger', description: 'Use daggers without penalty.', category: 'weapon', icon: '🗡', branch: 'blades', pos: { col: 0, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({
    id: 'sword', name: 'Sword', description: 'Use swords without penalty.', category: 'weapon', icon: '⚔', branch: 'blades', pos: { col: 0, row: 1 },
    iqCost: 2, minIQ: 7, costOverrides: [{ ifHasTalent: 'dagger', iqCost: 1 }]
  }),
  official({
    id: 'fencer', name: 'Fencer', description: 'Effect not set yet. Armor can\'t bring adjusted DX below 12 when using it. ITL p. 40.', category: 'attack', icon: '🤺', branch: 'blades', pos: { col: 0, row: 4 },
    iqCost: 3, minIQ: 11, requires: { all: [{ talent: 'sword' }, { attr: 'DX', min: 12 }] }
  }),
  official({
    id: 'masterFencer', name: 'Master Fencer', description: 'Effect not set yet. ITL p. 42.', category: 'attack', icon: '🤺', branch: 'blades', pos: { col: 0, row: 6 },
    iqCost: 3, minIQ: 13, requires: { all: [{ talent: 'fencer' }, { attr: 'DX', min: 14 }] }
  }),

  // ---------- heavy weapons ----------
  official({ id: 'axMace', name: 'Ax/Mace', description: 'Use axes, maces, hammers and clubs without penalty.', category: 'weapon', icon: '🪓', branch: 'heavy', pos: { col: 1, row: 0 }, iqCost: 2, minIQ: 7 }),

  // ---------- polearms ----------
  official({ id: 'poleWeapons', name: 'Pole Weapons', description: 'Use spears, halberds and pikes without penalty.', category: 'weapon', icon: '🔱', branch: 'polearms', pos: { col: 2, row: 0 }, iqCost: 2, minIQ: 7 }),

  // ---------- ranged ----------
  official({ id: 'bow', name: 'Bow', description: 'Use bows without penalty.', category: 'weapon', icon: '🏹', branch: 'ranged', pos: { col: 3, row: 0 }, iqCost: 2, minIQ: 7 }),
  official({ id: 'crossbow', name: 'Crossbow', description: 'Use crossbows without penalty.', category: 'weapon', icon: '🎯', branch: 'ranged', pos: { col: 4, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({ id: 'thrownWeapons', name: 'Thrown Weapons', description: 'Throw weapons effectively.', category: 'weapon', icon: '🌀', branch: 'ranged', pos: { col: 3, row: 1 }, iqCost: 2, minIQ: 8 }),
  official({
    id: 'missileWeapons', name: 'Missile Weapons', description: 'Effect not set yet. Can be taken up to 3 times. ITL p. 38.', category: 'attack', icon: '🎯', branch: 'ranged', pos: { col: 4, row: 2 },
    iqCost: 1, minIQ: 9, maxRanks: 3
  }),

  // ---------- defense ----------
  official({ id: 'shield', name: 'Shield', description: 'Use a shield without penalty.', category: 'defense', icon: '🛡', branch: 'defense', pos: { col: 5, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({
    id: 'shieldExpertise', name: 'Shield Expertise', description: 'Expert use of a shield.', category: 'defense', icon: '🛡', branch: 'defense', pos: { col: 5, row: 2 },
    iqCost: 2, minIQ: 10, requires: { talent: 'shield' }
  }),
  official({
    id: 'toughness', name: 'Toughness I', description: 'Shrug off damage.', category: 'defense', icon: '💪', branch: 'defense', pos: { col: 6, row: 1 },
    iqCost: 2, minIQ: 9, requires: { attr: 'ST', min: 12 }
  }),
  official({
    id: 'toughness2', name: 'Toughness II', description: 'Shrug off damage.', category: 'defense', icon: '💪', branch: 'defense', pos: { col: 6, row: 2 },
    iqCost: 2, minIQ: 9, requires: { all: [{ talent: 'toughness' }, { attr: 'ST', min: 14 }] }
  }),

  // ---------- unarmed ----------
  official({ id: 'brawling', name: 'Brawling', description: 'Fight effectively without weapons.', category: 'attack', icon: '👊', branch: 'unarmed', pos: { col: 7, row: 0 }, iqCost: 1, minIQ: 7 }),
  official({ id: 'unarmed1', name: 'Unarmed Combat I', description: 'Effect not set yet. ITL p. 39.', category: 'attack', icon: '🥋', branch: 'unarmed', pos: { col: 7, row: 3 }, iqCost: 1, minIQ: 10 }),
  official({
    id: 'unarmed2', name: 'Unarmed Combat II', description: 'Effect not set yet. ITL p. 41.', category: 'attack', icon: '🥋', branch: 'unarmed', pos: { col: 7, row: 4 },
    iqCost: 1, minIQ: 11, requires: { all: [{ talent: 'unarmed1' }, { attr: 'DX', min: 11 }] }
  }),
  official({
    id: 'unarmed3', name: 'Unarmed Combat III', description: 'Effect not set yet. ITL p. 42.', category: 'attack', icon: '🥋', branch: 'unarmed', pos: { col: 7, row: 5 },
    iqCost: 2, minIQ: 12, requires: { all: [{ talent: 'unarmed2' }, { attr: 'DX', min: 12 }] }
  }),
  official({
    id: 'unarmed4', name: 'Unarmed Combat IV', description: 'Effect not set yet. ITL p. 43.', category: 'attack', icon: '🥋', branch: 'unarmed', pos: { col: 7, row: 6 },
    iqCost: 3, minIQ: 13, requires: { all: [{ talent: 'unarmed3' }, { attr: 'DX', min: 13 }, { attr: 'ST', min: 11 }] }
  }),
  official({
    id: 'unarmed5', name: 'Unarmed Combat V', description: 'Effect not set yet. ITL p. 44.', category: 'attack', icon: '🥋', branch: 'unarmed', pos: { col: 7, row: 7 },
    iqCost: 4, minIQ: 14, requires: { all: [{ talent: 'unarmed4' }, { attr: 'DX', min: 14 }, { attr: 'ST', min: 12 }] }
  }),

  // ---------- mobility ----------
  official({ id: 'running', name: 'Running', description: 'Move faster.', category: 'movement', icon: '🏃', branch: 'mobility', pos: { col: 8, row: 0 }, iqCost: 2, minIQ: 8 }),
  official({ id: 'alertness', name: 'Alertness', description: 'Harder to surprise; notices more.', category: 'utility', icon: '👁', branch: 'mobility', pos: { col: 8, row: 1 }, iqCost: 2, minIQ: 9 }),
  official({
    id: 'acrobatics', name: 'Acrobatics', description: 'Effect not set yet. ITL p. 38.', category: 'movement', icon: '🤸', branch: 'mobility', pos: { col: 8, row: 3 },
    iqCost: 2, minIQ: 10, requires: { attr: 'DX', min: 12 }
  }),

  // ---------- mastery ----------
  official({
    id: 'twoWeapons', name: 'Two Weapons', description: 'A weapon in each hand: two of the same, or two different ones if you know both talents.', category: 'attack', icon: '⚔', branch: 'mastery', pos: { col: 0, row: 3 },
    iqCost: 2, minIQ: 11,
    // Needs one weapon talent; loadoutProblems() checks the second weapon's talent.
    requires: { all: [{ attr: 'DX', min: 11 }, { any: [{ talent: 'dagger' }, { talent: 'sword' }, { talent: 'axMace' }] }] }
  }),
  official({
    id: 'weaponExpertise', name: 'Weapon Expertise', description: 'Expert with one weapon type. Taken once per weapon talent.', category: 'attack', icon: '⭐', branch: 'mastery', pos: { col: 1, row: 3 },
    iqCost: 3, minIQ: 11, perWeapon: true, requires: { attr: 'DX', min: 12 }
  }),
  official({
    id: 'weaponMastery', name: 'Weapon Mastery', description: 'Effect not set yet. Taken once per weapon talent. ITL p. 43.', category: 'attack', icon: '🌟', branch: 'mastery', pos: { col: 1, row: 6 },
    iqCost: 3, minIQ: 13, perWeapon: true, weaponPrereq: 'weaponExpertise', requires: { attr: 'DX', min: 14 }
  }),
  official({
    id: 'quickDraw', name: 'Quick-Draw', description: 'Effect not set yet. Taken once per weapon talent. ITL p. 36.', category: 'utility', icon: '⚡', branch: 'mastery', pos: { col: 2, row: 1 },
    iqCost: 1, minIQ: 8, perWeapon: true
  }),
  official({ id: 'tactics', name: 'Tactics', description: 'Effect not set yet. ITL p. 40.', category: 'utility', icon: '♟', branch: 'mastery', pos: { col: 3, row: 4 }, iqCost: 1, minIQ: 11 })
]

export const TALENTS: Record<string, TalentNode> = Object.fromEntries(
  NODES.map(n => [n.id, { maxRanks: 1, effects: [], ...n }])
)

/** Weapon talents a perWeapon talent can be taken for. */
export const WEAPON_TALENTS = ['dagger', 'sword', 'axMace', 'poleWeapons', 'bow', 'crossbow', 'thrownWeapons'] as const
