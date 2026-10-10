<script setup lang="ts">
import type { Attributes, CharacterClass, OwnedTalent } from '#shared/types'
import { BRANCH_NAMES, useTalents, type TalentRow } from '~/composables/useTalents'

const props = defineProps<{
  modelValue: OwnedTalent[]
  attrs: Attributes
  cls: CharacterClass
  /** Saved talents: shown as permanent, can't be forgotten. */
  locked?: OwnedTalent[]
  /** Attribute points left to spend. */
  attrPoints?: number
  /** XP left to spend (camp). When set, each new talent also costs XP. */
  xp?: number
}>()

const emit = defineEmits<{ 'update:modelValue': [talents: OwnedTalent[]] }>()

const { tree, iqSpent, iqLeft, toggle, prune } = useTalents({
  attrs: () => props.attrs,
  owned: () => props.modelValue,
  cls: () => props.cls,
  locked: () => props.locked,
  attrPoints: () => props.attrPoints,
  xp: () => props.xp
})

const onClick = (row: TalentRow) => {
  if (row.weapons) return
  emit('update:modelValue', toggle(row))
}

/** A saved talent with nothing left to do is sunk in; everything else keeps its state's look. */
const look = (row: TalentRow) => (row.permanent && !row.canAdd ? 'permanent' : row.state)

// Lowering an attribute can disqualify talents; send the pruned list up.
watch(() => props.attrs, () => {
  const kept = prune()
  if (kept.length !== props.modelValue.length || kept.some((t, i) => t.rank !== props.modelValue[i]?.rank)) {
    emit('update:modelValue', kept)
  }
})

const CELL_W = 70
const CELL_H = 104
const PAD = 6
const ART = 52
const LABEL = 34
const FAN_GAP = 90
const CARD_W = 270
const RANGED_GAP = 16

type Pos = TalentRow['node']['pos']

const colsWhere = (keep: (node: TalentRow['node']) => boolean) => tree.value.nodes
  .filter(n => keep(n.node))
  .map(n => n.node.pos.col)

const gaps = computed(() => {
  const isWeapon = (node: TalentRow['node']) => node.category === 'weapon'
  const meleeEnd = Math.max(...colsWhere(n => isWeapon(n) && n.branch !== 'ranged'))
  const rangedStart = Math.min(...colsWhere(n => isWeapon(n) && n.branch === 'ranged'))
  const rangedEnd = Math.max(...colsWhere(n => isWeapon(n) && n.branch === 'ranged'))
  const nextStart = Math.min(...colsWhere(n => n.pos.col > rangedEnd))
  return [{ from: meleeEnd, to: rangedStart }, { from: rangedEnd, to: nextStart }]
})

const colX = (col: number) =>
  col * CELL_W + gaps.value.reduce((sum, g) => sum + Math.min(Math.max((col - g.from) / (g.to - g.from), 0), 1), 0) * RANGED_GAP

const cx = (p: Pos) => colX(p.col) + CELL_W / 2

const rowTops = computed(() => {
  const { links, rows } = tree.value
  const incoming = (to: Pos) => links.filter(l => l.to.col === to.col && l.to.row === to.row).length
  const tops: number[] = []
  let y = 0
  for (let r = 0; r < rows; r++) {
    tops.push(y)
    const fan = links.some(l => l.from.row === r && l.to.row === r + 1 && incoming(l.to) > 2)
    y += CELL_H + (fan ? FAN_GAP : 0)
  }
  return tops
})

const top = (row: number) => rowTops.value[row] ?? 0
const exitY = (p: Pos) => top(p.row) + PAD + ART + LABEL
const entryY = (p: Pos) => top(p.row) + PAD - 2

const width = computed(() => colX(tree.value.cols - 1) + CELL_W)
const height = computed(() => top(tree.value.rows - 1) + CELL_H)

const cellStyle = (row: TalentRow) => ({
  left: `${colX(row.node.pos.col)}px`,
  top: `${top(row.node.pos.row)}px`,
  width: `${CELL_W}px`,
  height: `${CELL_H}px`
})

