<script setup lang="ts">
import type { GearPower } from '#shared/engine/power'

const props = defineProps<{
  mineName?: string
  mineColor?: string
  emptyLabel: string
  before: GearPower
  after: GearPower
  power: number
  showStops: boolean
}>()

const pct = (p: number) => Math.round(p * 100)
const rounded = computed(() => Number(props.power.toFixed(1)))
const powerText = computed(() => (rounded.value === 0 ? '±0' : `${rounded.value > 0 ? '+' : '−'}${Math.abs(rounded.value).toFixed(1)}`))
const tone = computed(() => (rounded.value > 0 ? 'up' : rounded.value < 0 ? 'down' : 'even'))
</script>

<template>
  <div class="compare">
    <div class="line">
      <span class="vs">
        vs
        <span v-if="mineName" class="mine" :style="{ '--grade': mineColor }">{{ mineName }}</span>
        <template v-else>{{ emptyLabel }}</template>
      </span>
      <strong :class="['power', tone]" title="Change in ST damage per turn">{{ powerText }}</strong>
    </div>
    <div class="line nums">
      Hit {{ pct(before.hit) }}→{{ pct(after.hit) }}% · Dmg {{ before.perTurn.toFixed(1) }}→{{ after.perTurn.toFixed(1) }}<template v-if="showStops"> · Stops {{ before.stops }}→{{ after.stops }}</template>
    </div>
  </div>
</template>

<style scoped>
.compare {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 5px;
  border-top: 1px solid color-mix(in srgb, var(--muted) 30%, transparent);
  font-size: 0.72rem;
  line-height: 1.3;
}

.line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}

.vs {
  min-width: 0;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mine {
  color: color-mix(in srgb, var(--grade) 85%, white);
  font-weight: 600;
}

.nums {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.power {
  flex: none;
  font-size: 0.8rem;
}

.power.up {
  color: #5cc46a;
}

.power.down {
  color: #e07a6a;
}

.power.even {
  color: var(--muted);
}
</style>
