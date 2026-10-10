<script setup lang="ts">
import type { ArmorDef, Attributes, CharacterClass, OwnedTalent, ShieldDef, WeaponDef } from '#shared/types'
import { BASE_MA } from '#shared/data/progression'
import { hasTalent } from '#shared/engine/rules'
import { useTalents } from '~/composables/useTalents'

// Weapon, second weapon, armor and shield, for hero creation and camp.
// Each option is a value (item id in the creator, carried item uid at camp) and its item.

const props = defineProps<{
  weapons: { value: string; def: WeaponDef }[]
  armors: { value: string; def: ArmorDef }[]
  shields: { value: string; def: ShieldDef }[]
  attrs: Attributes
  talents: OwnedTalent[]
  cls: CharacterClass
  /** Attribute points left to spend, for "raise IQ" advice. */
  attrPoints?: number
  /** XP left to spend (camp), for talent prices. */
  xp?: number
  /** Options are single items, so the main weapon can't also be the second one. */
  distinct?: boolean
}>()

const weapon = defineModel<string>('weapon', { required: true })
const offWeapon = defineModel<string>('offWeapon', { default: '' })
const armor = defineModel<string>('armor', { default: '' })
const shield = defineModel<string>('shield', { default: '' })

const find = <T,>(list: { value: string; def: T }[], value: string) => list.find(o => o.value === value)?.def

const gear = computed(() => ({
  weapon: find(props.weapons, weapon.value),
  offWeapon: find(props.weapons, offWeapon.value),
  armor: find(props.armors, armor.value),
  shield: find(props.shields, shield.value)
}))

const knowsTwoWeapons = computed(() => hasTalent(props.talents, 'twoWeapons'))
const offWeaponOff = computed(() => gear.value.weapon?.hands === 2)
const shieldOff = computed(() => gear.value.weapon?.hands === 2 || !!gear.value.offWeapon)
const offWeaponOptions = computed(() =>
  props.weapons.filter(o => o.def.hands === 1 && !(props.distinct && o.value === weapon.value))
)

watch(() => gear.value.weapon?.hands, (hands) => {
  if (hands === 2) {
    shield.value = ''
    offWeapon.value = ''
  }
})
watch(knowsTwoWeapons, (knows) => {
  if (!knows) offWeapon.value = ''
})
watch(offWeapon, (id) => {
  if (id) shield.value = ''
})
watch(weapon, (id) => {
  if (props.distinct && id === offWeapon.value) offWeapon.value = ''
})

/** Why a one-handed weapon can't be the second weapon, or '' if it can. */
const offWeaponBlock = (w: { minST: number; talent: string }): string => {
  if (props.attrs.ST < w.minST) return 'too heavy'
  if (!hasTalent(props.talents, w.talent)) return 'no talent'
  return ''
}

const dmg = (d: { dice: number; mod: number }) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

// Same talent logic as the picker, for the notes.
const { talentNote } = useTalents({
  attrs: () => props.attrs,
  owned: () => props.talents,
  cls: () => props.cls,
  attrPoints: () => props.attrPoints,
  xp: () => props.xp
})

const weaponText = computed(() => {
  const w = gear.value.weapon
  if (!w) return []
  const lines = [`${w.name}: ${dmg(w.damage)} damage, ${w.hands === 2 ? 'two hands' : 'one hand'}${w.range ? `, range ${w.range}` : ''}. Needs ST ${w.minST}.`]
  if (props.attrs.ST < w.minST) lines.push(`Your ST is ${props.attrs.ST}: raise ST by ${w.minST - props.attrs.ST} or pick a lighter weapon.`)
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
</script>

<template>
  <div>
    <label class="field">
      Weapon
      <select v-model="weapon">
        <option v-for="w in weapons" :key="w.value" :value="w.value" :disabled="attrs.ST < w.def.minST">
          {{ w.def.name }} · {{ dmg(w.def.damage) }} · ST {{ w.def.minST }}{{ attrs.ST < w.def.minST ? ' (too heavy)' : '' }}
        </option>
      </select>
    </label>
    <p v-for="l in weaponText" :key="l" class="note">{{ l }}</p>

    <template v-if="knowsTwoWeapons">
      <label :class="['field', { off: offWeaponOff }]">
        Second weapon
        <select v-model="offWeapon" :disabled="offWeaponOff">
          <option value="">None</option>
          <option
            v-for="w in offWeaponOptions"
            :key="w.value"
            :value="w.value"
            :disabled="!!offWeaponBlock(w.def)"
          >
            {{ w.def.name }} · {{ dmg(w.def.damage) }} · ST {{ w.def.minST }}{{ offWeaponBlock(w.def) ? ` (${offWeaponBlock(w.def)})` : '' }}
          </option>
        </select>
      </label>
      <p v-for="l in offWeaponText" :key="l" :class="['note', { blocked: offWeaponOff }]">{{ l }}</p>
    </template>

    <label class="field">
      Armor
      <select v-model="armor">
        <option value="">None</option>
        <option v-for="a in armors" :key="a.value" :value="a.value">{{ a.def.name }}</option>
      </select>
    </label>
    <p v-for="l in armorText" :key="l" class="note">{{ l }}</p>

    <label :class="['field', { off: shieldOff }]">
      Shield
      <select v-model="shield" :disabled="shieldOff">
        <option value="">None</option>
        <option v-for="s in shields" :key="s.value" :value="s.value">{{ s.def.name }}</option>
      </select>
    </label>
    <p v-for="l in shieldText" :key="l" :class="['note', { blocked: shieldOff }]">{{ l }}</p>
  </div>
</template>

<style scoped>
.note {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
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
</style>
