<script setup lang="ts">
import type { BattleState, PendingInput, Unit } from '#shared/types'
import { SPELLS } from '#shared/data/spells'
import { defOf, itemName } from '#shared/engine/items'
import { allChoices, ACTIONS, choiceKey, contextFor, toTarget } from '#shared/engine/actions'
import { halfMove, isEngagedAt, maOf } from '#shared/engine/combat'
import { createRng } from '#shared/utils/rng'

// Action and target choice as a modal. Lists every action, with the reason
// any of them can't be taken right now.

const props = defineProps<{ battle: BattleState; pending?: PendingInput; unit?: Unit }>()
const emit = defineEmits<{ action: [key: string]; target: [id: string] }>()

const dialog = ref<HTMLDialogElement>()
const open = computed(() => !!props.unit && (props.pending?.kind === 'chooseAction' || props.pending?.kind === 'chooseTarget'))

const sync = () => {
  const d = dialog.value
  if (!d) return
  if (open.value && !d.open) d.showModal()
  else if (!open.value && d.open) d.close()
}
watch(open, () => nextTick(sync))
onMounted(sync)

// Esc would leave the turn stuck: the choice has to be made.
const keepOpen = (e: Event) => e.preventDefault()

// Reasons and estimates never roll dice; a throwaway RNG keeps the battle's own untouched.
const scratchRng = () => createRng({ seed: 0, calls: 0 })

const engaged = computed(() => (props.unit ? isEngagedAt(props.battle, props.unit, props.unit.pos) : false))

const actions = computed(() => {
  const p = props.pending
  const u = props.unit
  if (p?.kind !== 'chooseAction' || !u) return []
  return allChoices(props.battle, u, scratchRng()).map(({ choice, def, reason }) => {
    const key = choiceKey(choice)
    const inst = choice.itemUid ? u.inventory.find(i => i.uid === choice.itemUid) : undefined
    const extra = choice.spellId ? SPELLS[choice.spellId]?.name : inst && defOf(inst) ? itemName(inst) : undefined
    return {
      key,
      icon: def.icon,
      label: extra ? `${def.label}: ${extra}` : def.label,
      hint: def.hint,
      reason: reason ?? (p.actions.includes(key) ? undefined : 'Not available right now.')
    }
  })
})

const targets = computed(() => {
  const p = props.pending
  const u = props.unit
  if (p?.kind !== 'chooseTarget' || !u?.turn.action) return []
  const def = ACTIONS[p.actionId]
  if (!def) return []
  const ctx = contextFor(props.battle, u, u.turn.action, scratchRng())
  return p.targets.map(t => {
    const target = toTarget(props.battle, t)
    const est = def.estimate(ctx, target)
    const who = target.unit ? props.battle.units[target.unit] : undefined
    return {
      id: t,
      name: who?.name ?? t,
      st: who ? `${who.stCurrent}/${who.base.ST} ST` : '',
      hit: Math.round(est.hitChance * 100),
      damage: est.damage.toFixed(1),
      kill: Math.round(est.kill * 100)
    }
  })
})

const title = computed(() => {
  const p = props.pending
  if (p?.kind === 'chooseTarget') return `${ACTIONS[p.actionId]?.label ?? 'Action'}: choose a target`
  return 'Choose an action'
})
</script>

<template>
  <dialog ref="dialog" class="action-modal" @cancel="keepOpen">
    <template v-if="open && unit">
      <header>
        <h2>{{ title }}</h2>
        <div class="who">
          <span class="name">{{ unit.name }}</span>
          <span class="tag">ST {{ unit.stCurrent }}/{{ unit.base.ST }}</span>
          <span class="tag">Moved {{ unit.turn.hexesMoved }} of {{ maOf(unit) }} (half: {{ halfMove(unit) }})</span>
          <span v-if="engaged" class="tag engaged">Engaged</span>
        </div>
      </header>

      <ul v-if="pending?.kind === 'chooseAction'" class="options">
        <li v-for="a in actions" :key="a.key">
          <button :disabled="!!a.reason" class="option" @click="emit('action', a.key)">
            <span class="icon">{{ a.icon }}</span>
            <span class="text">
              <span class="label">{{ a.label }}</span>
              <span class="hint">{{ a.hint }}</span>
              <span v-if="a.reason" class="reason">{{ a.reason }}</span>
            </span>
          </button>
        </li>
      </ul>

      <ul v-else class="options">
        <li v-for="t in targets" :key="t.id">
          <button class="option" @click="emit('target', t.id)">
            <span class="icon">🎯</span>
            <span class="text">
              <span class="label">{{ t.name }} <span v-if="t.st" class="muted">· {{ t.st }}</span></span>
              <span class="hint">{{ t.hit }}% to hit · about {{ t.damage }} damage<template v-if="t.kill"> · {{ t.kill }}% to kill</template></span>
            </span>
          </button>
        </li>
      </ul>
    </template>
  </dialog>
</template>

<style scoped>
.action-modal {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 64px);
  padding: 0;
  border: 1px solid var(--accent);
  border-radius: 10px;
  background: var(--panel);
  color: var(--fg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.action-modal::backdrop {
  background: rgba(10, 8, 6, 0.45);
}

header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}

h2 {
  margin: 0 0 8px;
  font-size: 1rem;
}

.who {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 0.8rem;
}

.name {
  font-weight: 600;
}

.tag {
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--muted);
}

.tag.engaged {
  border-color: #e07a6a;
  color: #e07a6a;
  font-weight: 600;
}

.options {
  list-style: none;
  margin: 0;
  padding: 10px;
  display: grid;
  gap: 6px;
  overflow-y: auto;
}

.option {
  width: 100%;
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 10px;
  align-items: start;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
}

.option:not(:disabled):hover {
  border-color: var(--accent);
}

.option:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.icon {
  font-size: 1.3rem;
  line-height: 1.4;
}

.text {
  display: grid;
  gap: 2px;
}

.label {
  font-weight: 600;
}

.hint {
  font-size: 0.8rem;
  color: var(--muted);
}

.reason {
  font-size: 0.8rem;
  color: #e07a6a;
}

.muted {
  color: var(--muted);
  font-weight: 400;
}
</style>