const linkPaths = computed(() => tree.value.links.map(l => ({
  key: l.key,
  met: l.met,
  d: `M ${cx(l.from)} ${exitY(l.from)} L ${cx(l.to)} ${entryY(l.to)}`
})))

interface Spark { seg: number; t: number; off: number; born: number; life: number; size: number; peak: number; star: boolean }

const glitter = useTemplateRef<HTMLCanvasElement>('glitter')

const metSegments = computed(() => tree.value.links.filter(l => l.met).map(l => {
  const x1 = cx(l.from)
  const y1 = exitY(l.from)
  const x2 = cx(l.to)
  const y2 = entryY(l.to)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  return { x1, y1, dx: (x2 - x1) / len, dy: (y2 - y1) / len, len }
}))

let sparks: Spark[] = []
let frame = 0
let last = 0

watch(metSegments, () => { sparks = [] })

const patch = (seg: number, t: number, now: number) => {
  const a = Math.sin(t * 0.05 + now * 0.0013 + seg * 1.7)
  const b = Math.sin(t * 0.023 - now * 0.0009 + seg * 0.6)
  const c = Math.sin(t * 0.11 + now * 0.0031 + seg * 2.3)
  return Math.max(0, (a + b + c) / 3)
}

const spawn = (now: number, dt: number) => {
  metSegments.value.forEach((s, seg) => {
    const tries = s.len * 0.025 * dt / 16.7
    const n = Math.floor(tries) + (Math.random() < tries % 1 ? 1 : 0)
    for (let k = 0; k < n; k++) {
      const t = Math.random() * s.len
      if (Math.random() > patch(seg, t, now) ** 1.5) continue
      const size = 0.5 + Math.random() ** 3 * 1.6
      sparks.push({
        seg, t, off: (Math.random() - 0.5) * 4.5, born: now,
        life: 90 + Math.random() * 320, size, peak: 0.55 + Math.random() * 0.45,
        star: size > 1.4 && Math.random() < 0.5
      })
    }
  })
}

const drawSpark = (ctx: CanvasRenderingContext2D, p: Spark, now: number) => {
  const s = metSegments.value[p.seg]
  if (!s) return
  const a = p.peak * Math.sin(Math.PI * Math.min(1, (now - p.born) / p.life))
  const x = s.x1 + s.dx * p.t - s.dy * p.off
  const y = s.y1 + s.dy * p.t + s.dx * p.off
  const r = p.size * 3.2
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r)
  glow.addColorStop(0, `rgba(255, 253, 244, ${a})`)
  glow.addColorStop(0.35, `rgba(240, 232, 255, ${a * 0.45})`)
  glow.addColorStop(1, 'rgba(220, 210, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  if (!p.star) return
  const f = p.size * 5
  ctx.strokeStyle = `rgba(255, 253, 244, ${a * 0.55})`
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(x - f, y)
  ctx.lineTo(x + f, y)
  ctx.moveTo(x, y - f * 1.4)
  ctx.lineTo(x, y + f * 1.4)
  ctx.stroke()
}

const tick = (now: number) => {
  frame = requestAnimationFrame(tick)
  const canvas = glitter.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return
  const dt = Math.min(50, last ? now - last : 16.7)
  last = now
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(width.value * dpr)
  const h = Math.round(height.value * dpr)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width.value, height.value)
  spawn(now, dt)
  sparks = sparks.filter(p => now - p.born < p.life)
  ctx.globalCompositeOperation = 'lighter'
  for (const p of sparks) drawSpark(ctx, p, now)
  ctx.globalCompositeOperation = 'source-over'
}

onMounted(() => { frame = requestAnimationFrame(tick) })
onBeforeUnmount(() => cancelAnimationFrame(frame))

const badge = (row: TalentRow) => {
  if (row.weapons) return row.rank ? String(row.rank) : ''
  return row.node.maxRanks > 1 ? `${row.rank}/${row.node.maxRanks}` : ''
}

