<script setup lang="ts">
// Gold coin icon: shaded gold face, darker edge, inner ring and a stamped star.
// Each copy gets its own gradient id, so several on one page don't clash. Size it with CSS.

const id = `coin-${useId().replace(/[^\w-]/g, '')}`
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <radialGradient :id="id" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#fff1a8" />
        <stop offset="45%" stop-color="#f2c14e" />
        <stop offset="100%" stop-color="#b8860b" />
      </radialGradient>
    </defs>
    <circle cx="12" cy="12" r="10.5" :fill="`url(#${id})`" stroke="#8a6408" stroke-width="1" />
    <circle cx="12" cy="12" r="7" fill="none" stroke="#a57a0c" stroke-width="1.2" />
    <path d="M12 8.2 L13.1 10.9 L15.9 11.1 L13.8 12.9 L14.4 15.7 L12 14.2 L9.6 15.7 L10.2 12.9 L8.1 11.1 L10.9 10.9 Z" fill="#a57a0c" />
  </svg>
</template>
