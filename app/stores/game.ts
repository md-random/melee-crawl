import { defineStore } from 'pinia'
import type { Character, SaveFile } from '#shared/types'
import { SCHEMA_VERSION } from '#shared/types'
import { levelOf } from '#shared/engine/rules'

const KEY = 'meleecrawl.save'

function emptySave(): SaveFile {
  return { schemaVersion: SCHEMA_VERSION, graveyard: [], settings: { animationSpeed: 1, logLimit: 2000 } }
}

/** localStorage for now; swap these two functions for a backend later. */
function readSave(): SaveFile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySave()
    const save = JSON.parse(raw) as SaveFile
    // No migrations yet: an unknown version starts fresh rather than loading a broken save.
    return save.schemaVersion === SCHEMA_VERSION ? save : emptySave()
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
    character: (s): Character | undefined => s.save.run?.character
  },
  actions: {
    startRun(character: Character) {
      this.save.run = { screen: 'battle', character }
      writeSave(this.save)
    },
    /** Ends the run on purpose. Recorded in the graveyard like a death, so it can't hide a lost fight. */
    abandonRun() {
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
        killedBy: { name: 'Abandoned', talents: [] },
        battleNo: c.stats.battlesWon + 1,
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
