<script setup lang="ts">
import type { DiceExpr, Requirement, TalentNode, WeaponSpec } from '#shared/types'

const props = defineProps<{ weapons: WeaponSpec[]; talents: TalentNode[] }>()

const TABS = [
  { id: 'weapons', label: 'Weapons' },
  { id: 'talents', label: 'Talents' }
] as const
const tab = ref<(typeof TABS)[number]['id']>('weapons')

const talentName = (id: string) => props.talents.find(t => t.id === id)?.name ?? id

const dmg = (d: DiceExpr) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

const weaponLine = (w: WeaponSpec) => [
  talentName(w.talent),
  dmg(w.damage),
  `ST ${w.minST}`,
  `${w.hands}H`,
  w.attackKind,
  ...(w.range ? [`Rng ${w.range}`] : []),
  `$${w.cost}`
].join(' · ')

const needText = (r: Requirement): string => {
  if ('all' in r) return r.all.map(needText).join(', ')
  if ('any' in r) return `one of ${r.any.map(needText).join(' / ')}`
  if ('talent' in r) return `${talentName(r.talent)}${r.rank && r.rank > 1 ? ` rank ${r.rank}` : ''}`
  return `${r.attr} ${r.min}`
}

const sortedTalents = computed(() => [...props.talents].sort((a, b) => a.pos.row - b.pos.row || a.pos.col - b.pos.col))

const talentLine = (t: TalentNode) => [
  t.pos.row === 0 ? 'Base' : `Level ${t.pos.row}`,
  t.branch,
  t.category,
  `${t.iqCost} IQ`,
  `min IQ ${t.minIQ}`,
  ...(t.maxRanks > 1 ? [`${t.maxRanks} ranks`] : []),
  ...(t.perWeapon ? ['per weapon'] : [])
].join(' · ')

const talentNeeds = (t: TalentNode) => [
  ...(t.requires ? [needText(t.requires)] : []),
  ...(t.weaponPrereq ? [`${talentName(t.weaponPrereq)} for the same weapon`] : [])
].join(' · ')

const talentCosts = (t: TalentNode) => (t.costOverrides ?? []).map(o => `${o.iqCost} IQ with ${talentName(o.ifHasTalent)}`).join(' · ')
</script>

<template>
  <div>
    <div class="ref-tabs">
      <button v-for="t in TABS" :key="t.id" :class="{ active: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
    </div>
    <ul v-if="tab === 'weapons'" class="ref-list">
      <li v-for="w in weapons" :key="w.id">
        <span class="ref-name">{{ w.name }}</span>
        <small>{{ weaponLine(w) }}</small>
      </li>
    </ul>
    <ul v-else class="ref-list">
      <li v-for="t in sortedTalents" :key="t.id">
        <span class="ref-name">{{ t.name }}</span>
        <small>{{ talentLine(t) }}</small>
        <small v-if="talentNeeds(t)">Needs {{ talentNeeds(t) }}</small>
        <small v-if="talentCosts(t)">Costs {{ talentCosts(t) }}</small>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ref-tabs {
  display: inline-flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 4px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

.ref-tabs button {
  padding: 4px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}

.ref-tabs button:hover {
  color: var(--fg);
}

.ref-tabs .active {
  background: var(--panel);
  color: var(--fg);
  box-shadow: 3px 3px 7px rgba(0, 0, 0, 0.55), -2px -2px 6px rgba(255, 255, 255, 0.06);
}

.ref-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.ref-list li {
  display: grid;
}

.ref-name {
  font-size: 0.85rem;
}

.ref-list small {
  color: var(--muted);
  font-size: 0.7rem;
}
</style>
