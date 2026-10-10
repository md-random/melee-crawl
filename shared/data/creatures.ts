import type { Archetype, CreatureBase } from '../types'

// Bestiary: base stat blocks before any level budget. Ours, loosely modeled on
// classic Melee creatures; all unverified.

const RAW: CreatureBase[] = [
  // ---------- humanoids (use items, built through archetypes) ----------
  { id: 'human', name: 'Human', portraitId: 'warrior', genus: 'human', tags: ['humanoid'], attrs: { ST: 10, DX: 10, IQ: 9, MA: 10 }, naturalWeapons: [], naturalHitsStopped: 0, baseTalents: [], traits: [], canUseItems: true, hexSize: 1, xpValue: 40, goldDrop: { dice: 2, mod: 5 } },
  { id: 'orc', name: 'Orc', portraitId: 'monster', genus: 'orc', tags: ['humanoid', 'orc'], attrs: { ST: 12, DX: 9, IQ: 7, MA: 10 }, naturalWeapons: [{ name: 'Fists', damage: { dice: 1, mod: 2 }, attackKind: 'melee' }], naturalHitsStopped: 0, baseTalents: [{ id: 'brawling', rank: 1 }], traits: [], canUseItems: false, hexSize: 1, xpValue: 40, goldDrop: { dice: 2, mod: 0 } },
  { id: 'goblin', name: 'Goblin', portraitId: 'monster', genus: 'goblin', tags: ['humanoid', 'goblin'], attrs: { ST: 8, DX: 11, IQ: 7, MA: 10 }, naturalWeapons: [], naturalHitsStopped: 0, baseTalents: [{ id: 'dagger', rank: 1 }], traits: [], canUseItems: true, hexSize: 1, xpValue: 25, goldDrop: { dice: 1, mod: 0 } },
  { id: 'hobgoblin', name: 'Hobgoblin', portraitId: 'monster', genus: 'hobgoblin', tags: ['humanoid', 'goblin'], attrs: { ST: 11, DX: 10, IQ: 7, MA: 10 }, naturalWeapons: [], naturalHitsStopped: 0, baseTalents: [{ id: 'sword', rank: 1 }], traits: [], canUseItems: true, hexSize: 1, xpValue: 35, goldDrop: { dice: 2, mod: 0 } },
  { id: 'skeleton', name: 'Skeleton', portraitId: 'monster', genus: 'undead', tags: ['undead'], attrs: { ST: 9, DX: 10, IQ: 6, MA: 10 }, naturalWeapons: [{ name: 'Claws', damage: { dice: 1, mod: 0 }, attackKind: 'melee' }], naturalHitsStopped: 1, baseTalents: [], traits: [], canUseItems: false, hexSize: 1, xpValue: 35, goldDrop: { dice: 1, mod: 0 } },

  // ---------- beasts (natural weapons, creature talents) ----------
  { id: 'wolf', name: 'Wolf', portraitId: 'monster', genus: 'wolf', tags: ['beast'], attrs: { ST: 10, DX: 14, IQ: 6, MA: 12 }, naturalWeapons: [{ name: 'Bite', damage: { dice: 1, mod: 1 }, attackKind: 'melee' }], naturalHitsStopped: 0, baseTalents: [], traits: [{ id: 'keenSenses', rank: 1 }, { id: 'packTactics', rank: 1 }], canUseItems: false, hexSize: 1, xpValue: 35, goldDrop: { dice: 0, mod: 0 } },
  { id: 'bear', name: 'Bear', portraitId: 'monster', genus: 'bear', tags: ['beast'], attrs: { ST: 20, DX: 11, IQ: 6, MA: 8 }, naturalWeapons: [{ name: 'Claws', damage: { dice: 2, mod: 0 }, attackKind: 'melee' }], naturalHitsStopped: 1, baseTalents: [], traits: [{ id: 'thickHide', rank: 1 }], canUseItems: false, hexSize: 1, xpValue: 80, goldDrop: { dice: 0, mod: 0 } },
  { id: 'giantSpider', name: 'Giant Spider', portraitId: 'monster', genus: 'giantSpider', tags: ['beast', 'vermin'], attrs: { ST: 12, DX: 13, IQ: 5, MA: 10 }, naturalWeapons: [{ name: 'Bite', damage: { dice: 1, mod: 2 }, attackKind: 'melee' }], naturalHitsStopped: 1, baseTalents: [], traits: [{ id: 'venom', rank: 1 }], canUseItems: false, hexSize: 1, xpValue: 60, goldDrop: { dice: 0, mod: 0 } },
  { id: 'giantSnake', name: 'Giant Snake', portraitId: 'monster', genus: 'giantSnake', tags: ['beast'], attrs: { ST: 12, DX: 12, IQ: 4, MA: 6 }, naturalWeapons: [{ name: 'Bite', damage: { dice: 2, mod: -1 }, attackKind: 'melee' }], naturalHitsStopped: 1, baseTalents: [], traits: [{ id: 'venom', rank: 1 }], canUseItems: false, hexSize: 1, xpValue: 50, goldDrop: { dice: 0, mod: 0 } },
  { id: 'giantRat', name: 'Giant Rat', portraitId: 'monster', genus: 'giantRat', tags: ['beast', 'vermin'], attrs: { ST: 6, DX: 12, IQ: 4, MA: 12 }, naturalWeapons: [{ name: 'Bite', damage: { dice: 1, mod: -2 }, attackKind: 'melee' }], naturalHitsStopped: 0, baseTalents: [], traits: [{ id: 'swift', rank: 1 }], canUseItems: false, hexSize: 1, xpValue: 15, goldDrop: { dice: 0, mod: 0 } }
]
const LIST = RAW.map(c => ({ ...c, unverified: true }))

