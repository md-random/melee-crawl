import type { Attributes, Facing, Hex, HexKey, Id, RngState, Side } from './core'
import type { ActiveEffect, OverlayId, StatusId } from './effects'
import type { AiProfileId, Biome, NaturalWeapon, OpponentSpec } from './creatures'
import type { Equipment, ItemInstance } from './items'
import type { OwnedTalent } from './talents'
import type { OwnedTrait } from './traits'

// ---------- map ----------

export type Terrain = 'clear' | 'tree' | 'boulder' | 'water'

export interface TerrainRule { passable: boolean; blocksLOS: boolean; moveCost: number }

/** Base terrain is regenerated from seed; only overlays are saved. */
export interface MapState {
  seed: number
  biome: Biome
  width: number
  height: number
  overlays: Record<HexKey, { overlay: OverlayId; effectUid: Id }>
}

/** Runtime-only, built from MapState. */
export interface GeneratedMap {
  hexes: Map<HexKey, Terrain>
  spawns: Record<Side, HexKey[]>
}

// ---------- units ----------

export type UnitOrigin =
  | { type: 'character'; characterId: Id }
  | { type: 'opponent'; spec: OpponentSpec }
  | { type: 'summon'; creatureId: Id; ownerUid: Id }

/** A fighter on the map: player, generated opponent, or summon. */
export interface Unit {
  uid: Id
  name: string
  title?: string               // "Veteran"
  portraitId: string
  side: Side
  controller: 'human' | 'ai'
  /** Used when controller is 'ai'. Opponents get their archetype's profile. */
  aiProfile?: AiProfileId
  origin: UnitOrigin
  tags: string[]

  base: Attributes & { MA: number }
  stCurrent: number
  talents: OwnedTalent[]
  traits: OwnedTrait[]
  inventory: ItemInstance[]
  equipped: Equipment
  naturalWeapons: NaturalWeapon[]
  readyWeapon?: Id             // ItemInstance uid or natural weapon name
  spells: Id[]

  pos: Hex
  facing: Facing
  effects: ActiveEffect[]      // buffs, debuffs, armor, wounds, talents
  statuses: StatusId[]

  turn: UnitTurn
}

export interface UnitTurn {
  hexesMoved: number
  /** Engaged when its movement began; leaving engagement then counts as disengaging. */
  startedEngaged: boolean
  action?: ChosenAction
  /** Planned target from the AI's movement-time plan. */
  plannedTarget?: Id | HexKey
  done: boolean
}

// ---------- turn flow ----------

export type Phase =
  | 'setup'
  | 'initiative'
  | 'movement'
  | 'actionSelect'
  | 'actionResolve'
  | 'endOfTurn'
  | 'victory'
  | 'defeat'

export interface ChosenAction {
  actionId: Id
  targetUnit?: Id
  targetHex?: Hex
  itemUid?: Id
  spellId?: Id
}

/** What the UI is waiting for the human to do. */
export type PendingInput =
  | { kind: 'move'; unitUid: Id; reachable: HexKey[] }
  /** `actions` are choice keys: 'attack', 'castSpell:<spellId>', 'useItem:<itemUid>'. */
  | { kind: 'chooseAction'; unitUid: Id; actions: string[] }
  | { kind: 'chooseTarget'; unitUid: Id; actionId: Id; targets: (Id | HexKey)[] }
  | { kind: 'chooseFacing'; unitUid: Id }

export interface BattleState {
  id: Id
  battleNo: number
  rng: RngState
  map: MapState
  units: Record<Id, Unit>
  round: number
  phase: Phase
  moveOrder: Side[]            // initiative result for this round
  /** Units still to act in the current phase, in order. */
  queue: Id[]
  activeUnit?: Id
  pending?: PendingInput
  /** Effects on hexes rather than units (terrain overlays). */
  fieldEffects: ActiveEffect[]
  /** Counters for event order and effect uids; saved so reloads continue them. */
  seq: { event: number; uid: number }
  killedBy?: { unitUid: Id; name: string; talents: Id[] }
}
