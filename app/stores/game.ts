import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type { Character, GameEvent, SaveFile, Tombstone } from '#shared/types'
import { SCHEMA_VERSION } from '#shared/types'
import { TALENTS } from '#shared/data/talents'
import { advance, createBattle, submit, type PlayerInput } from '#shared/engine/battle'
import { isAlive } from '#shared/engine/combat'
import { randomSpec } from '#shared/engine/opponents'
import { loadSave } from '#shared/engine/save'
import { levelOf } from '#shared/engine/rules'
import { randomSeed } from '#shared/utils/rng'

const KEY = 'meleecrawl.save'

function emptySave(): SaveFile {
  return { schemaVersion: SCHEMA_VERSION, graveyard: [], settings: { animationSpeed: 1, logLimit: 2000 } }
}

/**
 * localStorage for now; swap these two functions for a backend later.
 * Old saves are migrated; one that can't be loaded is kept under a backup key.
 */
function readSave(): SaveFile {
  try {
    const { save, backup } = loadSave(localStorage.getItem(KEY), emptySave)
    if (backup) localStorage.setItem(`${KEY}.backup-${Date.now()}`, backup)
    return save
  } catch {
    return emptySave()
  }
}

function writeSave(save: SaveFile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save))
  } catch {
    // Storage full or blocked: the game keeps running from memory.
  }
}

export const useGameStore = defineStore('game', {
  state: (): { save: SaveFile } => ({ save: readSave() }),
  getters: {
    character: (s): Character | undefined => s.save.run?.character,
    battle: s => s.save.run?.battle
  },
  actions: {
    startRun(character: Character) {
      this.save.run = { screen: 'battle', character }
      writeSave(this.save)
    },

    /** Starts the next battle if none is running. Returns its opening events. */
    startBattle(): GameEvent[] {
      const run = this.save.run
      if (!run || run.battle) return []
      const seed = randomSeed()
      // Placeholder opponents until matchmaking (step 7).
      const opponents = [0, 1].map(i => randomSpec(seed + i + 1, { attrPoints: i * 2, xp: i * 500 }))
      const battle = createBattle({
        id: `battle-${seed}`,
        battleNo: run.character.stats.battlesWon + 1,
        seed,
        character: toRaw(run.character),
        opponents,
        biome: 'forest'
      })
      const events = advance(battle)
      run.battle = battle
      run.screen = 'battle'
      writeSave(this.save)
      return events
    },

    /** Sends the player's choice to the engine and saves. */
    act(input: PlayerInput): GameEvent[] {
      const run = this.save.run
      if (!run?.battle) return []
      // The engine runs on the plain object: AI turns read the state thousands of
      // times, which is slow through Vue's proxies. A new top-level object then
      // tells Vue everything changed.
      const raw = toRaw(run.battle)
      const events = submit(raw, input)
      run.battle = { ...raw }
      writeSave(this.save)
      return events
    },

    /** After a win: count it and clear the battle. Healing is automatic, since the next battle starts from full ST. */
    finishVictory() {
      const run = this.save.run
      const battle = run?.battle
      if (!run || battle?.phase !== 'victory') return
      const stats = run.character.stats
      stats.battlesWon++
      stats.kills += Object.values(battle.units).filter(u => u.side === 'enemy' && !isAlive(u)).length
      stats.turnsSurvived += battle.round
      delete run.battle
      writeSave(this.save)
    },

    /** After a loss: the hero goes to the graveyard and the run ends. */
    recordDeath() {
      const battle = this.save.run?.battle
      if (battle?.phase !== 'defeat') return
      const killer = battle.killedBy ? battle.units[battle.killedBy.unitUid] : undefined
      this.bury({
        name: killer?.name ?? battle.killedBy?.name ?? 'Unknown',
        title: killer?.title,
        talents: (battle.killedBy?.talents ?? []).map(id => TALENTS[id]?.name ?? id)
      }, battle.battleNo)
    },

    /** Ends the run on purpose. Recorded in the graveyard like a death, so it can't hide a lost fight. */
    abandonRun() {
      const c = this.save.run?.character
      if (!c) return
      this.bury({ name: 'Abandoned', talents: [] }, c.stats.battlesWon + 1)
    },

    bury(killedBy: Tombstone['killedBy'], battleNo: number) {
      const run = this.save.run
      if (!run) return
      const c = run.character
      this.save.graveyard.push({
        characterId: c.id,
        name: c.name,
        class: c.class,
        level: levelOf(c.base),
        // Placeholder until the scoring formula lands with the leaderboard.
        score: c.stats.battlesWon * 100 + c.stats.kills * 10 + c.stats.xpEarned,
        stats: c.stats,
        killedBy,
        battleNo,
        diedAt: Date.now()
      })
      delete this.save.run
      writeSave(this.save)
    },

    persist() {
      writeSave(this.save)
    }
  }
})
