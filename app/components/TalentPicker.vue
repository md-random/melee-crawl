<script setup lang="ts">
import type { Attributes, CharacterClass, OwnedTalent } from '#shared/types'
import { useTalents, type TalentRow } from '~/composables/useTalents'

const props = defineProps<{
  modelValue: OwnedTalent[]
  attrs: Attributes
  cls: CharacterClass
  /** Saved talents: shown as permanent, can't be forgotten. */
  locked?: OwnedTalent[]
  /** Attribute points left to spend. */
  attrPoints?: number
  /** XP left to spend (camp). When set, each new talent also costs XP. */
  xp?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [talents: OwnedTalent[]] }>()

const { branches, iqSpent, iqLeft, toggle, prune } = useTalents({
  attrs: () => props.attrs,
  owned: () => props.modelValue,
  cls: () => props.cls,
  locked: () => props.locked,
  attrPoints: () => props.attrPoints,
  xp: () => props.xp
})

const onClick = (row: TalentRow) => {
  emit('update:modelValue', toggle(row))
}

/** A saved talent with nothing left to do is sunk in; everything else keeps its state's look. */
const look = (row: TalentRow) => (row.permanent && !row.canAdd ? 'permanent' : row.state)

// Lowering an attribute can disqualify talents; send the pruned list up.
watch(() => props.attrs, () => {
  const kept = prune()
  if (kept.length !== props.modelValue.length || kept.some((t, i) => t.rank !== props.modelValue[i]?.rank)) {
    emit('update:modelValue', kept)
  }
})
</script>

<template>
  <div>
    <div class="head">
      <div>
        <h2 class="pill-label">Talents</h2>
        <p class="note">
          Talents are skills. Each costs IQ.
          Green = learned, gold = can learn now, faded = not yet.<template v-if="locked?.length"> Sunk in = permanent.</template>
        </p>
      </div>
      <div class="iq">
        <span class="iq-badge"><strong>{{ attrs.IQ }}</strong><small>IQ</small></span>
        <span class="iq-badge"><strong>{{ iqSpent }}</strong><small>Spent</small></span>
        <span class="iq-badge"><strong>{{ iqLeft }}</strong><small>Left</small></span>
      </div>
    </div>
    <div class="branches">
      <div v-for="b in branches" :key="b.name" class="branch">
        <h3>{{ b.name }}</h3>
        <template v-for="row in b.rows" :key="row.key">
          <div v-if="row.weapons" :class="['talent', 'group', row.state]">
            <span class="icon">{{ row.node.icon }}</span>
            <span class="tname">{{ row.label }}</span>
            <span class="desc">{{ row.node.description }}</span>
            <span v-if="row.weapons.length" class="weapons">
              <button
                v-for="w in row.weapons"
                :key="w.key"
                :class="['weapon', w.state]"
                :title="w.lines.join(' ')"
                @click="onClick(w)"
              >
                {{ w.label }}
              </button>
            </span>
            <span v-for="l in row.lines" :key="l" class="why">{{ l }}</span>
          </div>
          <button v-else :class="['talent', look(row)]" @click="onClick(row)">
            <span class="icon">{{ row.node.icon }}</span>
            <span class="tname">{{ row.label }}</span>
            <span class="desc">{{ row.node.description }}</span>
            <span v-if="row.weaponLine" class="desc">{{ row.weaponLine }}</span>
            <span v-for="l in row.lines" :key="l" class="why">{{ l }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 6px;
}

/* Neumorphic, like the camp's top box: raised = can be pressed, sunk in = only shows something. */

/* Recessed label pill in muted gold, matching ATTRIBUTES at camp. */
.pill-label {
  display: inline-block;
  margin: 0 0 10px;
  padding: 6px 18px;
  border-radius: 999px;
  background: var(--panel);
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

/* IQ total, spent and left as recessed badges ringed in IQ blue. */
.iq {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.iq-badge {
  display: grid;
  justify-items: center;
  min-width: 58px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.55),
    inset -3px -3px 7px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px rgba(90, 158, 240, 0.6);
  line-height: 1.1;
}

.iq-badge strong {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.iq-badge small {
  font-size: 0.62rem;
  color: #5a9ef0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

h3 {
  font-size: 0.85rem;
  margin: 0 0 6px;
}

.note {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

.branches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.branch {
  display: grid;
  gap: 6px;
  align-content: start;
}

/*
 * Tiles by state, each ringed in its color (--ring):
 * can learn now = raised, gold · learned = raised, green (can still be clicked) ·
 * permanent = sunk in, green · not yet = flat and faded.
 * Per-weapon tiles aren't pressed themselves (their weapon buttons are), so they're sunk in.
 */
.talent {
  --ring: var(--border);
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 2px 10px;
  text-align: left;
  align-items: start;
  font-size: 0.85rem;
  padding: 8px 10px;
  background: var(--panel);
  border: none;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--ring);
  transition: box-shadow 0.15s, transform 0.15s;
}

.talent.available {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.talent.owned,
.talent.permanent {
  --ring: rgba(127, 166, 78, 0.8);
  background: color-mix(in srgb, #7fa64e 8%, var(--panel));
}

button.talent.available,
button.talent.owned {
  box-shadow:
    4px 4px 9px rgba(0, 0, 0, 0.55),
    -3px -3px 8px rgba(255, 255, 255, 0.06),
    inset 0 0 0 1.5px var(--ring);
}

button.talent.available:hover,
button.talent.owned:hover {
  transform: translateY(-1px);
  box-shadow:
    6px 6px 14px rgba(0, 0, 0, 0.6),
    -4px -4px 11px rgba(255, 255, 255, 0.08),
    inset 0 0 0 1.5px var(--ring);
}

button.talent.available:active,
button.talent.owned:active {
  transform: none;
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.6),
    inset -2px -2px 6px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px var(--ring);
}

.talent.permanent,
.talent.group {
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.55),
    inset -3px -3px 7px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px var(--ring);
}

button.talent.permanent,
button.talent.locked {
  cursor: default;
}

/* Icon in a flat circle ringed in the tile's color, like the camp badges. */
.icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ring) 30%, var(--panel)), var(--panel) 75%);
  box-shadow: inset 0 0 0 2px var(--ring);
  font-size: 0.95rem;
}

.weapons {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 2px 0;
}

.weapon {
  font-size: 0.75rem;
  padding: 1px 8px;
}

.weapon.owned {
  background: #3a5226;
  border-color: #7fa64e;
}

.weapon.available {
  border-color: var(--accent);
}

.weapon.locked {
  opacity: 0.6;
}

.tname {
  font-weight: 600;
}

.desc,
.why {
  grid-column: 2;
  font-size: 0.75rem;
  line-height: 1.3;
}

.desc {
  color: var(--fg);
  opacity: 0.85;
}

.why {
  color: var(--muted);
}

.talent.owned .why,
.talent.permanent .why {
  color: #cfe3b5;
}

.talent.available .why {
  color: var(--accent);
}

.talent.locked {
  opacity: 0.5;
}
</style>
