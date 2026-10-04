<script setup lang="ts">
import type { DiceExpr, Facing, Hex, HexKey, OwnedTalent, Side, TalentCategory } from '#shared/types'
import { BASE_MA } from '#shared/data/progression'
import { TALENTS } from '#shared/data/talents'
import { generateMap } from '#shared/engine/mapgen'
import { buildOpponent, randomSpec } from '#shared/engine/opponents'
import { findPath, lineOfSight, reachable } from '#shared/engine/pathfinding'
import { adjustedDx, loadoutOf, movementAllowance } from '#shared/engine/rules'
import { DIRECTIONS, fromKey, hexEquals, hexKey } from '#shared/utils/hex'
import { randomSeed } from '#shared/utils/rng'
import { useGameStore } from '~/stores/game'

// Battle screen. Movement only until the combat engine exists.

const game = useGameStore()
const character = game.character
if (!character) await navigateTo('/create')

const seed = randomSeed()
const map = generateMap({ seed, biome: 'forest', width: 15, height: 11 })

interface Token {
  uid: string
  name: string
  side: Side
  pos: Hex
  facing: Facing
  st: number
  stMax: number
  dx: number
  adjDx: number
  dxParts: { label: string; value: number }[]
  iq: number
  ma: number
  weapon: string
  armor: string
  talents: OwnedTalent[]
}

const FACING_NAMES = ['NE', 'SE', 'S', 'SW', 'NW', 'N'] as const
const at = (key: HexKey | undefined) => fromKey(key!)
const dmg = (d: DiceExpr) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

function heroToken(): Token {
  const c = character!
  const gear = loadoutOf(c)
  const adj = adjustedDx(c.base, c.talents, gear)
  return {
    uid: 'hero', name: c.name, side: 'player', pos: at(map.spawns.player[1]), facing: 1,
    st: c.base.ST, stMax: c.base.ST, dx: c.base.DX, adjDx: adj.value, dxParts: adj.parts, iq: c.base.IQ,
    ma: movementAllowance(BASE_MA, gear),
    weapon: gear.weapon ? `${gear.weapon.name} ${dmg(gear.weapon.damage)}` : 'Unarmed',
    armor: gear.armor?.name ?? 'No armor',
    talents: c.talents
  }
}

/** Two opponents near the hero's level. Placeholder until matchmaking. */
function opponentTokens(): Token[] {
  return [0, 2].map((spawn, i) => {
    const o = buildOpponent(randomSpec(seed + i + 1, { attrPoints: i * 2, xp: i * 500 }))
    const attack = o.weapon ? `${o.weapon.name} ${dmg(o.weapon.damage)}` : o.naturalWeapons.map(w => `${w.name} ${dmg(w.damage)}`).join(', ')
    return {
      uid: `enemy${i}`, name: o.name, side: 'enemy', pos: at(map.spawns.enemy[spawn]), facing: 4,
      st: o.attrs.ST, stMax: o.attrs.ST, dx: o.attrs.DX, adjDx: o.adjDx, dxParts: [], iq: o.attrs.IQ, ma: o.ma,
      weapon: attack, armor: o.armor?.name ?? '', talents: o.talents
    }
  })
}

const units = ref<Token[]>(character ? [heroToken(), ...opponentTokens()] : [])

const CHIP_COLORS: Record<TalentCategory, string> = {
  attack: '#a3402f', debuff: '#7a4a9c', defense: '#2f5f9c', movement: '#3f8a4a', utility: '#7a6a3a', weapon: '#6a5a4a'
}
const chips = (owned: OwnedTalent[]) => owned.map(t => {
  const node = TALENTS[t.id]!
  const suffix = t.weaponTalent ? ` (${TALENTS[t.weaponTalent]?.name})` : t.rank > 1 ? ` ${t.rank}` : ''
  return { key: `${t.id}:${t.weaponTalent ?? ''}`, label: `${node.icon} ${node.name}${suffix}`, title: node.description, color: CHIP_COLORS[node.category] }
})
const hovered = ref<Hex | null>(null)
const tab = ref<'action' | 'log'>('action')
const log = ref<{ time: string; text: string }[]>([])

function addLog(text: string) {
  log.value.push({ time: new Date().toLocaleTimeString(), text })
}
addLog(`Map generated: seed ${seed}, forest, ${map.attempts} attempt(s)`)
for (const o of units.value.filter(u => u.side === 'enemy')) {
  addLog(`Opponent: ${o.name} ST ${o.st} DX ${o.dx} IQ ${o.iq} adjDX ${o.adjDx} MA ${o.ma}; ${o.weapon}; talents ${o.talents.map(t => t.id).join(', ') || 'none'}`)
}

const hero = computed(() => units.value.find(u => u.side === 'player')!)
const opponents = computed(() => units.value.filter(u => u.side === 'enemy'))
const unitAt = (h: Hex) => units.value.find(u => hexEquals(u.pos, h))

const obstructions = computed(() => ({
  occupied: new Set(units.value.filter(u => u !== hero.value).map(u => hexKey(u.pos)))
}))

const reach = computed(() => {
  const cost = reachable(map, hero.value.pos, hero.value.ma, obstructions.value)
  return new Set([...cost.keys()].filter(k => k !== hexKey(hero.value.pos)))
})

const path = computed(() =>
  hovered.value && reach.value.has(hexKey(hovered.value))
    ? findPath(map, hero.value.pos, hovered.value, obstructions.value) ?? undefined
    : undefined
)

