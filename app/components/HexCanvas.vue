<script setup lang="ts">
import type { GeneratedMap, Hex, HexKey, MapState, OverlayId, Side, Terrain, Unit } from '#shared/types'
import { DIRECTIONS, fromKey, hexCorners, hexKey, hexToPixel, pixelToHex, type Point } from '#shared/utils/hex'

type UnitToken =Pick<Unit, 'uid' | 'name' | 'side' | 'pos' | 'facing'>

const props = defineProps<{
  map: GeneratedMap
  showCoords?: boolean
  overlays?: MapState['overlays']
  units?: UnitToken[]
  selectedUid?: string
  /** Hexes the selected unit can move to. */
  reach?: ReadonlySet<HexKey>
  /** Hexes holding valid targets for the chosen action. */
  targets?: ReadonlySet<HexKey>
  path?: Hex[]
  sight?: { from: Hex; to: Hex; clear: boolean }
}>()

const emit = defineEmits<{
  hover: [hex: Hex | null]
  select: [hex: Hex]
}>()

const SQRT3 = Math.sqrt(3)

const COLORS = {
  ground: '#e2d3ac',
  grid: '#8b7650',
  water: '#7fa6c2',
  wave: '#4f7c9c',
  canopy: '#4f6d35',
  canopyEdge: '#2f4520',
  canopyLight: '#6d8c4a',
  pine: '#2f5428',
  pineLight: '#467236',
  trunk: '#7a5230',
  trunkEdge: '#4a3018',
  rock: '#9a958b',
  rockMid: '#7f7a71',
  rockDark: '#625e57',
  rockEdge: '#3f3c37',
  rockLight: '#bdb8ad',
  hover: '#f2c14e',
  coords: 'rgba(60, 45, 25, 0.55)',
  reach: 'rgba(242, 193, 78, 0.28)',
  target: '#e0402f',
  path: '#f2c14e',
  sightClear: 'rgba(40, 160, 70, 0.9)',
  sightBlocked: 'rgba(200, 40, 30, 0.9)',
  tokenEdge: '#1b1712',
  tokenText: '#fff'
} as const

const SPAWN_TINT: Record<Side, string> = {
  player: 'rgba(40, 100, 220, 0.42)',
  enemy: 'rgba(210, 50, 40, 0.38)'
}

const TOKEN_FILL: Record<Side, string> = {
  player: '#2f63c4',
  enemy: '#b8382c'
}

const OVERLAY_FILL: Record<OverlayId, string> = {
  fire: 'rgba(235, 110, 30, 0.6)',
  wall: 'rgba(90, 70, 55, 0.9)',
  shadow: 'rgba(15, 10, 20, 0.6)',
  web: 'rgba(240, 240, 240, 0.25)'
}

const wrap = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const cssSize = ref({ w: 0, h: 0 })
const hovered = ref<HexKey | null>(null)

// Terrain is drawn once to an offscreen layer; per-frame draws only add highlights.
let terrainLayer: HTMLCanvasElement | null = null
let hexSize = 0
let origin: Point = { x: 0, y: 0 }

/** Map extent in units of hex size 1. */
const bounds = computed(() => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const key of props.map.hexes.keys()) {
    const p = hexToPixel(fromKey(key), 1)
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { minX: minX - 1, minY: minY - SQRT3 / 2, w: maxX - minX + 2, h: maxY - minY + SQRT3 }
})

const spawnSide = computed(() => {
  const out = new Map<HexKey, Side>()
  for (const side of ['player', 'enemy'] as const) {
    for (const key of props.map.spawns[side]) out.set(key, side)
  }
  return out
})

const center = (key: HexKey): Point => {
  const p = hexToPixel(fromKey(key), hexSize)
  return { x: p.x + origin.x, y: p.y + origin.y }
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
}

/** Cheap stable per-hex jitter so boulders/trees don't all look identical. */
function jitter(key: HexKey, i: number): number {
  let h = 2166136261
  for (const c of key + i) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return ((h >>> 0) % 1000) / 1000
}

