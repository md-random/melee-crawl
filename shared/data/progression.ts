import type { ProgressionRules } from '../types'

/**
 * Attribute XP table from Henry J. Cobb's Legacy vs First comparison
 * (hcobb.com/tft/legacy_first.html) — a secondary source, unverified.
 * Talent cost 500 XP (×2 for wizards), also unverified.
 */
export const PROGRESSION: ProgressionRules = {
  startingAttrPoints: 32,
  minAttr: 8,
  attrXpTable: [
    { totalXp: 0, attrTotal: 32 },
    { totalXp: 400, attrTotal: 35 },
    { totalXp: 700, attrTotal: 36 },
    { totalXp: 1300, attrTotal: 37 },
    { totalXp: 2300, attrTotal: 38 },
    { totalXp: 4300, attrTotal: 39 },
    { totalXp: 8500, attrTotal: 40 },
    { totalXp: 17500, attrTotal: 41 }
  ],
  talentXpCost: 500,
  wizardTalentMultiplier: 2
}

/** Base MA for an unarmored humanoid. */
export const BASE_MA = 10

/**
 * DX penalty for using a weapon without its talent. Placeholder until
 * checked against the 2019 rules.
 */
export const NO_TALENT_DX_PENALTY = 4
