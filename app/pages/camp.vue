<script setup lang="ts">
import type { Attributes, ConsumableDef, GradeId, ItemDef, ItemInstance, ItemKind, OwnedTalent } from '#shared/types'
import { NO_TALENT_DX_PENALTY } from '#shared/data/progression'
import { TALENTS } from '#shared/data/talents'
import { defOf, gradeOf, itemName } from '#shared/engine/items'
import { comparePower, withItem } from '#shared/engine/power'
import {
  attrTotalFor, hasTalent, loadoutOf, loadoutProblems, newTalentXp, nextAttrStep
} from '#shared/engine/rules'
import { applyShop, fits, itemIn, sellPrice, type GearSlot, type ShopAction, type ShopState } from '#shared/engine/shop'
import { TEST_BONUS_ATTR_POINTS, useGameStore } from '~/stores/game'

// Camp: between battles. Choices here can be undone until Next battle saves them.

const game = useGameStore()
if (!game.character) await navigateTo('/create')
else if (game.screen !== 'camp') await navigateTo('/')

const hero = computed(() => game.character)

// ---------- attributes ----------

/** Saved attributes: the floor, since points placed in earlier camps are permanent. */
const saved = computed<Attributes>(() => ({ ...(hero.value?.base ?? { ST: 0, DX: 0, IQ: 0 }) }))
const attrs = ref<Attributes>({ ...saved.value })
const total = computed(() => attrTotalFor(hero.value?.xp.earned ?? 0) + TEST_BONUS_ATTR_POINTS)
const pointsLeft = computed(() => total.value - attrs.value.ST - attrs.value.DX - attrs.value.IQ)

const pointsText = computed(() => {
  const next = nextAttrStep(hero.value?.xp.earned ?? 0)
  const gain = next ? next.attrTotal - attrTotalFor(hero.value?.xp.earned ?? 0) : 0
  const nextText = next ? ` Next ${gain} point${gain === 1 ? '' : 's'} at ${next.totalXp} XP earned.` : ''
  if (pointsLeft.value > 0) return `${pointsLeft.value} attribute point${pointsLeft.value === 1 ? '' : 's'} to place.${nextText}`
  return `No attribute points to place.${nextText}`
})

/** The points bubble is 57% as tall as the ST / DX / IQ stack, measured so it follows any resize. */
const attrStack = useTemplateRef<HTMLElement>('attrStack')
const stackHeight = ref(0)
let stackObserver: ResizeObserver | undefined
onMounted(() => {
  stackObserver = new ResizeObserver(([entry]) => { stackHeight.value = entry?.contentRect.height ?? 0 })
  if (attrStack.value) stackObserver.observe(attrStack.value)
})
onBeforeUnmount(() => stackObserver?.disconnect())
const pointsSize = computed(() => `${stackHeight.value * 0.57}px`)

// ---------- talents ----------

/** Saved talents are permanent; new ones cost XP as well as IQ. */
const savedTalents = computed<OwnedTalent[]>(() => hero.value?.talents ?? [])
const talents = ref<OwnedTalent[]>(savedTalents.value.map(t => ({ ...t })))
const xpLeft = computed(() =>
  (hero.value?.xp.unspent ?? 0) - newTalentXp(savedTalents.value, talents.value)
)

// ---------- shop ----------

if (game.screen === 'camp') game.openShop()

const tab = ref<'talents' | 'shop'>('talents')

/** Buys and sells so far this visit; saved on Next battle, Undo takes back the last. */
const actions = ref<ShopAction[]>([])
/** A buy waiting for the player to sell or drop what's in the slot. */
const pending = ref<{ uid: string; slot: GearSlot }>()

/** The hero's saved gear and gold, and the shelf as stocked. */
const shopStart = computed<ShopState>(() => {
  const c = hero.value
  return { inventory: c?.inventory ?? [], equipped: c?.equipped ?? { belt: [] }, gold: c?.gold ?? 0, stock: game.shop?.stock ?? [] }
})

/** The shop state after some buys and sells. */
const draft = (list: ShopAction[]): ShopState => {
  return applyShop(shopStart.value, list).state
}

interface Ware {
  uid: string
  def: ItemDef
  grade: GradeId
  name: string
  color: string
  placeholder: boolean
}

const ware = (inst: ItemInstance, def: ItemDef, placeholder = false): Ware =>
  ({ uid: inst.uid, def, grade: inst.grade, name: itemName(inst, def), color: gradeOf(inst).color, placeholder })

/** The hero's gear, gold and the shelf with this visit's buys and sells applied. */
const preview = computed<ShopState>(() => draft(actions.value))

const SLOTS: { slot: GearSlot; label: string }[] = [
  { slot: 'mainHand', label: 'Weapon' },
  { slot: 'offHand', label: 'Off hand' },
  { slot: 'body', label: 'Armor' }
]
const yourGear = computed(() => SLOTS.map(s => {
  const it = itemIn(preview.value, s.slot)
  return { ...s, ware: it ? ware(it.inst, it.def) : undefined }
}))

const forSale = computed(() => preview.value.stock.flatMap(inst => {
  const def = defOf(inst)
  return def ? [ware(inst, def)] : []
}))