const weaponTitle = (w: TalentRow) =>
  [w.action, ...w.needs.filter(n => !n.met).map(n => `Needs ${n.text}.`), ...w.blocks].filter(Boolean).join(' ')

const cardId = useId()
const card = useTemplateRef<HTMLElement>('card')
const hoverKey = ref<string>()
const focusKey = ref<string>()
let leaveTimer: ReturnType<typeof setTimeout> | undefined

const enter = (key: string) => {
  clearTimeout(leaveTimer)
  hoverKey.value = key
}

const leave = () => {
  clearTimeout(leaveTimer)
  leaveTimer = setTimeout(() => { hoverKey.value = undefined }, 150)
}

const hold = () => clearTimeout(leaveTimer)

const focusNode = (key: string, e: FocusEvent) => {
  if ((e.target as HTMLElement).matches(':focus-visible')) focusKey.value = key
}

const blur = (e: FocusEvent) => {
  if (!card.value?.contains(e.relatedTarget as Node | null)) focusKey.value = undefined
}

onBeforeUnmount(() => clearTimeout(leaveTimer))

const shown = computed(() => {
  const key = hoverKey.value ?? focusKey.value
  return key ? tree.value.nodes.find(n => n.key === key) : undefined
})

const cardStyle = computed(() => {
  const row = shown.value
  if (!row) return {}
  const { col, row: r } = row.node.pos
  const x = colX(col)
  const leftSide = x + CELL_W - 6 + CARD_W > width.value
  const fromTop = r < tree.value.rows / 2
  const y = top(r)
  return {
    ...(leftSide ? { right: `${width.value - x - 6}px` } : { left: `${x + CELL_W - 6}px` }),
    ...(fromTop ? { top: `${y}px` } : { bottom: `${height.value - y - CELL_H}px` }),
    width: `${CARD_W}px`,
    maxHeight: `${fromTop ? height.value - y : y + CELL_H}px`
  }
})
</script>