const sight = computed(() => {
  const to = hovered.value
  if (!to || hexEquals(to, hero.value.pos)) return undefined
  return { from: hero.value.pos, to, clear: lineOfSight(map, hero.value.pos, to, obstructions.value) }
})

function abandon() {
  if (!confirm(`Abandon ${hero.value.name}? This is permanent: they go to the graveyard as abandoned.`)) return
  game.abandonRun()
  navigateTo('/create')
}

function onSelect(h: Hex) {
  if (unitAt(h)) return
  const route = reach.value.has(hexKey(h)) ? findPath(map, hero.value.pos, h, obstructions.value) : null
  if (!route || route.length < 2) return
  const [prev, last] = route.slice(-2) as [Hex, Hex]
  const step = { q: last.q - prev.q, r: last.r - prev.r }
  hero.value.facing = DIRECTIONS.findIndex(d => hexEquals(d, step)) as Facing
  hero.value.pos = h
  addLog(`${hero.value.name} moved to ${hexKey(h)} (${route.length - 1} hexes), facing ${FACING_NAMES[hero.value.facing]}`)
}
</script>

<template>
  <div v-if="units.length" class="page">
    <div class="layout">
      <aside class="side">
        <button class="abandon" @click="abandon">Abandon hero</button>

        <section class="box">
          <h2>Dice</h2>
          <p class="muted">No rolls yet</p>
        </section>

        <section class="box">
          <h2>Hero</h2>
          <div class="hero">
            <div class="portrait">⚔</div>
            <dl>
              <dt>Name</dt><dd>{{ hero.name }}</dd>
              <dt>ST</dt><dd>{{ hero.st }} / {{ hero.stMax }}</dd>
              <dt>DX</dt><dd>{{ hero.dx }}</dd>
              <dt>adj DX</dt>
              <dd :title="hero.dxParts.map(p => `${p.label} ${p.value}`).join('\n')" class="hint">{{ hero.adjDx }}</dd>
              <dt>IQ</dt><dd>{{ hero.iq }}</dd>
              <dt>MA</dt><dd>{{ hero.ma }}</dd>
            </dl>
          </div>
          <p class="gear">{{ hero.weapon }} · {{ hero.armor }}</p>
          <div class="chips">
            <span v-for="c in chips(hero.talents)" :key="c.key" class="chip" :title="c.title" :style="{ background: c.color }">{{ c.label }}</span>
          </div>
        </section>

        <section class="box">
          <h2>Opponents</h2>
          <div class="tiles">
            <div v-for="o in opponents" :key="o.uid" class="tile">
              <div class="portrait small">👹</div>
              <div class="tile-name">{{ o.name }}</div>
              <div class="bar-st"><span :style="{ width: `${(o.st / o.stMax) * 100}%` }" /></div>
              <div class="tile-stats">ST {{ o.st }}/{{ o.stMax }} · adjDX {{ o.adjDx }} · MA {{ o.ma }}</div>
              <div class="tile-stats">⚔ {{ o.weapon }}<template v-if="o.armor"> · {{ o.armor }}</template></div>
              <div class="chips">
                <span v-for="c in chips(o.talents)" :key="c.key" class="chip" :title="c.title" :style="{ background: c.color }">{{ c.label }}</span>
              </div>
            </div>
          </div>
        </section>
      </aside>

      <section class="board">
        <HexCanvas
          :map="map"
          :units="units"
          selected-uid="hero"
          :reach="reach"
          :path="path"
          :sight="sight"
          @hover="hovered = $event"
          @select="onSelect"
        />
      </section>

      <section class="box bottom">
        <div class="tabs">
          <button :class="{ active: tab === 'action' }" @click="tab = 'action'">Action</button>
          <button :class="{ active: tab === 'log' }" @click="tab = 'log'">Log</button>
        </div>
        <p v-if="tab === 'action'" class="tab-body">{{ hero.name }}: choose a lit hex to move to.</p>
        <ol v-else class="tab-body log">
          <li v-for="(entry, i) in log" :key="i"><span class="muted">{{ entry.time }}</span> {{ entry.text }}</li>
        </ol>
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

.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 800px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.side {
  display: grid;
  gap: 16px;
}

.box,
.board {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}

.box h2 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 0 0 8px;
}

.bottom {
  grid-column: 1 / -1;
}

.hero {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 12px;
}

.portrait {
  width: 72px;
  height: 72px;
  display: grid;
  place-items: center;
  font-size: 2rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.portrait.small {
  width: 40px;
  height: 40px;
  font-size: 1.2rem;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  margin: 0;
  font-size: 0.9rem;
}

dt {
  color: var(--muted);
}

dd {
  margin: 0;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.gear {
  font-size: 0.85rem;
  margin: 8px 0 0;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.tile {
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.tile-name {
  font-weight: 600;
  font-size: 0.9rem;
}

.tile-stats {
  font-size: 0.75rem;
  color: var(--muted);
}

.bar-st {
  width: 100%;
  height: 6px;
  background: var(--bg);
  border-radius: 3px;
  overflow: hidden;
}

.bar-st span {
  display: block;
  height: 100%;
  background: #b8382c;
}

.tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tabs .active {
  border-color: var(--accent);
}

.tab-body {
  min-height: 80px;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
  font-size: 0.9rem;
}

.log {
  padding-left: 0;
  list-style: none;
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}

.abandon {
  width: 100%;
  padding: 6px;
  color: #e07a6a;
}

.abandon:hover {
  border-color: #e07a6a;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.chip {
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 10px;
  color: #fff;
  cursor: help;
}

.hint {
  cursor: help;
  text-decoration: underline dotted;
}

.muted {
  color: var(--muted);
}
</style>