/** For sale, split by kind. Potions and scrolls have no items yet, so their sections stay empty. */
const SALE_SECTIONS: { kind: ItemKind; label: string }[] = [
  { kind: 'weapon', label: 'Weapons' },
  { kind: 'armor', label: 'Armor' },
  { kind: 'shield', label: 'Shields' },
  { kind: 'potion', label: 'Potions' },
  { kind: 'scroll', label: 'Scrolls' }
]
const TEST_PLACEHOLDER_ITEMS = true
const PLACEHOLDER_DEFS: Record<'potion' | 'scroll', ConsumableDef> = {
  potion: { id: 'placeholder-potion', name: 'Strength Potion', kind: 'potion', icon: '🧪', weight: 0, cost: 0, actionId: 'useItem', effects: [], target: 'self' },
  scroll: { id: 'placeholder-scroll', name: 'Scroll', kind: 'scroll', icon: '📜', weight: 0, cost: 0, actionId: 'useItem', effects: [], target: 'self' }
}
const placeholderWare = (key: string, kind: 'potion' | 'scroll', grade: GradeId): Ware =>
  ware({ uid: `placeholder-${key}`, defId: PLACEHOLDER_DEFS[kind].id, grade, traits: [] }, PLACEHOLDER_DEFS[kind], true)
const PLACEHOLDER_SHELF: Ware[] = [
  placeholderWare('potion-1', 'potion', 'ordinary'),
  placeholderWare('potion-2', 'potion', 'cool'),
  placeholderWare('potion-3', 'potion', 'bitchin'),
  placeholderWare('scroll-1', 'scroll', 'cool'),
  placeholderWare('scroll-2', 'scroll', 'bitchin'),
  placeholderWare('scroll-3', 'scroll', 'righteous')
]

interface Stack { ware: Ware; count: number }

const PLACEHOLDER_BELT: Record<'potion' | 'scroll', Stack[]> = {
  potion: [
    { ware: placeholderWare('belt-potion-1', 'potion', 'ordinary'), count: 3 },
    { ware: placeholderWare('belt-potion-2', 'potion', 'bitchin'), count: 1 }
  ],
  scroll: [
    { ware: placeholderWare('belt-scroll-1', 'scroll', 'cool'), count: 2 },
    { ware: placeholderWare('belt-scroll-2', 'scroll', 'righteous'), count: 1 }
  ]
}

const BELT_SLOTS = 2
const beltSlots = computed(() => (['potion', 'scroll'] as const).map(kind => {
  const stacks: Stack[] = []
  for (const uid of preview.value.equipped.belt) {
    const inst = preview.value.inventory.find(i => i.uid === uid)
    const def = inst ? defOf(inst) : undefined
    if (!inst || def?.kind !== kind) continue
    const w = ware(inst, def)
    const stack = stacks.find(s => s.ware.name === w.name)
    if (stack) stack.count++
    else stacks.push({ ware: w, count: 1 })
  }
  const shown = TEST_PLACEHOLDER_ITEMS ? PLACEHOLDER_BELT[kind] : stacks
  return {
    kind,
    label: kind === 'potion' ? 'Potions' : 'Scrolls',
    items: Array.from({ length: BELT_SLOTS }, (_, i): Stack | undefined => shown[i])
  }
}))

const hoveredSlot = ref<{ kind: 'potion' | 'scroll'; index: number }>()
const hoveredStack = (b: { kind: 'potion' | 'scroll'; items: (Stack | undefined)[] }) =>
  (hoveredSlot.value?.kind === b.kind ? b.items[hoveredSlot.value.index] : undefined)

const forSaleSections = computed(() => SALE_SECTIONS.map(s => ({
  ...s,
  items: [...forSale.value, ...(TEST_PLACEHOLDER_ITEMS ? PLACEHOLDER_SHELF : [])].filter(w => w.def.kind === s.kind)
})))

/** The shelf card flipped to its back (details and Buy now). One at a time; a bought item leaves the shelf. */
const selectedId = ref<string>()

const select = (w: Ware) => {
  selectedId.value = w.uid
  if (pending.value?.uid !== w.uid) pending.value = undefined
}

const unselect = () => {
  selectedId.value = undefined
  pending.value = undefined
}

/** The shelf section whose drawer is open. All start closed. */
const openSection = ref<ItemKind>()
const isOpen = (kind: ItemKind) => openSection.value === kind

/** Opens a section's drawer and closes any other, or closes it if it's open. Closing turns back a card flipped inside. */
const toggleSection = (kind: ItemKind) => {
  const closing = openSection.value
  openSection.value = closing === kind ? undefined : kind
  if (closing && forSaleSections.value.find(s => s.kind === closing)?.items.some(w => w.uid === selectedId.value)) unselect()
}

const DRAWER_GAP = 10
const shelfCol = useTemplateRef<HTMLElement>('shelfCol')
const shelfMinHeight = ref(0)

const measureShelf = () => {
  const el = shelfCol.value
  const last = el?.lastElementChild
  if (!el || !last || openSection.value) return
  const tallest = Math.max(0, ...[...el.querySelectorAll<HTMLElement>('.drawer')].map(d => d.scrollHeight))
  const closed = last.getBoundingClientRect().bottom - el.getBoundingClientRect().top + parseFloat(getComputedStyle(el).paddingBottom)
  shelfMinHeight.value = Math.ceil(closed + DRAWER_GAP + tallest)
}

watch([shelfCol, forSaleSections], measureShelf, { flush: 'post' })
onMounted(() => document.fonts.ready.then(measureShelf))
const pendingOld = computed(() => {
  const it = pending.value ? itemIn(preview.value, pending.value.slot) : undefined
  return it ? ware(it.inst, it.def) : undefined
})