<template>
  <div>
    <header class="col-head">
      <h2>Talents</h2>
      <span class="col-line" />
    </header>
    <div class="head">
      <div>
        <p class="note">
          Talents are skills. Each costs IQ.
          Gold ring = learned, raised = can learn now, faded = not yet.
          Hover a talent for details.
        </p>
      </div>
      <div class="iq">
        <span class="iq-badge"><strong>{{ attrs.IQ }}</strong><small>IQ</small></span>
        <span class="iq-badge"><strong>{{ iqSpent }}</strong><small>Spent</small></span>
        <span class="iq-badge"><strong>{{ iqLeft }}</strong><small>Left</small></span>
      </div>
    </div>

    <div class="scroll">
      <div class="tree-wrap" :style="{ width: `${width}px` }">
        <div class="heads">
          <span
            v-for="h in tree.headers"
            :key="h.col"
            class="head-label"
            :style="{ left: `${colX(h.col)}px`, width: `${h.span * CELL_W}px` }"
          >{{ h.name }}</span>
        </div>

        <div class="tree" :style="{ height: `${height}px` }">
          <svg class="lines" :width="width" :height="height" aria-hidden="true">
            <g v-for="l in linkPaths" :key="l.key" :class="{ met: l.met }">
              <path class="base" :d="l.d" />
              <path v-if="l.met" class="gloss" :d="l.d" />
            </g>
          </svg>
          <canvas ref="glitter" class="glitter" :style="{ width: `${width}px`, height: `${height}px` }" aria-hidden="true" />

          <div v-for="row in tree.nodes" :key="row.key" class="cell" :style="cellStyle(row)">
            <button
              :class="['node', look(row), { group: row.weapons, active: shown?.key === row.key }]"
              :aria-describedby="shown?.key === row.key ? cardId : undefined"
              @click="onClick(row)"
              @mouseenter="enter(row.key)"
              @mouseleave="leave"
              @focus="focusNode(row.key, $event)"
              @blur="blur"
            >
              <span class="art">
                <span class="glyph">{{ row.node.icon }}</span>
                <span v-if="badge(row)" class="badge">{{ badge(row) }}</span>
              </span>
              <span class="name">{{ row.label }}</span>
            </button>
          </div>

          <div
            v-if="shown"
            :id="cardId"
            ref="card"
            :class="['card', look(shown), { interactive: shown.weapons?.length }]"
            :style="cardStyle"
            @mouseenter="hold"
            @mouseleave="leave"
            @focusout="blur"
          >
            <div class="card-head">
              <span class="art small">{{ shown.node.icon }}</span>
              <div class="card-title">
                <strong>{{ shown.label }}</strong>
                <small>
                  {{ BRANCH_NAMES[shown.node.branch] ?? shown.node.branch }}<template v-if="shown.node.maxRanks > 1"> · rank {{ shown.rank }} of {{ shown.node.maxRanks }}</template>
                </small>
              </div>
            </div>
            <p class="desc">{{ shown.node.description }}</p>
            <p v-if="shown.weaponLine" class="desc">{{ shown.weaponLine }}</p>
            <p><span class="label">Cost</span>{{ shown.cost }}</p>
            <div>
              <span class="label">Needs</span>
              <ul class="needs">
                <li v-for="n in shown.needs" :key="n.text" :class="{ met: n.met }">{{ n.met ? '✓' : '✗' }} {{ n.text }}</li>
              </ul>
            </div>
            <div v-if="shown.weapons?.length" class="weapons">
              <button
                v-for="w in shown.weapons"
                :key="w.key"
                :class="['weapon', look(w)]"
                :title="weaponTitle(w)"
                @click="onClick(w)"
              >
                {{ w.label }}
              </button>
            </div>
            <p v-if="shown.action" class="action">{{ shown.action }}</p>
            <p v-for="b in shown.blocks" :key="b" class="block">{{ b }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
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
  margin-right: 200px;
  height: 1px;
  background: linear-gradient(to right, color-mix(in srgb, var(--accent) 45%, var(--muted)), transparent);
}

h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 6px;
}

/* Neumorphic, like the camp's top box: raised = can be pressed, sunk in = only shows something. */

/* Recessed label pill in muted gold, matching ATTRIBUTES at camp. */
.pill-label {
  display: inline-block;
  margin: 0 0 10px;
  padding: 6px 18px;
  border-radius: 999px;
  background: var(--panel);
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

/* IQ total, spent and left as recessed badges ringed in IQ blue. */
.iq {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  position: relative;
  top: -26px;
  margin-right: 12px;
}

.iq-badge {
  display: grid;
  place-content: center;
  justify-items: center;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--panel);
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.55),
    inset -3px -3px 7px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px rgba(90, 158, 240, 0.6);
  line-height: 1.1;
}

