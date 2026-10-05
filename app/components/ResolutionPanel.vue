<script setup lang="ts">
import type { BattleState, GameEvent, Id } from '#shared/types'

// How each attack was resolved: to-hit breakdown, dice, hit or miss, damage
// through armor, ST left. One fixed-height box that scrolls, newest on top.

const props = defineProps<{ battle: BattleState; events: GameEvent[] }>()

type Roll = Extract<GameEvent, { kind: 'roll' }>

interface Exchange {
  at: number
  round: number
  attacker: Id
  target: Id
  weapon: string
  toHit?: Roll
  damageRoll?: Roll
  lost?: number
  stopped?: number
  killed: boolean
  notes: string[]
}

const exchanges = computed<Exchange[]>(() => {
  const out: Exchange[] = []
  let cur: Exchange | undefined
  for (const e of props.events) {
    if (e.kind === 'attack') {
      cur = { at: e.at, round: e.round, attacker: e.unit, target: e.target, weapon: e.weapon, killed: false, notes: [] }
      out.push(cur)
    } else if (!cur) {
      continue
    } else if (e.kind === 'roll' && e.actor === cur.attacker) {
      if (!cur.toHit) cur.toHit = e
      else if (!cur.damageRoll) cur.damageRoll = e
    } else if (e.kind === 'damage' && e.unit === cur.target) {
      cur.lost = e.amount
      cur.stopped = e.stopped
    } else if (e.kind === 'death' && e.unit === cur.target) {
      cur.killed = true
    } else if (e.kind === 'narrate' && /drops|breaks/.test(e.text)) {
      cur.notes.push(e.text)
    } else if (e.kind === 'phase') {
      cur = undefined
    }
  }
  return out.reverse()
})

const name = (uid: Id) => props.battle.units[uid]?.name ?? uid
const unitOf = (uid: Id) => props.battle.units[uid]
const isHero = (uid: Id) => props.battle.units[uid]?.side === 'player'
const signed = (v: number) => (v >= 0 ? `+${v}` : `−${-v}`)

function partsText(r?: Roll): string {
  if (!r?.parts?.length) return ''
  return r.parts.map((p, i) => (i === 0 ? `${p.label} ${p.value}` : `${p.label} ${signed(p.value)}`)).join(' ')
}
</script>

<template>
  <div class="resolution">
    <p v-if="!exchanges.length" class="muted">Attack results appear here.</p>
    <article
      v-for="x in exchanges"
      :key="x.at"
      :class="['row', x.toHit?.success ? 'hit' : 'miss', { mine: isHero(x.attacker) }]"
    >
      <header>
        <span class="round">R{{ x.round }}</span>
        <strong>{{ name(x.attacker) }}</strong> → <strong>{{ name(x.target) }}</strong>
        <span class="muted">· {{ x.weapon }}</span>
        <span :class="['result', x.toHit?.success ? 'ok' : 'bad']">
          {{ x.killed ? 'KILLED' : x.toHit?.success ? 'HIT' : 'MISS' }}
        </span>
      </header>

      <div v-if="x.toHit" class="line">
        <span class="label">To hit</span>
        <span>
          Need {{ x.toHit.target }} or less
          <span v-if="partsText(x.toHit)" class="muted">({{ partsText(x.toHit) }})</span>
          · rolled
          <span v-for="(d, i) in x.toHit.dice" :key="i" class="die">{{ d }}</span>
          = {{ x.toHit.total }}
          <span v-if="x.toHit.special" class="special">{{ x.toHit.special }}</span>
        </span>
      </div>
      <div v-if="x.toHit?.note" class="line"><span class="label" /><span class="muted">{{ x.toHit.note }}</span></div>

      <div v-if="x.damageRoll" class="line">
        <span class="label">Damage</span>
        <span>
          <span v-for="(d, i) in x.damageRoll.dice" :key="i" class="die">{{ d }}</span>
          <span v-if="partsText(x.damageRoll)" class="muted">({{ partsText(x.damageRoll) }})</span>
          = {{ x.damageRoll.total }}
          <template v-if="x.damageRoll.note"> · {{ x.damageRoll.note }}</template>
          <template v-if="x.lost !== undefined">
            − armor {{ x.stopped }} = <strong>{{ x.lost }} ST lost</strong>
          </template>
        </span>
      </div>

      <div v-if="x.lost !== undefined && unitOf(x.target)" class="line">
        <span class="label">Left</span>
        <span>{{ name(x.target) }}: {{ Math.max(0, unitOf(x.target)!.stCurrent) }} / {{ unitOf(x.target)!.base.ST }} ST</span>
      </div>
      <div v-for="n in x.notes" :key="n" class="line"><span class="label" /><span class="special">{{ n }}</span></div>
    </article>
  </div>
</template>

<style scoped>
.resolution {
  height: 190px;
  overflow-y: auto;
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}

.resolution > .muted {
  margin: 10px;
}

.row {
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  border-left: 4px solid transparent;
  font-size: 0.82rem;
  display: grid;
  gap: 3px;
}

.row.hit {
  border-left-color: #b8382c;
}

.row.miss {
  border-left-color: var(--muted);
}

.row.mine {
  background: rgba(47, 99, 196, 0.12);
}

header {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
}

.round {
  color: var(--muted);
  font-size: 0.75rem;
  min-width: 26px;
}

.result {
  margin-left: auto;
  font-weight: 700;
}

.result.ok {
  color: #e07a6a;
}

.result.bad {
  color: var(--muted);
}

.line {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 6px;
}

.label {
  color: var(--muted);
}

.die {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin: 0 1px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-weight: 600;
  font-size: 0.75rem;
}

.special {
  color: var(--accent);
  font-weight: 600;
}

.muted {
  color: var(--muted);
}
</style>