/** Slots an item can be bought for: a one-handed weapon also fits the off hand with Two Weapons. */
const slotsFor = (def: ItemDef): GearSlot[] => {
  if (def.kind === 'weapon') return def.hands === 1 && hasTalent(talents.value, 'twoWeapons') ? ['mainHand', 'offHand'] : ['mainHand']
  return (['offHand', 'body'] as const).filter(s => fits(def, s))
}

/** Whether the hero can pay, counting the sale of what's in the slot unless it's dropped. */
const canAfford = (def: ItemDef, slot: GearSlot, old: 'sell' | 'drop' = 'sell'): boolean => {
  const current = itemIn(preview.value, slot)
  return preview.value.gold + (current && old === 'sell' ? sellPrice(current.def) : 0) >= def.cost
}

/** Whether the hero can pay for it in any slot it fits. */
const affordable = (def: ItemDef) => slotsFor(def).some(s => canAfford(def, s))

const COMPARE_SLOT: Partial<Record<ItemKind, { slot: GearSlot; empty: string }>> = {
  weapon: { slot: 'mainHand', empty: 'no weapon' },
  armor: { slot: 'body', empty: 'no armor' },
  shield: { slot: 'offHand', empty: 'an empty off hand' }
}

const comparisons = computed(() => {
  const current = loadoutOf(preview.value)
  return Object.fromEntries(forSale.value.flatMap(w => {
    const where = COMPARE_SLOT[w.def.kind]
    if (!where) return []
    const it = itemIn(preview.value, where.slot)
    const mine = it ? ware(it.inst, it.def) : undefined
    const c = comparePower(attrs.value, talents.value, current, withItem(current, w.def))
    return [[w.uid, { ...c, mineName: mine?.name, mineColor: mine?.color, emptyLabel: where.empty, showStops: w.def.kind !== 'weapon' }]]
  }))
})

const buy = (w: Ware, slot: GearSlot) => {
  if (itemIn(preview.value, slot)) pending.value = { uid: w.uid, slot }
  else actions.value.push({ kind: 'buy', uid: w.uid, slot })
}

const finishBuy = (old: 'sell' | 'drop') => {
  const p = pending.value
  if (!p) return
  actions.value.push({ kind: 'buy', uid: p.uid, slot: p.slot, old })
  pending.value = undefined
}

const sell = (slot: GearSlot) => {
  actions.value.push({ kind: 'sell', slot })
  pending.value = undefined
}

const undo = () => {
  actions.value.pop()
  pending.value = undefined
}

const dmg = (d: { dice: number; mod: number }) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

const stats = (def: ItemDef): string => {
  if (def.kind === 'weapon') return `${dmg(def.damage)} · ST ${def.minST} · ${def.hands}H${def.range ? ` · Rng ${def.range}` : ''}`
  if (def.kind === 'armor') return `Stops ${def.hitsStopped} · −${def.dxPenalty} DX · MA ${def.maxMA}`
  if (def.kind === 'shield') return `Stops ${def.hitsStopped}${def.dxPenalty ? ` · −${def.dxPenalty} DX` : ''}`
  return ''
}

const warnings = (def: ItemDef): string[] => {
  const out: string[] = []
  if (def.kind === 'weapon') {
    if (attrs.value.ST < def.minST) out.push(`Needs ST ${def.minST} (you ${attrs.value.ST})`)
    if (!hasTalent(talents.value, def.talent)) out.push(`No ${TALENTS[def.talent]?.name ?? def.talent} talent: −${NO_TALENT_DX_PENALTY} DX`)
    if (def.hands === 2) out.push('Two-handed: no shield')
  }
  if (def.kind === 'shield' && !hasTalent(talents.value, 'shield')) out.push(`No Shield talent: −${NO_TALENT_DX_PENALTY} DX`)
  return out
}

const gearProblems = computed(() => {
  const gear = loadoutOf(preview.value)
  const out = loadoutProblems(attrs.value, gear, talents.value)
  if (!gear.weapon) out.unshift('You need a weapon.')
  return out
})

/** Worth knowing before the fight, but they don't stop Next battle. */
const gearWarnings = computed(() => (loadoutOf(preview.value).armor ? [] : ['No armor: every hit does full damage.']))

/** Temporary, for testing the layout: fake blockers and warnings, shown only; they don't disable Next battle. Set false to undo. */
const TEST_ALERTS = true
const shownProblems = computed(() => [
  ...gearProblems.value,
  ...(TEST_ALERTS ? ['Greataxe needs ST 15', 'Two-Handed Sword is two-handed; no shield', 'A second weapon needs Two Weapons'] : [])
])
/** Warnings the player closed this visit. Blockers can't be closed. */
const dismissed = ref<string[]>([])
const shownWarnings = computed(() => [
  ...gearWarnings.value,
  ...(TEST_ALERTS
    ? [
        `You don't know Mace: −${NO_TALENT_DX_PENALTY} DX with the Mace.`,
        `You don't know Shield: −${NO_TALENT_DX_PENALTY} DX with the Large Shield.`,
        'Shield Expertise does nothing without a shield.',
        'Chainmail limits movement to 6 hexes.'
      ]
    : [])
].filter(w => !dismissed.value.includes(w)))

// ---------- changes waiting for Next battle ----------

interface Change { icon: string; lead: string; item?: Ware; tail?: string }

