import type { Attributes, Facing, Hex, HexKey, Id, RngState, Side } from './core'
import type { ActiveEffect, OverlayId, StatusId } from './effects'
import type { Biome, NaturalWeapon, OpponentSpec } from './creatures'
import type { Equipment, ItemInstance } from './items'
import type { OwnedTalent } from './talents'

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
  origin: UnitOrigin

  base: Attributes & { MA: number }
  stCurrent: number
  talents: OwnedTalent[]
  inventory: ItemInstance[]
  equipped: Equipment
  naturalWeapons: NaturalWeapon[]
  readyWeapon?: Id             // ItemInstance uid or natural weapon name

  pos: Hex
  facing: Facing
  effects: ActiveEffect[]      // buffs, debuffs, armor, wounds, talents
  statuses: StatusId[]

  turn: { hexesMoved: number; action?: ChosenAction; done: boolean }
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
}

/** What the UI is waiting for the human to do. */
export type PendingInput =
  | { kind: 'move'; unitUid: Id; reachable: HexKey[] }
  | { kind: 'chooseAction'; unitUid: Id; actions: Id[] }
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
  activeUnit?: Id
  pending?: PendingInput
  killedBy?: { unitUid: Id; name: string; talents: Id[] }
}