.iq-badge strong {
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.iq-badge small {
  font-size: 0.62rem;
  color: #5a9ef0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.note {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}

.scroll {
  margin-top: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.tree-wrap {
  margin: 0 auto;
}

.heads {
  position: relative;
  height: 22px;
}

.head-label {
  position: absolute;
  top: 0;
  text-align: center;
  white-space: nowrap;
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tree {
  position: relative;
}

.lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.lines path {
  fill: none;
}

.lines .base {
  stroke: color-mix(in srgb, var(--muted) 45%, transparent);
  stroke-width: 2;
}

.lines .met .base {
  stroke: #9b87f5;
  stroke-width: 4.66;
}

.lines .gloss {
  stroke: rgb(255 255 255 / 0.75);
  stroke-width: 1.3;
}

.glitter {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

.cell {
  position: absolute;
  display: flex;
  justify-content: center;
}

.node {
  --ring: var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 66px;
  height: fit-content;
  padding: 6px 0 0;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.node.available {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.node.owned,
.node.permanent {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.art {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ring) 30%, var(--panel)), var(--panel) 75%);
  box-shadow:
    4px 4px 9px rgba(0, 0, 0, 0.55),
    -3px -3px 8px rgba(255, 255, 255, 0.06);
  font-size: 1.5rem;
  transition: box-shadow 0.15s, transform 0.15s;
}

.node.owned .art,
.node.permanent .art {
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.6),
    inset -2px -2px 6px rgba(255, 255, 255, 0.05),
    inset 0 0 0 2px var(--ring);
}

.node.locked .art {
  background: var(--panel);
  box-shadow: none;
}

.name {
  max-height: 2.4em;
  overflow: hidden;
  color: var(--fg);
  font-size: 0.7rem;
  line-height: 1.2;
  text-align: center;
}

.node.available:not(.group):hover .art {
  transform: translateY(-1px);
  box-shadow:
    6px 6px 14px rgba(0, 0, 0, 0.6),
    -4px -4px 11px rgba(255, 255, 255, 0.08);
}

.node.available:not(.group):active .art {
  transform: none;
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.6),
    inset -2px -2px 6px rgba(255, 255, 255, 0.05);
}

.node.permanent,
.node.locked,
.node.group {
  cursor: default;
}

.node.locked .glyph,
.node.locked .name {
  opacity: 0.45;
}

.node.active .art {
  outline: 2px solid color-mix(in srgb, var(--ring) 70%, transparent);
  outline-offset: 3px;
}

.badge {
  position: absolute;
  right: -6px;
  bottom: -4px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.55), inset 0 0 0 1px var(--ring);
  color: var(--fg);
  font-size: 0.62rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.card {
  --ring: color-mix(in srgb, var(--muted) 50%, transparent);
  position: absolute;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--panel);
  box-shadow:
    6px 6px 14px rgba(0, 0, 0, 0.6),
    -3px -3px 8px rgba(255, 255, 255, 0.06),
    inset 0 0 0 1.5px var(--ring);
  font-size: 0.78rem;
  line-height: 1.35;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.card:not(.interactive) {
  pointer-events: none;
}

.card.available {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.card.owned,
.card.permanent {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.card p {
  margin: 0;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.art.small {
  width: 36px;
  height: 36px;
  font-size: 1.1rem;
}

.card.owned .art,
.card.permanent .art {
  box-shadow:
    4px 4px 9px rgba(0, 0, 0, 0.55),
    -3px -3px 8px rgba(255, 255, 255, 0.06),
    inset 0 0 0 2px var(--ring);
}

.card-title {
  display: grid;
}

.card-title strong {
  font-size: 0.9rem;
}

.card-title small {
  color: var(--muted);
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.desc {
  color: var(--fg);
  opacity: 0.85;
}

.label {
  margin-right: 6px;
  color: var(--muted);
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.needs {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: grid;
  gap: 2px;
}

.needs li {
  color: #e07a6a;
}

.needs li.met {
  color: #9cc46a;
}

.weapons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.weapon {
  --ring: var(--border);
  padding: 2px 10px;
  border: none;
  border-radius: 999px;
  background: var(--panel);
  box-shadow:
    3px 3px 7px rgba(0, 0, 0, 0.55),
    -2px -2px 6px rgba(255, 255, 255, 0.06),
    inset 0 0 0 1.5px var(--ring);
  font-size: 0.72rem;
}

.weapon.available {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
}

.weapon.owned,
.weapon.permanent {
  --ring: color-mix(in srgb, var(--accent) 75%, transparent);
  background: color-mix(in srgb, #7fa64e 18%, var(--panel));
  box-shadow:
    inset 2px 2px 5px rgba(0, 0, 0, 0.6),
    inset -2px -2px 5px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px var(--ring);
}

.weapon.permanent,
.weapon.locked {
  cursor: default;
}

.weapon.locked {
  color: color-mix(in srgb, var(--fg) 45%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--ring);
}

.action {
  color: var(--accent);
}

.card.owned .action,
.card.permanent .action {
  color: #cfe3b5;
}

.block {
  color: var(--muted);
}
</style>