const shopChanges = computed(() => {
  const out: Change[] = []

  actions.value.forEach((a, i) => {
    const before = draft(actions.value.slice(0, i))
    const it = itemIn(before, a.slot)
    const old = it ? ware(it.inst, it.def) : undefined
    if (old && (a.kind === 'sell' || a.old === 'sell')) out.push({ icon: '💰', lead: 'Sold ', item: old, tail: ` · +${sellPrice(old.def)} gold` })
    if (a.kind === 'sell') return
    if (old && a.old === 'drop') out.push({ icon: '🗑', lead: 'Dropped ', item: old })
    const inst = before.stock.find(s => s.uid === a.uid)
    const def = inst ? defOf(inst) : undefined
    if (inst && def) out.push({ icon: '🛒', lead: 'Bought ', item: ware(inst, def), tail: ` · −${def.cost} gold` })
  })

  return out
})

const nextBattle = () => {
  if (gearProblems.value.length) return
  game.setAttributes(attrs.value)
  game.setTalents(talents.value)
  game.applyShop(actions.value)
  game.leaveCamp()
  navigateTo('/')
}
</script>

<template>
  <div v-if="hero" class="page">
    <h1>Camp</h1>

    <div class="layout">
      <section class="box hero">
        <div class="badge-col col-panel">
          <header class="col-head">
            <h2>Melee Hero</h2>
            <span class="col-line" />
          </header>
          <div class="bubbles">
            <div class="bubble name">
              <span class="bubble-icon">👤</span>
              <span><strong :title="hero.name">{{ hero.name }}</strong></span>
            </div>
            <div class="bubble xp">
              <span class="bubble-icon">⭐</span>
              <span><strong>{{ hero.xp.earned }}</strong><small>XP earned</small></span>
            </div>
            <div class="bubble xp-left">
              <span class="bubble-icon">✨</span>
              <span><strong>{{ xpLeft }}</strong><small>XP unspent</small></span>
            </div>
            <div class="bubble gold">
              <span class="bubble-icon"><GoldCoin class="coin" /></span>
              <span><strong>{{ preview.gold }}</strong><small>Gold</small></span>
            </div>
          </div>
        </div>

        <div class="attr-col col-panel">
          <header class="col-head">
            <h2>Attributes</h2>
            <span class="col-line" />
          </header>
          <div class="attr-area">
            <div class="points" :style="{ width: pointsSize, height: pointsSize }">
              <strong>{{ pointsLeft }}</strong>
              <small>points</small>
            </div>
            <div ref="attrStack">
              <AttributeEditor v-model="attrs" :min="saved" :total="total" gains />
            </div>
          </div>
          <p class="note">{{ pointsText }}</p>
        </div>

        <div class="go-col col-panel">
          <ul v-if="shownProblems.length || shownWarnings.length" class="alerts">
            <li v-for="(p, i) in shownProblems" :key="`p${i}`" class="alert blocker">⚠ {{ p }}</li>
            <li v-for="w in shownWarnings" :key="w" class="alert warning">
              ⚠ {{ w }}
              <button class="dismiss" title="Dismiss" @click="dismissed.push(w)">×</button>
            </li>
          </ul>
          <button :class="['neu-btn', 'battle', { ready: !gearProblems.length }]" :disabled="gearProblems.length > 0" @click="nextBattle">Next battle</button>
        </div>
      </section>

      <section class="box tabbed">
        <div class="tabs">
          <button :class="{ active: tab === 'talents' }" @click="tab = 'talents'">Talents</button>
          <button :class="{ active: tab === 'shop' }" @click="tab = 'shop'">Shop</button>
        </div>

        <div class="tab-body">
          <TalentPicker
            v-if="tab === 'talents'"
            v-model="talents"
            class="col-panel"
            :attrs="attrs"
            :cls="hero.class"
            :locked="savedTalents"
            :attr-points="pointsLeft"
            :xp="xpLeft"
          />

          <div v-else class="shop">
            <div class="gear-col col-panel">
              <header class="col-head">
                <h2>Your gear</h2>
                <span class="col-line" />
              </header>
              <ul class="items">
                <li
                  v-for="g in yourGear"
                  :key="g.slot"
                  :class="['item', { graded: g.ware }]"
                  :style="g.ware ? { '--grade': g.ware.color } : undefined"
                >
                  <div class="item-head">
                    <span class="muted">{{ g.label }}</span>
                    <span class="item-name">
                      <span v-if="g.ware" class="item-icon">{{ g.ware.def.icon }}</span>
                      <strong :class="{ 'grade-text': g.ware }">{{ g.ware ? g.ware.name : 'None' }}</strong>
                    </span>
                  </div>
                  <template v-if="g.ware">
                    <div class="muted">{{ stats(g.ware.def) }}</div>
                    <button class="neu-btn small" @click="sell(g.slot)">Sell for {{ sellPrice(g.ware.def) }} gold</button>
                  </template>
                </li>
                <li v-for="b in beltSlots" :key="b.kind" class="item belt">
                  <div class="belt-main">
                    <span class="muted">{{ b.label }}</span>
                    <div class="slots">
                      <span
                        v-for="(s, i) in b.items"
                        :key="i"
                        :class="['slot', { empty: !s, graded: s }]"
                        :style="s ? { '--grade': s.ware.color } : undefined"
                        :tabindex="s ? 0 : undefined"
                        :title="s ? undefined : 'Empty'"
                        @mouseenter="hoveredSlot = { kind: b.kind, index: i }"
                        @mouseleave="hoveredSlot = undefined"
                        @focus="hoveredSlot = { kind: b.kind, index: i }"
                        @blur="hoveredSlot = undefined"
                      >
                        <template v-if="s">
                          <PotionIcon v-if="s.ware.def.kind === 'potion'" class="slot-potion" />
                          <template v-else>{{ s.ware.def.icon }}</template>
                          <span v-if="s.count > 1" class="slot-count">{{ s.count }}</span>
                        </template>
                      </span>
                    </div>
                  </div>
                  <div class="slot-details">
                    <template v-if="hoveredStack(b)">
                      <strong class="grade-text" :style="{ '--grade': hoveredStack(b)!.ware.color }">{{ hoveredStack(b)!.ware.name }}</strong>
                      <span class="muted">× {{ hoveredStack(b)!.count }}</span>
                      <span v-if="hoveredStack(b)!.ware.placeholder" class="muted">Placeholder. Not for sale yet.</span>
                      <span v-else-if="stats(hoveredStack(b)!.ware.def)" class="muted">{{ stats(hoveredStack(b)!.ware.def) }}</span>
                    </template>
                  </div>
                </li>
              </ul>
              <button v-if="actions.length" class="neu-btn small undo" @click="undo">Undo last buy or sell</button>
            </div>

            <div class="shop-changes col-panel">
              <header class="col-head">
                <h2>Transactions</h2>
                <span class="col-line" />
              </header>
              <ul>
                <li v-for="(c, i) in shopChanges" :key="i">
                  <span class="change-icon">{{ c.icon }}</span>{{ c.lead }}<span
                    class="grade-text"
                    :style="{ '--grade': c.item?.color }"
                  >{{ c.item?.name }}</span>{{ c.tail }}
                </li>
              </ul>
            </div>

            <div ref="shelfCol" class="shelf-col col-panel" :style="{ minHeight: `${shelfMinHeight}px` }">
              <header class="col-head">
                <h2>Camp Shop</h2>
                <span class="col-line" />
              </header>
              <section v-for="sec in forSaleSections" :key="sec.kind" class="sale-section">
                <button
                  :class="['neu-btn', 'drawer-btn', { open: isOpen(sec.kind) }]"
                  :aria-expanded="isOpen(sec.kind)"
                  @click="toggleSection(sec.kind)"
                >
                  <span>{{ sec.label }}</span>
                  <span class="drawer-count">{{ sec.items.length }}</span>
                  <span class="chevron">▾</span>
                </button>

                <div :class="['drawer', { open: isOpen(sec.kind) }]" :inert="!isOpen(sec.kind)">
                  <div class="track">
                    <p v-if="!sec.items.length" class="note">None for sale.</p>
                    <div
                      v-for="w in sec.items"
                      :key="w.uid"
                      :class="['tile', { flipped: selectedId === w.uid }]"
                      :style="{ '--grade': w.color }"
                    >
                      <div class="tile-inner">
                        <button
                          class="tile-face tile-front"
                          :title="w.name"
                          :tabindex="selectedId === w.uid ? -1 : 0"
                          @click="select(w)"
                        >
                          <span v-if="warnings(w.def).length" class="tile-flag" title="Flip the card to see the warnings">⚠</span>
                          <span class="tile-icon">
                            <PotionIcon v-if="w.def.kind === 'potion'" class="potion-icon" />
                            <template v-else>{{ w.def.icon }}</template>
                          </span>
                          <span class="tile-name grade-text">{{ w.name }}</span>
                          <span :class="['price', { poor: !w.placeholder && !affordable(w.def) }]">
                            <GoldCoin class="price-coin" />{{ w.placeholder ? '—' : w.def.cost }}
                          </span>
                        </button>

                        <div
                          class="tile-face tile-back"
                          role="button"
                          :title="`${w.name}: click to flip back`"
                          :tabindex="selectedId === w.uid ? 0 : -1"
                          :inert="selectedId !== w.uid"
                          @click="unselect"
                          @keydown.enter.self="unselect"
                        >
                          <div class="back-head">
                            <strong class="grade-text">{{ w.name }}</strong>
                            <span v-if="!w.placeholder" :class="['price', 'small-price', { poor: !affordable(w.def) }]">
                              <GoldCoin class="price-coin" />{{ w.def.cost }}
                            </span>
                          </div>
                          <p v-if="w.placeholder" class="muted">Placeholder. Not for sale yet.</p>
                          <template v-else>
                            <div class="muted">{{ stats(w.def) }}</div>
                            <div v-for="text in warnings(w.def)" :key="text" class="warn">{{ text }}</div>
                            <div v-if="!affordable(w.def)" class="warn">Not enough gold</div>
                            <PowerCompare v-if="comparisons[w.uid]" v-bind="comparisons[w.uid]!" />
                            <div v-if="pending?.uid === w.uid && pendingOld" class="pending">
                              Your <span class="grade-text" :style="{ '--grade': pendingOld.color }">{{ pendingOld.name }}</span>:
                              <button class="neu-btn small" @click.stop="finishBuy('sell')">Sell for {{ sellPrice(pendingOld.def) }} gold</button>
                              <button class="neu-btn small" :disabled="!canAfford(w.def, pending.slot, 'drop')" @click.stop="finishBuy('drop')">Drop</button>
                              <button class="neu-btn small" @click.stop="pending = undefined">Cancel</button>
                            </div>
                            <div v-else class="buttons back-buy">
                              <button
                                v-for="s in slotsFor(w.def)"
                                :key="s"
                                class="neu-btn small"
                                :disabled="!canAfford(w.def, s)"
                                @click.stop="buy(w, s)"
                              >
                                {{ slotsFor(w.def).length > 1 ? `Buy now: ${s === 'mainHand' ? 'main hand' : 'off hand'}` : 'Buy now' }}
                              </button>
                            </div>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* The page fits the window; the tab body scrolls instead of the page. */
