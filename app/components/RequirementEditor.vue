<script setup lang="ts">
import type { AttrKey, Requirement } from '#shared/types'
import { ATTR_KEYS } from '#shared/engine/talents'

type Kind = '' | 'talent' | 'attr' | 'all' | 'any'

const props = defineProps<{
  modelValue?: Requirement
  talents: { id: string; name: string }[]
  nested?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Requirement | undefined] }>()

const kindOf = (r?: Requirement): Kind => (!r ? '' : 'all' in r ? 'all' : 'any' in r ? 'any' : 'talent' in r ? 'talent' : 'attr')

const kind = computed(() => kindOf(props.modelValue))

const parts = computed<Requirement[]>(() => {
  const r = props.modelValue
  return r && 'all' in r ? r.all : r && 'any' in r ? r.any : []
})

const blankPart = (): Requirement => ({ talent: '' })

const setKind = (k: Kind) => {
  if (k === kind.value) return
  if (k === '') emit('update:modelValue', undefined)
  else if (k === 'talent') emit('update:modelValue', { talent: '' })
  else if (k === 'attr') emit('update:modelValue', { attr: 'ST', min: '' as unknown as number })
  else {
    const keep = parts.value.length ? parts.value : [blankPart()]
    emit('update:modelValue', k === 'all' ? { all: keep } : { any: keep })
  }
}

const setParts = (list: Requirement[]) => emit('update:modelValue', kind.value === 'all' ? { all: list } : { any: list })

const setPart = (i: number, value: Requirement | undefined) => {
  if (value) setParts(parts.value.map((p, j) => (j === i ? value : p)))
}

const removePart = (i: number) => setParts(parts.value.filter((_, j) => j !== i))

const update = (patch: Record<string, unknown>) => emit('update:modelValue', { ...props.modelValue, ...patch } as Requirement)

const valueOf = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value

const numberOf = (e: Event) => {
  const v = valueOf(e)
  return v === '' ? '' : Number(v)
}

const setRank = (e: Event) => {
  const r = props.modelValue
  if (!r || !('talent' in r)) return
  const { rank: _, ...rest } = r
  const n = numberOf(e)
  emit('update:modelValue', n === '' ? rest : { ...rest, rank: n })
}
</script>

<template>
  <div class="req">
    <div class="req-row">
      <select :value="kind" class="field" @change="setKind(valueOf($event) as Kind)">
        <option v-if="!nested" value="">Nothing</option>
        <option value="talent">Talent</option>
        <option value="attr">Attribute</option>
        <option value="all">All of</option>
        <option value="any">One of</option>
      </select>
      <template v-if="modelValue && 'talent' in modelValue">
        <select :value="modelValue.talent" class="field" @change="update({ talent: valueOf($event) })">
          <option value="" disabled>Pick a talent</option>
          <option v-for="t in talents" :key="t.id" :value="t.id">{{ t.name }}</option>
        </select>
        <input :value="modelValue.rank ?? ''" type="number" min="1" step="1" class="field num" placeholder="Rank" @input="setRank">
      </template>
      <template v-else-if="modelValue && 'attr' in modelValue">
        <select :value="modelValue.attr" class="field" @change="update({ attr: valueOf($event) as AttrKey })">
          <option v-for="a in ATTR_KEYS" :key="a" :value="a">{{ a }}</option>
        </select>
        <input :value="modelValue.min" type="number" min="0" step="1" class="field num" placeholder="Min" @input="update({ min: numberOf($event) })">
      </template>
    </div>
    <div v-if="kind === 'all' || kind === 'any'" class="req-parts">
      <div v-for="(p, i) in parts" :key="i" class="req-part">
        <RequirementEditor :model-value="p" :talents="talents" nested @update:model-value="setPart(i, $event)" />
        <button class="neu-btn small danger" @click="removePart(i)">Remove</button>
      </div>
      <div>
        <button class="neu-btn small" @click="setParts([...parts, blankPart()])">Add</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.req {
  display: grid;
  gap: 8px;
}

.req-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.75rem;
}

.req-row .field {
  flex: 1 1 90px;
}

.req-row .num {
  flex: 0 0 72px;
}

.req-parts {
  display: grid;
  gap: 8px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}

.req-part {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
}
</style>
