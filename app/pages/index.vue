<script setup lang="ts">
import type { DiceExpr, GameEvent, Hex, HexKey, OwnedTalent, TalentCategory, Unit } from '#shared/types'
import { ARCHETYPES } from '#shared/data/creatures'
import { TALENTS } from '#shared/data/talents'
import { TRAITS } from '#shared/data/traits'
import { toTarget } from '#shared/engine/actions'
import type { PlayerInput } from '#shared/engine/battle'
import {
  adjDxOf, directionTo, hitsStoppedOf, isAlive, mapOf, maOf, movementObstructions, obstructions, readyAttack, unitLoadout
} from '#shared/engine/combat'
import { findPath, lineOfSight } from '#shared/engine/pathfinding'
import { adjustedDx } from '#shared/engine/rules'
import { hexEquals, hexKey, neighbors } from '#shared/utils/hex'
import { PHASE_NAMES } from '~/composables/battleText'
import { useGameStore } from '~/stores/game'

// Battle screen: shows the engine's state and sends the player's choices to it.

const game = useGameStore()
if (!game.character) await navigateTo('/create')

const events = ref<GameEvent[]>([])
function record(list: GameEvent[]) {
  events.value.push(...list)
  const limit = game.save.settings.logLimit
  if (events.value.length > limit) events.value.splice(0, events.value.length - limit)
}
if (game.character && !game.battle) record(game.startBattle())

const battle = computed(() => game.battle)
const map = computed(() => (battle.value ? mapOf(battle.value) : undefined))
const units = computed(() => (battle.value ? Object.values(battle.value.units) : []))
const hero = computed(() => units.value.find(u => u.side === 'player'))
const opponents = computed(() => units.value.filter(u => u.side === 'enemy'))
const tokens = computed(() => units.value.filter(isAlive))
const pending = computed(() => battle.value?.pending)
const active = computed(() => (pending.value && battle.value ? battle.value.units[pending.value.unitUid] : undefined))

