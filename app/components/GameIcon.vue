<script setup lang="ts">
withDefaults(defineProps<{ svg: string; label?: string; color?: string; size?: number }>(), {
  label: '',
  color: '#c3c9d2',
  size: 64
})
</script>

<template>
  <span
    class="game-icon"
    role="img"
    :aria-label="label"
    :style="{ color, width: `${size}px`, height: `${size}px` }"
    v-html="svg"
  />
</template>

<style scoped>
.game-icon {
  display: inline-block;
  flex: none;
}

.game-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