// Trees are drawn side-on (trunk + crown) so they read as trees at a glance.

function treeBase(ctx: CanvasRenderingContext2D, c: Point, s: number, trunkTop: number, trunkW: number) {
  ctx.beginPath()
  ctx.ellipse(c.x, c.y + s * 0.7, s * 0.42, s * 0.11, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(40, 30, 15, 0.3)'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(c.x - trunkW * 0.5, c.y + s * trunkTop)
  ctx.lineTo(c.x + trunkW * 0.5, c.y + s * trunkTop)
  ctx.lineTo(c.x + trunkW * 0.8, c.y + s * 0.7)
  ctx.lineTo(c.x - trunkW * 0.8, c.y + s * 0.7)
  ctx.closePath()
  ctx.fillStyle = COLORS.trunk
  ctx.fill()
  ctx.strokeStyle = COLORS.trunkEdge
  ctx.lineWidth = Math.max(1, s * 0.04)
  ctx.stroke()
}

/** Broadleaf: trunk with a round, lumpy crown. */
function drawLeafy(ctx: CanvasRenderingContext2D, key: HexKey, c: Point, s: number) {
  treeBase(ctx, c, s, 0.05, s * 0.16)
  const k = 0.9 + jitter(key, 1) * 0.15
  const lobes = [
    [-0.3, -0.12, 0.3], [0.3, -0.12, 0.3], [0, -0.42, 0.34],
    [-0.17, -0.32, 0.27], [0.18, -0.32, 0.27], [0, -0.1, 0.32]
  ].map(([dx, dy, r]) => ({ x: c.x + s * dx! * k, y: c.y + s * dy! * k, r: s * r! * k }))
  ctx.fillStyle = COLORS.canopyEdge
  for (const l of lobes) {
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r + s * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = COLORS.canopy
  for (const l of lobes) {
    ctx.beginPath()
    ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = COLORS.canopyLight
  for (const l of lobes.slice(2, 4)) {
    ctx.beginPath()
    ctx.arc(l.x - l.r * 0.25, l.y - l.r * 0.25, l.r * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Conifer: short trunk under three stacked triangles. */
function drawPine(ctx: CanvasRenderingContext2D, key: HexKey, c: Point, s: number) {
  treeBase(ctx, c, s, 0.45, s * 0.14)
  const k = 0.92 + jitter(key, 1) * 0.12
  const tiers: [base: number, half: number, apex: number][] = [
    [0.5, 0.5, -0.1],
    [0.2, 0.4, -0.45],
    [-0.12, 0.3, -0.8]
  ]
  for (const [base, half, apex] of tiers) {
    const left = { x: c.x - s * half * k, y: c.y + s * base }
    const right = { x: c.x + s * half * k, y: c.y + s * base }
    const top = { x: c.x, y: c.y + s * apex * k }
    tracePath(ctx, [left, right, top])
    ctx.fillStyle = COLORS.pine
    ctx.fill()
    ctx.strokeStyle = COLORS.canopyEdge
    ctx.lineWidth = Math.max(1, s * 0.05)
    ctx.lineJoin = 'round'
    ctx.stroke()
    // Lit left half.
    tracePath(ctx, [left, { x: c.x, y: c.y + s * base }, top])
    ctx.fillStyle = COLORS.pineLight
    ctx.fill()
  }
}

function drawTerrain(ctx: CanvasRenderingContext2D, key: HexKey, terrain: Terrain) {
  const c = center(key)
  const s = hexSize

  if (terrain === 'water') {
    tracePath(ctx, hexCorners(c, s))
    ctx.fillStyle = COLORS.water
    ctx.fill()
    ctx.strokeStyle = COLORS.wave
    ctx.lineWidth = Math.max(1, s * 0.06)
    for (const dy of [-0.22, 0.18]) {
      ctx.beginPath()
      ctx.moveTo(c.x - s * 0.45, c.y + s * dy)
      ctx.quadraticCurveTo(c.x - s * 0.22, c.y + s * (dy - 0.14), c.x, c.y + s * dy)
      ctx.quadraticCurveTo(c.x + s * 0.22, c.y + s * (dy + 0.14), c.x + s * 0.45, c.y + s * dy)
      ctx.stroke()
    }
  } else if (terrain === 'tree') {
    if (jitter(key, 0) < 0.4) drawPine(ctx, key, c, s)
    else drawLeafy(ctx, key, c, s)
  } else if (terrain === 'boulder') {
    drawBoulder(ctx, key, c, s, 1)
    if (jitter(key, 20) > 0.5) drawBoulder(ctx, `${key}b`, { x: c.x + s * 0.5, y: c.y + s * 0.42 }, s, 0.35)
  }
}

// Boulder vertices (unit size): outer silhouette 0–7, inner facet corners 8–11.
const ROCK_VERTS: [number, number][] = [
  [-0.6, 0.5], [-0.66, 0.12], [-0.48, -0.22], [-0.18, -0.42], [0.16, -0.44], [0.46, -0.24],
  [0.63, 0.1], [0.58, 0.5], [-0.24, -0.06], [0.22, -0.08], [-0.12, 0.5], [0.3, 0.5]
]
const ROCK_FACES: { verts: number[]; color: keyof typeof COLORS }[] = [
  { verts: [2, 3, 4, 5, 9, 8], color: 'rockLight' },
  { verts: [0, 1, 2, 8, 10], color: 'rock' },
  { verts: [10, 8, 9, 11], color: 'rockMid' },
  { verts: [11, 9, 5, 6, 7], color: 'rockDark' }
]

/** Side-on faceted boulder, lit from the top left. */
function drawBoulder(ctx: CanvasRenderingContext2D, key: string, c: Point, s: number, scale: number) {
  const k = s * scale * (0.9 + jitter(key as HexKey, 0) * 0.15)
  const pts = ROCK_VERTS.map(([dx, dy], i) => ({
    x: c.x + k * (dx + (jitter(key as HexKey, i + 1) - 0.5) * 0.12),
    y: c.y + k * (dy + (i === 0 || i === 7 || i === 10 || i === 11 ? 0 : (jitter(key as HexKey, i + 30) - 0.5) * 0.12))
  }))

  ctx.beginPath()
  ctx.ellipse(c.x + k * 0.05, c.y + k * 0.52, k * 0.72, k * 0.14, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(40, 30, 15, 0.32)'
  ctx.fill()

  ctx.lineJoin = 'round'
  for (const face of ROCK_FACES) {
    tracePath(ctx, face.verts.map(i => pts[i]!))
    ctx.fillStyle = COLORS[face.color]
    ctx.fill()
    ctx.strokeStyle = COLORS.rockEdge
    ctx.lineWidth = Math.max(0.5, k * 0.025)
    ctx.stroke()
  }

  tracePath(ctx, pts.slice(0, 8))
  ctx.strokeStyle = COLORS.rockEdge
  ctx.lineWidth = Math.max(1, k * 0.06)
  ctx.stroke()
}

function renderTerrainLayer(dpr: number) {
  const { w, h } = cssSize.value
  terrainLayer ??= document.createElement('canvas')
  terrainLayer.width = Math.round(w * dpr)
  terrainLayer.height = Math.round(h * dpr)
  const ctx = terrainLayer.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  for (const [key, terrain] of props.map.hexes) {
    const c = center(key)
    tracePath(ctx, hexCorners(c, hexSize))
    ctx.fillStyle = COLORS.ground
    ctx.fill()
    const side = spawnSide.value.get(key)
    if (side) {
      ctx.fillStyle = SPAWN_TINT[side]
      ctx.fill()
    }
    if (terrain !== 'clear') drawTerrain(ctx, key, terrain)
  }

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = Math.max(1, hexSize * 0.035)
  for (const key of props.map.hexes.keys()) {
    tracePath(ctx, hexCorners(center(key), hexSize))
    ctx.stroke()
  }

  if (props.showCoords && hexSize > 14) {
    ctx.fillStyle = COLORS.coords
    ctx.font = `${Math.round(hexSize * 0.28)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    for (const key of props.map.hexes.keys()) {
      const c = center(key)
      ctx.fillText(key, c.x, c.y + hexSize * 0.72)
    }
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, key: HexKey, overlay: OverlayId) {
  const c = center(key)
  const s = hexSize
  tracePath(ctx, hexCorners(c, s))
  ctx.fillStyle = OVERLAY_FILL[overlay]
  ctx.fill()
  ctx.lineWidth = Math.max(1, s * 0.05)
  if (overlay === 'fire') {
    ctx.fillStyle = 'rgba(255, 200, 60, 0.9)'
    for (const dx of [-0.25, 0, 0.25]) {
      const h = s * (0.35 + jitter(key, dx * 8 + 3) * 0.2)
      ctx.beginPath()
      ctx.moveTo(c.x + s * (dx - 0.1), c.y + s * 0.3)
      ctx.quadraticCurveTo(c.x + s * dx, c.y + s * 0.3 - h * 2, c.x + s * (dx + 0.1), c.y + s * 0.3)
      ctx.fill()
    }
  } else if (overlay === 'wall') {
    ctx.strokeStyle = 'rgba(30, 20, 15, 0.8)'
    for (const dy of [-0.3, 0, 0.3]) {
      ctx.beginPath()
      ctx.moveTo(c.x - s * 0.7, c.y + s * dy)
      ctx.lineTo(c.x + s * 0.7, c.y + s * dy)
      ctx.stroke()
    }
  } else if (overlay === 'web') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    for (const p of hexCorners(c, s * 0.8)) {
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
    }
    for (const r of [0.3, 0.6]) {
      tracePath(ctx, hexCorners(c, s * r))
      ctx.stroke()
    }
  }
}

function drawToken(ctx: CanvasRenderingContext2D, unit: UnitToken) {
  const c = center(hexKey(unit.pos))
  const s = hexSize
  const r = s * 0.55

  // Facing: a wedge pointing at the front hex.
  const d = hexToPixel(DIRECTIONS[unit.facing]!, 1)
  const len = Math.hypot(d.x, d.y)
  const ux = d.x / len
  const uy = d.y / len
  ctx.beginPath()
  ctx.moveTo(c.x + ux * r * 1.45, c.y + uy * r * 1.45)
  ctx.lineTo(c.x - uy * r * 0.6, c.y + ux * r * 0.6)
  ctx.lineTo(c.x + uy * r * 0.6, c.y - ux * r * 0.6)
  ctx.closePath()
  ctx.fillStyle = TOKEN_FILL[unit.side]
  ctx.fill()
  ctx.strokeStyle = COLORS.tokenEdge
  ctx.lineWidth = Math.max(1, s * 0.05)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
  ctx.fillStyle = TOKEN_FILL[unit.side]
  ctx.fill()
  ctx.lineWidth = unit.uid === props.selectedUid ? Math.max(2, s * 0.12) : Math.max(1, s * 0.06)
  ctx.strokeStyle = unit.uid === props.selectedUid ? COLORS.hover : COLORS.tokenEdge
  ctx.stroke()

  ctx.fillStyle = COLORS.tokenText
  ctx.font = `600 ${Math.round(s * 0.5)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(unit.name.charAt(0).toUpperCase(), c.x, c.y + s * 0.02)
  ctx.textBaseline = 'alphabetic'
}

function draw() {
  const el = canvas.value
  if (!el || !terrainLayer) return
  const dpr = window.devicePixelRatio || 1
  const ctx = el.getContext('2d')!
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.drawImage(terrainLayer, 0, 0)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  for (const [key, { overlay }] of Object.entries(props.overlays ?? {})) drawOverlay(ctx, key as HexKey, overlay)

  if (props.reach) {
    ctx.fillStyle = COLORS.reach
    for (const key of props.reach) {
      tracePath(ctx, hexCorners(center(key), hexSize * 0.9))
      ctx.fill()
    }
  }

  if (props.targets) {
    ctx.strokeStyle = COLORS.target
    ctx.lineWidth = Math.max(2, hexSize * 0.1)
    for (const key of props.targets) {
      tracePath(ctx, hexCorners(center(key), hexSize * 0.85))
      ctx.stroke()
    }
  }

  if (props.path && props.path.length > 1) {
    ctx.beginPath()
    props.path.forEach((h, i) => {
      const p = center(hexKey(h))
      if (i) ctx.lineTo(p.x, p.y)
      else ctx.moveTo(p.x, p.y)
    })
    ctx.strokeStyle = COLORS.path
    ctx.lineWidth = Math.max(2, hexSize * 0.12)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  if (props.sight) {
    const a = center(hexKey(props.sight.from))
    const b = center(hexKey(props.sight.to))
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.setLineDash([hexSize * 0.25, hexSize * 0.18])
    ctx.strokeStyle = props.sight.clear ? COLORS.sightClear : COLORS.sightBlocked
    ctx.lineWidth = Math.max(1.5, hexSize * 0.06)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (hovered.value) {
    tracePath(ctx, hexCorners(center(hovered.value), hexSize * 0.92))
    ctx.strokeStyle = COLORS.hover
    ctx.lineWidth = Math.max(2, hexSize * 0.09)
    ctx.stroke()
  }

  for (const unit of props.units ?? []) drawToken(ctx, unit)
}

/** Fit the whole map inside the container width and the visible viewport height. */
function relayout() {
  const el = canvas.value
  if (!el || !wrap.value) return
  const availW = wrap.value.clientWidth
  const availH = Math.max(240, window.innerHeight - wrap.value.getBoundingClientRect().top - 32)
  if (availW === 0) return

  const b = bounds.value
  hexSize = Math.min(availW / b.w, availH / b.h)
  const w = Math.floor(b.w * hexSize)
  const h = Math.floor(b.h * hexSize)
  cssSize.value = { w, h }
  origin = { x: -b.minX * hexSize, y: -b.minY * hexSize }

  const dpr = window.devicePixelRatio || 1
  el.width = Math.round(w * dpr)
  el.height = Math.round(h * dpr)
  el.style.width = `${w}px`
  el.style.height = `${h}px`
  renderTerrainLayer(dpr)
  draw()
}

function hexAt(e: PointerEvent): Hex | null {
  const rect = canvas.value!.getBoundingClientRect()
  const h = pixelToHex({ x: e.clientX - rect.left - origin.x, y: e.clientY - rect.top - origin.y }, hexSize)
  return props.map.hexes.has(hexKey(h)) ? h : null
}

function onMove(e: PointerEvent) {
  const h = hexAt(e)
  const key = h ? hexKey(h) : null
  if (key === hovered.value) return
  hovered.value = key
  emit('hover', h)
  draw()
}

function onLeave() {
  hovered.value = null
  emit('hover', null)
  draw()
}

function onClick(e: PointerEvent) {
  const h = hexAt(e)
  if (h) emit('select', h)
}

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(relayout)
  observer.observe(wrap.value!)
  window.addEventListener('resize', relayout)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', relayout)
})

watch(() => [props.map, props.showCoords], relayout)
watch(() => [props.overlays, props.units, props.selectedUid, props.reach, props.targets, props.path, props.sight], draw, { deep: true })
</script>

<template>
  <div ref="wrap" class="hex-canvas">
    <canvas
      ref="canvas"
      @pointermove="onMove"
      @pointerleave="onLeave"
      @click="onClick"
    />
  </div>
</template>

<style scoped>
.hex-canvas {
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

canvas {
  display: block;
  margin: 0 auto;
  cursor: crosshair;
  touch-action: none;
}
</style>
