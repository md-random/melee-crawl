# MeleeCrawl rules

## Arrow functions only (`.vue` and `.ts`)

- Write every function as `const name = (...) => { ... }` (`export const` when exported).
- Never write `function name() { ... }` declarations, in `<script setup>` or in `.ts` files, nested ones included.
- Define each arrow before any code that calls it right away (arrows aren't hoisted).
