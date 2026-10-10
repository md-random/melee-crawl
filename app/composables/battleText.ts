import type { BattleState, GameEvent, Id, Phase } from '#shared/types'
import { hexKey } from '#shared/utils/hex'

export const FACING_NAMES = ['NE', 'SE', 'S', 'SW', 'NW', 'N'] as const

export const PHASE_NAMES: Record<Phase, string> = {
  setup: 'Setup',
  initiative: 'Initiative',
  movement: 'Movement',
  actionSelect: 'Choose actions',
  actionResolve: 'Actions',
  endOfTurn: 'End of turn',
  victory: 'Victory',
  defeat: 'Defeat'
}

/** One log line per engine event. */
export const describeEvent = (state: BattleState, e: GameEvent): string => {
  const name = (uid?: Id) => (uid ? state.units[uid]?.name ?? uid : '?')
  switch (e.kind) {
    case 'roll': {
      const vs = e.target !== undefined ? ` vs ${e.target}` : ''
      const result = e.success === undefined ? '' : e.success ? ' ✓' : ' ✗'
      return `${e.purpose}: ${e.dice.join('+')} = ${e.total}${vs}${result}${e.special ? ` (${e.special})` : ''}`
    }
    case 'phase': return `— ${PHASE_NAMES[e.phase]} —`
    case 'move': return `${name(e.unit)} moves ${hexKey(e.from)} → ${hexKey(e.to)}`
    case 'face': return `${name(e.unit)} faces ${FACING_NAMES[e.facing] ?? e.facing}`
    case 'attack': return `${name(e.unit)} attacks ${name(e.target)} with ${e.weapon}`
    case 'damage': return `${name(e.unit)} takes ${e.amount} damage from ${e.source}${e.stopped ? ` (${e.stopped} stopped)` : ''} (${e.left} left)`
    case 'heal': return `${name(e.unit)} heals ${e.amount} from ${e.source}`
    case 'effectAdded': return `${e.effect.source.name} takes effect${e.effect.targetUnit ? ` on ${name(e.effect.targetUnit)}` : ''}`
    case 'effectRemoved': return `Effect ${e.effectUid} ends (${e.reason})`
    case 'status': return `${name(e.unit)} ${e.on ? 'is now' : 'is no longer'} ${e.status}`
    case 'death': return `${name(e.unit)} dies${e.by ? ` (killed by ${name(e.by)})` : ''}`
    case 'narrate': return e.text
    case 'debug': return `[debug] ${e.msg}`
  }
}
