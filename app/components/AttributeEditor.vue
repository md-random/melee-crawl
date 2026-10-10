<script setup lang="ts">
import type { AttrKey, Attributes } from '#shared/types'

// ST / DX / IQ with + and − buttons, for hero creation and camp.
// The owner sets how low each may go and the most they may add up to.

const props = defineProps<{
  modelValue: Attributes
  /** Lowest each attribute may go. */
  min: Attributes
  /** Most ST + DX + IQ may add up to. */
  total: number
  /** One line under each attribute. */
  notes?: Partial<Record<AttrKey, string>>
}>()

const emit = defineEmits<{ 'update:modelValue': [attrs: Attributes] }>()

const left = computed(() => props.total - props.modelValue.ST - props.modelValue.DX - props.modelValue.IQ)

const bump = (key: AttrKey, by: 1 | -1) => {
  const next = props.modelValue[key] + by
  if (next < props.min[key] || (by > 0 && left.value <= 0)) return
  emit('update:modelValue', { ...props.modelValue, [key]: next })
}
</script>

<template>
  <div class="stack">
    <div v-for="key in (['ST', 'DX', 'IQ'] as const)" :key="key" :class="['attr', `attr-${key}`]">
      <div class="attr-row">
        <strong class="label">{{ key }}</strong>
        <div class="stepper">
          <button class="step" :disabled="modelValue[key] <= min[key]" @click="bump(key, -1)">−</button>
          <span class="val">{{ modelValue[key] }}</span>
          <button class="step" :disabled="left <= 0" @click="bump(key, 1)">+</button>
        </div>
      </div>
      <p v-if="notes?.[key]" class="note">{{ notes[key] }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Gaps instead of margins, so the stack's height is exactly its rows (camp sizes a bubble from it). */
.stack {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

/* Each attribute has its own color: ST red, DX green, IQ blue. */
.attr {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.attr-ST {
  --tone: #e0605a;
}

.attr-DX {
  --tone: #5cc46a;
}

.attr-IQ {
  --tone: #5a9ef0;
}

.attr-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.label {
  width: 28px;
  color: var(--tone);
}

/*
 * Neumorphic pill toggle: − on the left, + on the right, the value in a circle in the middle.
 * Same color as the panel; a dark shadow below right and a faint light one above left raise it off the surface.
 * 37.4px tall, 132.6px long.
 */
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: 4px 4px 9px rgba(0, 0, 0, 0.55), -3px -3px 8px rgba(255, 255, 255, 0.06);
}

/* Raised buttons that sink in when pressed. */
.step {
  display: grid;
  place-items: center;
  width: 39.5px;
  height: 31.4px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--panel);
  color: var(--tone);
  font-size: 1.1rem;
  font-weight: 900;
  line-height: 1;
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.5), -2px -2px 5px rgba(255, 255, 255, 0.05);
}

.step:hover:not(:disabled) {
  color: color-mix(in srgb, var(--tone) 65%, white);
}

.step:active:not(:disabled) {
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.6), inset -2px -2px 5px rgba(255, 255, 255, 0.05);
}

.step:disabled {
  box-shadow: none;
}

/* A raised knob, slightly taller than the pill, with a ring and glow in the attribute's color. */
.val {
  display: grid;
  place-items: center;
  width: 39.6px;
  height: 39.6px;
  margin: -4.1px 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--tone) 35%, var(--panel)), var(--panel) 75%);
  box-shadow:
    3px 3px 7px rgba(0, 0, 0, 0.6),
    -2px -2px 6px rgba(255, 255, 255, 0.07),
    inset 0 0 0 2px color-mix(in srgb, var(--tone) 70%, transparent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.note {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