.page {
  max-width: 1400px;
  height: 100vh;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

h1 {
  margin: 0 0 16px;
  font-size: 1.4rem;
}

/* Hero info on top, the Talents and Shop tabs below it, both full width. */
.layout {
  /* Cool slate for both boxes, so the gold, red, green and blue stand out. Everything inside that uses --panel follows it. */
  --panel: #2b2e34;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero {
  flex: none;
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.hero > * {
  flex: 1 1 0;
  min-width: 0;
}

.tabbed {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tab-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, color-mix(in srgb, var(--accent) 55%, var(--muted)) 68.89%, var(--panel)) rgba(0, 0, 0, 0.35);
}

/* On small screens the hero info stacks in one column and the whole page scrolls instead. */
@media (max-width: 900px) {
  .page {
    height: auto;
  }

  .tabbed {
    flex: none;
  }

  .hero {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .hero > * {
    flex: none;
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

/*
 * Name, XP and gold as neumorphic badges of one width, stacked and centered. They only show values,
 * so they're sunk into the surface; raised is kept for things you can press.
 * The icon sits in a flat circle ringed in the badge's own color.
 */
/* Badge column fills the box's full height, with the badges in the middle both ways. */
.badge-col {
  align-self: stretch;
  display: flex;
  flex-direction: column;
}

.bubbles {
  flex: 1;
  justify-content: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

.bubble {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 240px;
  max-width: 100%;
  padding: 5px 15px 5px 5px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

.bubble > span:last-child {
  min-width: 0;
}

.bubble.name {
  --tone: var(--fg);
  padding-right: 45px;
}

.bubble.name > span:last-child {
  flex: 1;
  text-align: center;
}

.bubble.name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.coin {
  width: 22px;
  height: 22px;
}

.attr-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.attr-col .note {
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
}

.attr-col > .col-head {
  align-self: stretch;
}

.sale-section + .sale-section {
  margin-top: 14px;
}

/*
 * Shop section buttons (Weapons, Armor...): raised while their drawer is closed,
 * pressed in while it's open. The chevron turns to match.
 */
.drawer-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 16px;
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.drawer-count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.chevron {
  transition: transform 0.25s;
}

.drawer-btn.open,
.drawer-btn.open:hover:not(:disabled) {
  color: var(--accent);
  transform: none;
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.6), inset -2px -2px 6px rgba(255, 255, 255, 0.05);
}

.drawer-btn.open .chevron {
  transform: rotate(180deg);
}

.drawer {
  interpolate-size: allow-keywords;
  height: 0;
  margin-top: 0;
  overflow: hidden;
  opacity: 0;
  transition: height 0.3s ease, margin-top 0.3s ease, opacity 0.2s;
}

.drawer.open {
  height: auto;
  margin-top: 10px;
  opacity: 1;
}

.track {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 80px;
  padding: 16px;
  border-radius: 18px;
  background: var(--panel);
  box-shadow: inset 4px 4px 10px rgba(0, 0, 0, 0.6), inset -3px -3px 8px rgba(255, 255, 255, 0.05);
  overflow-x: auto;
  scrollbar-width: auto;
  scrollbar-color: color-mix(in srgb, color-mix(in srgb, var(--accent) 55%, var(--muted)) 68.89%, var(--panel)) rgba(0, 0, 0, 0.35);
}

.track::-webkit-scrollbar {
  height: 10px;
}

.track::-webkit-scrollbar-track {
  margin: 0 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
}

.track::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, color-mix(in srgb, var(--accent) 55%, var(--muted)) 68.89%, var(--panel));
}

.track .note {
  margin: 0;
}

/* Attribute points left: a silver bubble to the left of the toggles. Size is set from the stack's height. */
.attr-area {
  align-self: stretch;
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: 16px;
  margin: 30px 30px 30px 20px;
}

/* A recessed well ringed in silver: it only shows a value, so it's sunk like the badges, not raised like a button. */
.points {
  --tone: #c3c9d2;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: radial-gradient(circle at 65% 70%, color-mix(in srgb, var(--tone) 25%, var(--panel)), var(--panel) 75%);
  box-shadow:
    inset 5px 5px 12px rgba(0, 0, 0, 0.55),
    inset -4px -4px 10px rgba(255, 255, 255, 0.05),
    inset 0 0 0 2px color-mix(in srgb, var(--tone) 70%, transparent);
  color: #eef1f5;
  line-height: 1;
}

.points strong {
  font-size: 1.6rem;
  font-variant-numeric: tabular-nums;
}

.points small {
  color: var(--tone);
  font-size: 0.6rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.bubble.xp {
  --tone: #9b87f5;
}

.bubble.xp-left {
  --tone: #4fc3b5;
}

.bubble.xp,
.bubble.xp-left,
.bubble.gold {
  gap: 15px;
}

.bubble.xp > span:last-child,
.bubble.xp-left > span:last-child,
.bubble.gold > span:last-child {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.bubble.gold {
  --tone: var(--accent);
}

.bubble-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--tone) 35%, var(--panel)), var(--panel) 75%);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tone) 70%, transparent);
  font-size: 1.05rem;
}

