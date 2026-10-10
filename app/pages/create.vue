<script setup lang="ts">
import type { AttrKey, Attributes, OwnedTalent } from '#shared/types'
import { ITEMS, armors, shields, weapons } from '#shared/data/items'
import { BASE_MA, PROGRESSION } from '#shared/data/progression'
import { adjustedDx, attrPointsLeft, createCharacter, creationProblems, movementAllowance } from '#shared/engine/rules'
import { useTalents } from '~/composables/useTalents'
import { useGameStore } from '~/stores/game'

const game = useGameStore()

const name = ref('')
const attrs = ref<Attributes>({ ST: 8 + 3, DX: 8 + 3, IQ: 8 + 2 })
const talents = ref<OwnedTalent[]>([])
const weaponId = ref('shortsword')
const offWeaponId = ref('')
const armorId = ref('')
const shieldId = ref('')

const EXTRA_POINTS = PROGRESSION.startingAttrPoints - 3 * PROGRESSION.minAttr
const pointsLeft = computed(() => attrPointsLeft(attrs.value))
// Lowering an attribute: TalentPicker prunes talents that no longer qualify and emits the new list.
const MIN_ATTRS: Attributes = { ST: PROGRESSION.minAttr, DX: PROGRESSION.minAttr, IQ: PROGRESSION.minAttr }

const attrText = computed<Record<AttrKey, string>>(() => {
  const strongest = weapons().filter(w => w.minST <= attrs.value.ST).sort((a, b) => b.minST - a.minST)[0]
  return {
    ST: `Strength is also your hit points: you can take ${attrs.value.ST} damage. Strongest weapon you can lift: ${strongest?.name ?? 'none'}.`,
    DX: `Dexterity. To hit, you roll 3 dice and need your adjusted DX or less. Armor and missing talents lower it.`,
    IQ: `Intelligence pays for talents: ${iqSpent.value} of ${attrs.value.IQ} spent. Some talents also need a minimum IQ.`
  }
})

const pointsText = computed(() =>
  pointsLeft.value > 0
    ? `Every attribute starts at ${PROGRESSION.minAttr}. You have ${pointsLeft.value} of ${EXTRA_POINTS} extra points left to add.`
    : pointsLeft.value === 0
      ? `All ${EXTRA_POINTS} extra points are spent. Lower one attribute to raise another.`
      : `${-pointsLeft.value} points too many. Lower an attribute.`
)

// ---------- equipment ----------

const gear = computed(() => {
  const w = ITEMS[weaponId.value]
  const o = ITEMS[offWeaponId.value]
  const a = ITEMS[armorId.value]
  const s = ITEMS[shieldId.value]
  return {
    weapon: w?.kind === 'weapon' ? w : undefined,
    offWeapon: o?.kind === 'weapon' ? o : undefined,
    armor: a?.kind === 'armor' ? a : undefined,
    shield: s?.kind === 'shield' ? s : undefined
  }
})

/** Every item in the game, by id: hero creation picks from all of them. */
const WEAPON_OPTIONS = weapons().map(def => ({ value: def.id, def }))
const ARMOR_OPTIONS = armors().map(def => ({ value: def.id, def }))
const SHIELD_OPTIONS = shields().map(def => ({ value: def.id, def }))

// Same talent logic as the picker, for the IQ line.
const { iqSpent } = useTalents({ attrs, owned: talents, cls: 'hero', attrPoints: pointsLeft })

const adj = computed(() => adjustedDx(attrs.value, talents.value, gear.value))
const ma = computed(() => movementAllowance(BASE_MA, gear.value))
const hitsStopped = computed(() => (gear.value.armor?.hitsStopped ?? 0) + (gear.value.shield?.hitsStopped ?? 0))

/** Chance that 3d6 rolls ≤ target. */
function hitChance(target: number): number {
  let n = 0
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) if (a + b + c <= target) n++
  return Math.round((n / 216) * 100)
}

const summaryText = computed(() => {
  const formula = adj.value.parts.map((p, i) => (i === 0 ? `DX ${p.value}` : `${p.value} ${p.label}`)).join(' ').replace(/ -/g, ' − ')
  const lines = [
    `Hit points: ${attrs.value.ST}. You fall when you've taken that much damage.`,
    `Adjusted DX ${adj.value.value} = ${formula}. You hit about ${hitChance(adj.value.value)}% of the time.`,
    `You move up to ${ma.value} hexes a turn.`,
    hitsStopped.value ? `Each hit on you does ${hitsStopped.value} less damage.` : 'Nothing reduces damage you take.'
  ]
  if (adj.value.value < 9) lines.push('That hit chance is low. Learn the missing talents, raise DX, or wear lighter armor.')
  return lines
})

const input = computed(() => ({
  name: name.value,
  attrs: attrs.value,
  talents: talents.value,
  weaponId: weaponId.value,
  offWeaponId: offWeaponId.value || undefined,
  armorId: armorId.value || undefined,
  shieldId: shieldId.value || undefined
}))
const problems = computed(() => creationProblems(input.value))

function start() {
  if (problems.value.length) return
  game.startRun(createCharacter(input.value, () => crypto.randomUUID()))
  navigateTo('/')
}
</script>

<template>
  <div class="page">
    <h1>Create your hero</h1>

    <div class="layout">
      <section class="box">
        <h2>Name</h2>
        <input v-model="name" class="name" maxlength="24" placeholder="Grimwald">

        <h2>Attributes</h2>
        <p class="note">{{ pointsText }}</p>
        <AttributeEditor v-model="attrs" :min="MIN_ATTRS" :total="PROGRESSION.startingAttrPoints" :notes="attrText" />

        <h2>Equipment</h2>
        <GearPicker
          v-model:weapon="weaponId"
          v-model:offWeapon="offWeaponId"
          v-model:armor="armorId"
          v-model:shield="shieldId"
          :weapons="WEAPON_OPTIONS"
          :armors="ARMOR_OPTIONS"
          :shields="SHIELD_OPTIONS"
          :attrs="attrs"
          :talents="talents"
          cls="hero"
          :attr-points="pointsLeft"
        />

        <h2>Your hero</h2>
        <p v-for="l in summaryText" :key="l" class="note strong">{{ l }}</p>

        <ul v-if="problems.length" class="problems">
          <li v-for="p in problems" :key="p">{{ p }}</li>
        </ul>
        <button class="start" :disabled="problems.length > 0" @click="start">Start</button>
      </section>

      <section class="box">
        <TalentPicker v-model="talents" :attrs="attrs" cls="hero" :attr-points="pointsLeft" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}

h1 {
  margin: 0 0 16px;
  font-size: 1.4rem;
}

.layout {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.box {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 18px 0 6px;
}

h2:first-child {
  margin-top: 0;
}

.note {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

.note.strong {
  color: var(--fg);
}

.name {
  width: 100%;
}

.problems {
  color: #e07a6a;
  font-size: 0.85rem;
  padding-left: 18px;
}

.start {
  width: 100%;
  margin-top: 12px;
  padding: 8px;
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
