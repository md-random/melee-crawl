import type { BattleState, GameEvent, Id } from '../types'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An event before the engine stamps its round and order. */
export type EventBody = DistributiveOmit<GameEvent, 'round' | 'at'>

/** Stamps an event with the current round and the next sequence number. */
export function ev(state: BattleState, body: EventBody): GameEvent {
  return { ...body, round: state.round, at: state.seq.event++ } as GameEvent
}

/** Next unique id for effects created during the battle. */
export function nextUid(state: BattleState, prefix: string): Id {
  return `${prefix}${state.seq.uid++}`
}