.bubble strong {
  display: block;
  font-size: 1.05rem;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.bubble small {
  display: block;
  font-size: 0.68rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.note {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

/* Segmented control: a recessed track, with the active tab as a raised pill inside it. */
.tabs {
  align-self: flex-start;
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  padding: 4px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

.tabs button {
  padding: 6px 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  transition: box-shadow 0.15s, color 0.15s;
}

.tabs button:hover {
  color: var(--fg);
}

.tabs .active {
  background: var(--panel);
  color: var(--fg);
  box-shadow: 3px 3px 7px rgba(0, 0, 0, 0.55), -2px -2px 6px rgba(255, 255, 255, 0.06);
}

.shop {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.shop-changes {
  flex: 0 0 183px;
  min-width: 0;
  align-self: stretch;
}

.shop-changes ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.85rem;
  line-height: 1.6;
}

.shop-changes li + li {
  margin-top: 10px;
}

.gear-col {
  flex: 0 0 calc((100% - 32px) / 4 + 32px);
  min-width: 252px;
  align-self: stretch;
}

.col-panel {
  padding: 14px 16px 16px;
  border-radius: 16px;
  background: var(--panel);
  box-shadow: inset 4px 4px 10px rgba(0, 0, 0, 0.55), inset -3px -3px 8px rgba(255, 255, 255, 0.05);
}

.col-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.col-head h2 {
  margin: 0;
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  white-space: nowrap;
}

.col-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, color-mix(in srgb, var(--accent) 45%, var(--muted)), transparent);
}

.shelf-col {
  flex: 1 1 0;
  min-width: 0;
  align-self: stretch;
}

@media (max-width: 900px) {
  .shop {
    flex-direction: column;
    align-items: stretch;
    gap: 175px;
  }

  .shop-changes:not(:has(li)) {
    display: none;
  }

  .gear-col,
  .shop-changes,
  .shelf-col {
    flex: none;
  }
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/*
 * Flip cards: the front shows icon, name and price; clicking it turns the card over to the back,
 * with the details and Buy now. One card is turned at a time. Both faces are raised cards.
 */
.tile {
  flex: none;
  width: 200px;
  height: 250px;
  perspective: 900px;
}

.tile-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  transition: transform 0.45s;
}

.tile.flipped .tile-inner {
  transform: rotateY(180deg);
}

.tile-face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  border: none;
  border-radius: 14px;
  background: color-mix(in srgb, var(--grade) 12%, var(--panel));
  box-shadow:
    4px 4px 9px rgba(0, 0, 0, 0.55),
    -3px -3px 8px rgba(255, 255, 255, 0.06),
    inset 0 0 0 1.5px color-mix(in srgb, var(--grade) 75%, transparent);
  transition: box-shadow 0.15s;
}

.tile-front {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 10px;
}

.tile-front:hover,
.tile-back:hover {
  box-shadow:
    6px 6px 14px rgba(0, 0, 0, 0.6),
    -4px -4px 11px rgba(255, 255, 255, 0.08),
    inset 0 0 0 1.5px color-mix(in srgb, var(--grade) 75%, transparent);
}

/*
 * The back: turned to face the viewer when flipped. Scrolls if the text runs long.
 * A click anywhere on it, except its buttons, turns it back over.
 */
.tile-back {
  cursor: pointer;
  transform: rotateY(180deg);
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  font-size: 0.75rem;
  line-height: 1.3;
  text-align: left;
}

.back-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.82rem;
}

