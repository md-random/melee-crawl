<script setup lang="ts">
import type { AttrKey, Attributes, OwnedTalent } from '#shared/types'
import { ITEMS, armors, shields, weapons } from '#shared/data/items'
import { BASE_MA, PROGRESSION } from '#shared/data/progression'
import { adjustedDx, attrPointsLeft, createCharacter, creationProblems, hasTalent, movementAllowance } from '#shared/engine/rules'
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

function bump(key: AttrKey, by: 1 | -1) {
  const next = attrs.value[key] + by
  if (next < PROGRESSION.minAttr || (by > 0 && pointsLeft.value <= 0)) return
  // TalentPicker prunes talents that no longer qualify and emits the new list.
  attrs.value = { ...attrs.value, [key]: next }
}

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

const knowsTwoWeapons = computed(() => hasTalent(talents.value, 'twoWeapons'))
const offWeaponOff = computed(() => gear.value.weapon?.hands === 2)
const shieldOff = computed(() => gear.value.weapon?.hands === 2 || !!gear.value.offWeapon)

watch(() => gear.value.weapon?.hands, (hands) => {
  if (hands === 2) {
    shieldId.value = ''
    offWeaponId.value = ''
  }
})
watch(knowsTwoWeapons, (knows) => {
  if (!knows) offWeaponId.value = ''
})
watch(offWeaponId, (id) => {
  if (id) shieldId.value = ''
})

/** Why a one-handed weapon can't be the second weapon, or '' if it can. */
function offWeaponBlock(w: { minST: number; talent: string }): string {
  if (attrs.value.ST < w.minST) return 'too heavy'
  if (!hasTalent(talents.value, w.talent)) return 'no talent'
  return ''
}

const dmg = (d: { dice: number; mod: number }) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

// Same talent logic as the picker, for the equipment notes and IQ line.
const { iqSpent, talentNote } = useTalents({ attrs, owned: talents, cls: 'hero', attrPoints: pointsLeft })

const weaponText = computed(() => {
  const w = gear.value.weapon
  if (!w) return []
  const lines = [`${w.name}: ${dmg(w.damage)} damage, ${w.hands === 2 ? 'two hands' : 'one hand'}${w.range ? `, range ${w.range}` : ''}. Needs ST ${w.minST}.`]
  if (attrs.value.ST < w.minST) lines.push(`Your ST is ${attrs.value.ST}: raise ST by ${w.minST - attrs.value.ST} or pick a lighter weapon.`)
  lines.push(talentNote(w.talent, 'it'))
  return lines
})

const offWeaponText = computed(() => {
  const w = gear.value.offWeapon
  if (gear.value.weapon?.hands === 2) return ['Your weapon needs both hands, so no second weapon.']
  if (!w) return ['No second weapon.']
  return [`${w.name}: ${dmg(w.damage)} damage, one hand. Needs ST ${w.minST}.`]
})

const armorText = computed(() => {
  const a = gear.value.armor
  if (!a) return [`No armor: every hit does full damage, but you move the full ${BASE_MA} hexes.`]
  return [`${a.name} stops ${a.hitsStopped} damage from every hit, costs ${a.dxPenalty} DX and limits movement to ${a.maxMA} hexes.`]
})

const shieldText = computed(() => {
  const s = gear.value.shield
  if (gear.value.weapon?.hands === 2) return ['Your weapon needs both hands, so no shield.']
  if (gear.value.offWeapon) return ['You hold a second weapon, so no shield.']
  if (!s) return ['No shield.']
  return [
    `${s.name} stops ${s.hitsStopped} more damage from every hit${s.dxPenalty ? ` and costs ${s.dxPenalty} DX` : ''}.`,
    talentNote('shield', 'a shield')
  ]
})

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
        <div v-for="key in (['ST', 'DX', 'IQ'] as const)" :key="key" class="attr">
          <div class="attr-row">
            <strong>{{ key }}</strong>
            <button :disabled="attrs[key] <= PROGRESSION.minAttr" @click="bump(key, -1)">−</button>
            <span class="val">{{ attrs[key] }}</span>
            <button :disabled="pointsLeft <= 0" @click="bump(key, 1)">+</button>
          </div>
          <p class="note">{{ attrText[key] }}</p>
        </div>

        <h2>Equipment</h2>
        <label class="field">
          Weapon
          <select v-model="weaponId">
            <option v-for="w in weapons()" :key="w.id" :value="w.id" :disabled="attrs.ST < w.minST">
              {{ w.name }} · {{ dmg(w.damage) }} · ST {{ w.minST }}{{ attrs.ST < w.minST ? ' (too heavy)' : '' }}
            </option>
          </select>
        </label>
        <p v-for="l in weaponText" :key="l" class="note">{{ l }}</p>

        <template v-if="knowsTwoWeapons">
          <label :class="['field', { off: offWeaponOff }]">
            Second weapon
            <select v-model="offWeaponId" :disabled="offWeaponOff">
              <option value="">None</option>
              <option
                v-for="w in weapons().filter(w => w.hands === 1)"
                :key="w.id"
                :value="w.id"
                :disabled="!!offWeaponBlock(w)"
              >
                {{ w.name }} · {{ dmg(w.damage) }} · ST {{ w.minST }}{{ offWeaponBlock(w) ? ` (${offWeaponBlock(w)})` : '' }}
              </option>
            </select>
          </label>
          <p v-for="l in offWeaponText" :key="l" :class="['note', { blocked: offWeaponOff }]">{{ l }}</p>
        </template>

        <label class="field">
          Armor
          <select v-model="armorId">
            <option value="">None</option>
            <option v-for="a in armors()" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </label>
        <p v-for="l in armorText" :key="l" class="note">{{ l }}</p>

        <label :class="['field', { off: shieldOff }]">
          Shield
          <select v-model="shieldId" :disabled="shieldOff">
            <option value="">None</option>
            <option v-for="s in shields()" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <p v-for="l in shieldText" :key="l" :class="['note', { blocked: shieldOff }]">{{ l }}</p>

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

.attr {
  margin-bottom: 8px;
}

.attr-row {
  display: grid;
  grid-template-columns: 28px 32px 32px 32px;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}

.val {
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.field {
  display: grid;
  gap: 4px;
  margin: 10px 0 4px;
  font-size: 0.9rem;
}

.field.off {
  color: var(--muted);
  text-decoration: line-through;
}

.field.off select {
  opacity: 0.35;
  cursor: not-allowed;
}

.note.blocked {
  color: var(--accent);
  font-weight: 600;
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
