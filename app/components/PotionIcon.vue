<script setup lang="ts">
const id = `potion-${useId().replace(/[^\w-]/g, '')}`
</script>

<template>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <radialGradient :id="id" cx="40%" cy="35%" r="75%">
        <stop offset="0%" stop-color="#ff9a8f" />
        <stop offset="45%" stop-color="#e0362c" />
        <stop offset="100%" stop-color="#7d1410" />
      </radialGradient>
    </defs>
    <rect x="10" y="1.6" width="4" height="3.4" rx="1" fill="#b08458" />
    <path d="M9.5 5h5v4.2a6.5 6.5 0 1 1-5 0z" fill="rgba(220, 230, 240, 0.18)" stroke="#d9dee5" stroke-width="1" />
    <path d="M6.42 13A6 6 0 1 0 17.58 13Z" :fill="`url(#${id})`" />
    <ellipse cx="9.4" cy="14.6" rx="1.1" ry="2" fill="#fff" opacity="0.35" />
  </svg>
</template>
