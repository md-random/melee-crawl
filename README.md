# MeleeCrawl

Permadeath hex-arena game based on The Fantasy Trip (2019 Legacy Edition).
Fan project — mechanics only, no rulebook text or art.

Nuxt 4 · Vue 3 `<script setup lang="ts">` · Pinia · Vitest · client-only (SSR off) · localStorage saves.

## Layout

```
shared/types/     data model (pure TS, imported as #shared/types)
app/              Nuxt app (components, composables, stores, pages)
tests/            Vitest unit tests for the rules engine
```

Rules engine code stays free of Vue imports so it can be unit tested directly.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest run
npm run typecheck  # nuxt typecheck
npm run build
```