.tile-back .warn {
  font-size: 0.75rem;
}

.small-price {
  padding: 1px 7px 1px 2px;
  gap: 3px;
  font-size: 0.75rem;
}

.small-price .price-coin {
  width: 14px;
  height: 14px;
}

/* Buy now sits at the bottom of the back. */
.back-buy {
  margin-top: auto;
  padding-top: 4px;
}

/* Big icon in a ringed circle. */
.tile-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--muted) 30%, var(--panel)), var(--panel) 75%);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--muted) 70%, transparent);
  font-size: 2.3rem;
}

.potion-icon {
  width: 44px;
  height: 44px;
}

.gear-col .items {
  display: grid;
  grid-auto-rows: 1fr;
}

.item.belt {
  flex-direction: row;
  gap: 14px;
}

.belt-main {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slots {
  display: flex;
  gap: 10px;
}

.slot-details {
  flex: 1;
  min-width: 0;
  contain: size;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
  font-size: 0.8rem;
  line-height: 1.3;
}

.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 50.4px;
  height: 50.4px;
  border-radius: 50%;
  background: var(--panel);
  box-shadow: inset 3px 3px 6px rgba(0, 0, 0, 0.6), inset -2px -2px 5px rgba(255, 255, 255, 0.05);
  font-size: 1.56rem;
}

.slot.graded {
  background: color-mix(in srgb, var(--grade) 35%, var(--panel));
  box-shadow:
    inset 3px 3px 6px rgba(0, 0, 0, 0.6),
    inset -2px -2px 5px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px color-mix(in srgb, var(--grade) 75%, transparent);
}

.slot.empty {
  border: 1.5px dashed color-mix(in srgb, var(--muted) 45%, transparent);
}