const error = ref('')
function send(input: PlayerInput) {
  error.value = ''
  try {
    record(game.act(input))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

// ---------- unit display ----------

const dmg = (d: DiceExpr) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

function attackText(u: Unit): string {
  const a = readyAttack(u)
  return a ? `${a.name} ${dmg(a.damage)}${a.range > 1 ? `, range ${a.range}` : ''}` : 'No weapon ready'
}

function dxParts(u: Unit): string {
  const parts = adjustedDx({ ST: u.base.ST, DX: u.base.DX, IQ: u.base.IQ }, u.talents, unitLoadout(u)).parts
  return parts.map(p => `${p.label} ${p.value}`).join('\n')
}

function archetypeText(u: Unit): string {
  if (u.origin.type !== 'opponent') return ''
  const arch = ARCHETYPES[u.origin.spec.archetypeId]
  return arch ? `${arch.name} · ${u.aiProfile ?? ''} AI` : ''
}

const CHIP_COLORS: Record<TalentCategory, string> = {
  attack: '#a3402f', debuff: '#7a4a9c', defense: '#2f5f9c', movement: '#3f8a4a', utility: '#7a6a3a', weapon: '#6a5a4a'
}
const chips = (owned: OwnedTalent[]) => owned.map(t => {
  const node = TALENTS[t.id]!
  const suffix = t.weaponTalent ? ` (${TALENTS[t.weaponTalent]?.name})` : t.rank > 1 ? ` ${t.rank}` : ''
  return { key: `${t.id}:${t.weaponTalent ?? ''}`, label: `${node.icon} ${node.name}${suffix}`, title: node.description, color: CHIP_COLORS[node.category] }
})

const traitChips = (u: Unit) => u.traits.map(t => {
  const trait = TRAITS[t.id]
  return { key: t.id, label: `${trait?.icon ?? ''} ${trait?.name ?? t.id}${t.rank > 1 ? ` ${t.rank}` : ''}`, title: trait?.description ?? '' }
})

// ---------- dice box ----------

const recentRolls = computed(() => events.value.filter(e => e.kind === 'roll').slice(-4).reverse())

// ---------- map interaction ----------

const hovered = ref<Hex | null>(null)

/** Lit hexes: where you can move, or the six neighbours to click when choosing a facing. */
const reach = computed(() => {
  const p = pending.value
  if (p?.kind === 'move') return new Set<HexKey>(p.reachable)
  if (p?.kind === 'chooseFacing' && active.value && map.value) {
    return new Set(neighbors(active.value.pos).map(hexKey).filter(k => map.value!.hexes.has(k)))
  }
  return undefined
})

const path = computed(() => {
  const b = battle.value
  const u = active.value
  const h = hovered.value
  if (pending.value?.kind !== 'move' || !b || !u || !h || !reach.value?.has(hexKey(h))) return undefined
  return findPath(mapOf(b), u.pos, h, movementObstructions(b, u)) ?? undefined
})

/** Target ids for the pending choice, keyed by the hex they sit on. */
const targetByHex = computed(() => {
  const b = battle.value
  const out = new Map<HexKey, string>()
  if (pending.value?.kind !== 'chooseTarget' || !b) return out
  for (const t of pending.value.targets) {
    const target = toTarget(b, t)
    if (target.hex) out.set(hexKey(target.hex), t)
  }
  return out
})
const targetKeys = computed(() => (targetByHex.value.size ? new Set(targetByHex.value.keys()) : undefined))

const sight = computed(() => {
  const b = battle.value
  const from = active.value ?? hero.value
  const to = hovered.value
  if (!b || !from || !to || hexEquals(to, from.pos)) return undefined
  const there = tokens.value.find(u => hexEquals(u.pos, to))
  const obs = obstructions(b, from.uid, ...(there ? [there.uid] : []))
  return { from: from.pos, to, clear: lineOfSight(mapOf(b), from.pos, to, obs) }
})

function onSelect(h: Hex) {
  const p = pending.value
  const u = active.value
  if (!p || !u) return
  if (p.kind === 'move' && reach.value?.has(hexKey(h))) send({ kind: 'move', to: h })
  else if (p.kind === 'chooseFacing' && !hexEquals(h, u.pos)) send({ kind: 'face', facing: directionTo(u.pos, h) })
  else if (p.kind === 'chooseTarget') {
    const t = targetByHex.value.get(hexKey(h))
    if (t) send({ kind: 'target', target: t })
  }
}

// ---------- action tab ----------

const prompt = computed(() => {
  const p = pending.value
  const u = active.value
  if (!p || !u) return ''
  switch (p.kind) {
    case 'move': return `${u.name}: click a lit hex to move (MA ${maOf(u)}), or your own hex to stay.`
    case 'chooseFacing': return `${u.name}: click a lit hex to face that way.`
    case 'chooseAction': return `${u.name}: choose an action.`
    case 'chooseTarget': return `${u.name}: choose a target.`
  }
  return ''
})

const killerName = computed(() => {
  const b = battle.value
  return b?.killedBy ? b.units[b.killedBy.unitUid]?.name ?? b.killedBy.name : 'unknown'
})

// ---------- end of battle ----------

function nextBattle() {
  game.finishVictory()
  events.value = []
  record(game.startBattle())
}

function toGraveyard() {
  game.recordDeath()
  navigateTo('/create')
}

function abandon() {
  if (!hero.value || !confirm(`Abandon ${hero.value.name}? This is permanent: they go to the graveyard as abandoned.`)) return
  game.abandonRun()
  navigateTo('/create')
}
</script>

<template>
  <div v-if="battle && map && hero" class="page">
    <div class="layout">
      <aside class="side">
        <button class="abandon" @click="abandon">Abandon hero</button>

        <section class="box">
          <h2>Dice</h2>
          <p v-if="!recentRolls.length" class="muted">No rolls yet</p>
          <ul v-else class="rolls">
            <li v-for="r in recentRolls" :key="r.at">
              <template v-if="r.kind === 'roll'">
                <span class="roll-purpose">{{ r.purpose }}</span>
                <span class="dice">
                  <span v-for="(d, i) in r.dice" :key="i" class="die">{{ d }}</span>
                  <span class="roll-total">= {{ r.total }}<template v-if="r.target !== undefined"> vs {{ r.target }}</template></span>
                  <span v-if="r.success !== undefined" :class="['roll-result', r.success ? 'ok' : 'bad']">{{ r.success ? 'Hit' : 'Miss' }}</span>
                  <span v-if="r.special" class="roll-special">{{ r.special }}</span>
                </span>
              </template>
            </li>
          </ul>
        </section>

        <section class="box">
          <h2>Hero</h2>
          <div class="hero">
            <div class="portrait">⚔</div>
            <dl>
              <dt>Name</dt><dd>{{ hero.name }}</dd>
              <dt>ST</dt><dd>{{ Math.max(0, hero.stCurrent) }} / {{ hero.base.ST }}</dd>
              <dt>DX</dt><dd>{{ hero.base.DX }}</dd>
              <dt>adj DX</dt>
              <dd :title="dxParts(hero)" class="hint">{{ adjDxOf(hero) }}</dd>
              <dt>IQ</dt><dd>{{ hero.base.IQ }}</dd>
              <dt>MA</dt><dd>{{ maOf(hero) }}</dd>
              <dt>Armor</dt><dd>{{ hitsStoppedOf(hero) }}</dd>
            </dl>
          </div>
          <div class="bar-st"><span :style="{ width: `${Math.max(0, hero.stCurrent / hero.base.ST) * 100}%` }" /></div>
          <p class="gear">{{ attackText(hero) }} · {{ unitLoadout(hero).armor?.name ?? 'No armor' }}</p>
          <div class="chips">
            <span v-for="s in hero.statuses" :key="s" class="chip status">{{ s }}</span>
            <span v-for="c in chips(hero.talents)" :key="c.key" class="chip" :title="c.title" :style="{ background: c.color }">{{ c.label }}</span>
          </div>
        </section>

        <section class="box">
          <h2>Opponents</h2>
          <div class="tiles">
            <div v-for="o in opponents" :key="o.uid" :class="['tile', { dead: !isAlive(o), active: o.uid === battle.activeUnit }]">
              <div class="portrait small">👹</div>
              <div class="tile-name">{{ o.name }}</div>
              <div class="tile-stats">{{ archetypeText(o) }}</div>
              <div class="bar-st"><span :style="{ width: `${Math.max(0, o.stCurrent / o.base.ST) * 100}%` }" /></div>
              <div class="tile-stats">
                <template v-if="isAlive(o)">ST {{ o.stCurrent }}/{{ o.base.ST }} · adjDX {{ adjDxOf(o) }} · MA {{ maOf(o) }}</template>
                <template v-else>Dead</template>
              </div>
              <div class="tile-stats">⚔ {{ attackText(o) }}<template v-if="unitLoadout(o).armor"> · {{ unitLoadout(o).armor!.name }}</template></div>
              <div class="chips">
                <span v-for="s in o.statuses" :key="s" class="chip status">{{ s }}</span>
                <span v-for="t in traitChips(o)" :key="t.key" class="chip trait" :title="t.title">{{ t.label }}</span>
                <span v-for="c in chips(o.talents)" :key="c.key" class="chip" :title="c.title" :style="{ background: c.color }">{{ c.label }}</span>
              </div>
            </div>
          </div>
        </section>
      </aside>

      <section class="board">
        <div class="status-line">
          Battle {{ battle.battleNo }} · Round {{ battle.round }} · {{ PHASE_NAMES[battle.phase] }}
        </div>
        <HexCanvas
          :map="map"
          :overlays="battle.map.overlays"
          :units="tokens"
          :selected-uid="battle.activeUnit"
          :reach="reach"
          :targets="targetKeys"
          :path="path"
          :sight="sight"
          @hover="hovered = $event"
          @select="onSelect"
        />
        <ResolutionPanel :battle="battle" :events="events">
          <div v-if="battle.phase === 'victory'" class="banner win">
            <span>Victory!<template v-if="battle.rewards"> +{{ battle.rewards.xp }} XP · +{{ battle.rewards.gold }} gold</template></span>
            <button @click="nextBattle">Next battle</button>
          </div>
          <div v-else-if="battle.phase === 'defeat'" class="banner lose">
            {{ hero.name }} has fallen, killed by {{ killerName }}.
            <button @click="toGraveyard">To the graveyard</button>
          </div>
          <template v-else>
            <p class="prompt">{{ prompt }}</p>
            <p v-if="error" class="error">{{ error }}</p>
          </template>
        </ResolutionPanel>
      </section>

      <ActionModal
        :battle="battle"
        :pending="pending"
        :unit="active"
        @action="send({ kind: 'action', choice: $event })"
        @target="send({ kind: 'target', target: $event })"
      />
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

.status-line {
  font-size: 0.85rem;
  color: var(--muted);
  margin-bottom: 8px;
}

.rolls {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 8px;
}

.roll-purpose {
  display: block;
  font-size: 0.75rem;
  color: var(--muted);
}

.dice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.die {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  font-weight: 600;
}

.roll-total {
  font-size: 0.85rem;
}

.roll-result {
  font-size: 0.75rem;
  font-weight: 600;
}

.roll-result.ok {
  color: #7fa64e;
}

.roll-result.bad {
  color: #e07a6a;
}

.roll-special {
  font-size: 0.75rem;
  color: var(--accent);
}

.tile.dead {
  opacity: 0.45;
}

.tile.active {
  border-color: var(--accent);
}

.chip.status {
  background: #555;
}

.chip.trait {
  background: #5a4a6a;
}

.prompt {
  margin: 0;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.banner {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
}

.banner.win {
  color: #7fa64e;
}

.banner.lose {
  color: #e07a6a;
}

.error {
  margin: 4px 0 0;
  color: #e07a6a;
  font-size: 0.85rem;
}
</style>
