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
}>()

const emit = defineEmits<{ 'update:modelValue': [talents: OwnedTalent[]] }>()

const { branches, iqSpent, iqLeft, toggle, prune } = useTalents({
  attrs: () => props.attrs,
  owned: () => props.modelValue,
  cls: () => props.cls,
  locked: () => props.locked,
  attrPoints: () => props.attrPoints
})

function onClick(row: TalentRow) {
  emit('update:modelValue', toggle(row))
}

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
        <h2>Talents</h2>
        <p class="note">
          Talents are skills. Each costs IQ.
          Green = learned, gold outline = can learn now, faded = not yet.
        </p>
      </div>
      <span class="iq">IQ {{ attrs.IQ }} · Spent {{ iqSpent }} · Left {{ iqLeft }}</span>
    </div>
    <div class="branches">
      <div v-for="b in branches" :key="b.name" class="branch">
        <h3>{{ b.name }}</h3>
        <template v-for="row in b.rows" :key="row.key">
          <div v-if="row.weapons" :class="['talent', row.state]">
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
          <button v-else :class="['talent', row.state]" @click="onClick(row)">
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

.iq {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
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

.talent {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 2px 8px;
  text-align: left;
  align-items: start;
  font-size: 0.85rem;
  padding: 6px 8px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 6px;
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

.talent.owned {
  background: #3a5226;
  border-color: #7fa64e;
}

.talent.owned .why {
  color: #cfe3b5;
}

.talent.available {
  border-color: var(--accent);
}

.talent.available .why {
  color: var(--accent);
}

.talent.locked {
  opacity: 0.6;
}
</style>