.slot-potion {
  width: 40.8px;
  height: 40.8px;
}

.slot-count {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 50%);
  min-width: 18px;
  height: 18px;
  padding: 0 4.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--panel);
  box-shadow:
    2px 2px 4px rgba(0, 0, 0, 0.55),
    -1px -1px 3px rgba(255, 255, 255, 0.06),
    inset 0 0 0 1px color-mix(in srgb, #c3c9d2 70%, transparent);
  color: var(--fg);
  font-size: 0.63rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.tile-back p {
  margin: 0;
}

.tile-name {
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
  text-align: center;
}

/* Corner mark when the item has warnings; they're spelled out on the back. */
.tile-flag {
  position: absolute;
  top: 8px;
  right: 10px;
  color: #e8a33d;
  font-size: 0.9rem;
}

/* Item cards are recessed wells: they only show things. Their buttons are raised. */
.item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--panel);
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
  font-size: 0.85rem;
}

.grade-text {
  color: color-mix(in srgb, var(--grade) 85%, white);
}

.item.graded {
  background: color-mix(in srgb, var(--grade) 10%, var(--panel));
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.55),
    inset -3px -3px 7px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px color-mix(in srgb, var(--grade) 65%, transparent);
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.item-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* Item icon in a flat ringed circle, like the badges and talent icons. */
.item-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--muted) 30%, var(--panel)), var(--panel) 75%);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--muted) 70%, transparent);
  font-size: 0.85rem;
}

/* Price: gold coin and cost in a gold-ringed chip. */
.price {
  flex: none;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px 2px 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, var(--panel));
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent);
  color: var(--accent);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.price-coin {
  width: 18px;
  height: 18px;
}

/* Can't pay for it: the price chip turns red. */
.price.poor {
  color: #e07a6a;
  background: color-mix(in srgb, #e07a6a 10%, var(--panel));
  box-shadow: inset 0 0 0 1.5px rgba(224, 122, 106, 0.7);
}

.item .neu-btn {
  align-self: flex-start;
}

.buttons,
.pending {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.pending {
  margin-top: 4px;
  color: var(--accent);
}

.muted {
  color: var(--muted);
}

.warn {
  color: #e07a6a;
  font-size: 0.8rem;
}

.undo {
  margin-top: 12px;
  width: 100%;
}

/* Next battle column: the rules text, what will be saved, any blockers, then the button. Centered like the others. */
/*
 * contain: size keeps the column's contents from growing the box; min-height fixes the box's height.
 * align-self: stretch fills that height. Only the alerts list shrinks, and it scrolls: about 126px
 * tall with nothing changed, less once changes and Reset all show.
 */
.go-col {
  contain: size;
  min-height: 254px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  text-align: center;
}

.go-col > * {
  flex-shrink: 0;
}

.go-col > .alerts {
  flex-shrink: 1;
  min-height: 0;
  margin-bottom: 25px;
}

/* Thin dark scrollbars, so they don't show as white bars on the dark panel. */
.alerts {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, color-mix(in srgb, var(--accent) 55%, var(--muted)) 68.89%, var(--panel)) rgba(0, 0, 0, 0.35);
}

.change-icon {
  margin-right: 6px;
}

/* Blockers and warnings: sunk like the badges, ringed in red (stops Next battle) or amber (doesn't). The whole list scrolls. */
.alerts {
  list-style: none;
  margin: 0;
  padding: 4px;
  align-self: stretch;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  text-align: left;
}

/* One column on small screens: the column sizes to its content again, and the list gets a cap instead. */
@media (max-width: 900px) {
  .go-col {
    contain: none;
  }

  .alerts {
    max-height: 200px;
  }
}

.alert {
  --ring: 224, 122, 106;
  flex-shrink: 0;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgb(var(--ring));
  font-size: 0.82rem;
}

.alert.warning {
  --ring: 232, 163, 61;
}

/* Close button on a warning: small and raised, since it can be pressed. */
.dismiss {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--panel);
  color: inherit;
  font-size: 0.85rem;
  line-height: 1;
  box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5), -1px -1px 3px rgba(255, 255, 255, 0.06);
}

.dismiss:hover {
  color: #fff;
}

.dismiss:active {
  box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.6), inset -1px -1px 3px rgba(255, 255, 255, 0.05);
}

/* Raised neumorphic buttons: the shadow grows on hover and sinks in when pressed. Disabled ones sit flat. */
.neu-btn {
  border: none;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: 4px 4px 9px rgba(0, 0, 0, 0.55), -3px -3px 8px rgba(255, 255, 255, 0.06);
  transition: box-shadow 0.15s, transform 0.15s, color 0.15s;
}

.neu-btn:hover:not(:disabled) {
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 6px 6px 14px rgba(0, 0, 0, 0.6), -4px -4px 11px rgba(255, 255, 255, 0.08);
}

.neu-btn:active:not(:disabled) {
  transform: none;
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.6), inset -2px -2px 6px rgba(255, 255, 255, 0.05);
}

.neu-btn:disabled {
  box-shadow: none;
}

/* A slightly wide pill, not a fat one. */
.battle {
  margin-top: 4px;
  padding: 9px 44px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.battle.ready {
  color: #e07a6a;
}

/* Small raised buttons: Reset all and the shop's buy, sell, drop, cancel and undo. */
.small {
  padding: 4px 14px;
  font-size: 0.8rem;
}

button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