export const CREATURES: Record<string, CreatureBase> = Object.fromEntries(LIST.map(c => [c.id, c]))

const ARCHETYPE_LIST: Archetype[] = [
  {
    id: 'brute', name: 'Brute', appliesTo: { baseIds: ['orc', 'hobgoblin', 'human'] },
    attrBias: { ST: 0.7, DX: 0.3 },
    talentPriority: ['ax|mace', 'toughness', 'weaponExpertise:ax|mace'],
    gear: { weapons: ['battleaxe', 'mace', 'smallAx', 'club'], armor: 'leather' },
    aiProfile: 'brute',
    titles: [{ minBudget: 0, title: 'Grunt' }, { minBudget: 3, title: 'Warrior' }, { minBudget: 7, title: 'Veteran' }, { minBudget: 12, title: 'Chieftain' }]
  },
  {
    id: 'duelist', name: 'Duelist', appliesTo: { baseIds: ['human', 'hobgoblin'] },
    attrBias: { DX: 0.6, ST: 0.3, IQ: 0.1 },
    talentPriority: ['dagger', 'sword', 'alertness', 'weaponExpertise:sword', 'running'],
    gear: { weapons: ['bastardSword', 'broadsword', 'shortsword', 'rapier', 'cutlass'], armor: 'leather' },
    aiProfile: 'duelist',
    titles: [{ minBudget: 0, title: 'Novice' }, { minBudget: 3, title: 'Fencer' }, { minBudget: 7, title: 'Swordmaster' }, { minBudget: 12, title: 'Champion' }]
  },
  {
    id: 'shieldwall', name: 'Shieldwall', appliesTo: { baseIds: ['human', 'orc', 'hobgoblin'] },
    attrBias: { ST: 0.5, DX: 0.4, IQ: 0.1 },
    talentPriority: ['shield', 'sword', 'shieldExpertise', 'toughness'],
    gear: { weapons: ['broadsword', 'shortsword', 'cutlass', 'rapier'], armor: 'chainmail', shield: 'largeShield' },
    aiProfile: 'brute',
    titles: [{ minBudget: 0, title: 'Guard' }, { minBudget: 3, title: 'Soldier' }, { minBudget: 7, title: 'Sergeant' }, { minBudget: 12, title: 'Captain' }]
  },
  {
    id: 'skirmisher', name: 'Skirmisher', appliesTo: { baseIds: ['goblin', 'human'] },
    attrBias: { DX: 0.7, ST: 0.3 },
    talentPriority: ['poleWeapons', 'thrownWeapons', 'running', 'alertness'],
    gear: { weapons: ['spear', 'javelin', 'dagger'] },
    aiProfile: 'skirmisher',
    titles: [{ minBudget: 0, title: 'Sneak' }, { minBudget: 3, title: 'Raider' }, { minBudget: 7, title: 'Stalker' }, { minBudget: 12, title: 'Warlord' }]
  },
  {
    id: 'archer', name: 'Archer', appliesTo: { baseIds: ['human', 'goblin'] },
    attrBias: { DX: 0.8, ST: 0.2 },
    talentPriority: ['bow', 'dagger', 'alertness', 'weaponExpertise:bow'],
    gear: { weapons: ['longbow', 'smallBow', 'dagger'] },
    aiProfile: 'archer',
    titles: [{ minBudget: 0, title: 'Bowman' }, { minBudget: 3, title: 'Archer' }, { minBudget: 7, title: 'Marksman' }, { minBudget: 12, title: 'Sharpshooter' }]
  },
  {
    id: 'pack', name: 'Pack Hunter', appliesTo: { baseIds: ['skeleton'], tags: ['beast'] },
    attrBias: { DX: 0.5, ST: 0.5 },
    talentPriority: [],
    aiProfile: 'packHunter',
    titles: [{ minBudget: 0, title: '' }, { minBudget: 3, title: 'Grown' }, { minBudget: 7, title: 'Alpha' }, { minBudget: 12, title: 'Dire' }]
  },
  {
    id: 'lurker', name: 'Lurker', appliesTo: { baseIds: ['skeleton'], tags: ['vermin'] },
    attrBias: { DX: 0.6, ST: 0.4 },
    talentPriority: [],
    aiProfile: 'skirmisher',
    titles: [{ minBudget: 0, title: '' }, { minBudget: 3, title: 'Large' }, { minBudget: 7, title: 'Huge' }, { minBudget: 12, title: 'Monstrous' }]
  }
]

export const ARCHETYPES: Record<string, Archetype> = Object.fromEntries(ARCHETYPE_LIST.map(a => [a.id, a]))

export const archetypesFor = (base: CreatureBase): Archetype[] => {
  return ARCHETYPE_LIST.filter(a =>
    a.appliesTo.baseIds?.includes(base.id) || a.appliesTo.tags?.some(t => base.tags.includes(t))
  )
}
