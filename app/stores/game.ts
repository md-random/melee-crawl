import { defineStore } from 'pinia'
import { toRaw } from 'vue'
import type { Attributes, Character, GameEvent, OwnedTalent, SaveFile, Tombstone } from '#shared/types'
import { SCHEMA_VERSION } from '#shared/types'
import { GRADE_ORDER } from '#shared/data/grades'
import { ITEMS } from '#shared/data/items'
import { TALENTS } from '#shared/data/talents'
import { advance, createBattle, submit, type PlayerInput } from '#shared/engine/battle'
import { isAlive } from '#shared/engine/combat'
import { biomeFor } from '#shared/engine/mapgen'
import { randomSpec } from '#shared/engine/opponents'
import { loadSave } from '#shared/engine/save'
import { applyShop, shopStock, type ShopAction } from '#shared/engine/shop'
import { attrTotalFor, iqUsed, levelOf, loadoutOf, loadoutProblems, newTalentXp, rankOf } from '#shared/engine/rules'
import { randomSeed } from '#shared/utils/rng'

const KEY = 'meleecrawl.save'

/** Temporary, for testing: each new battle has one opponent at 1 ST. Set false to undo. */
const TEST_WEAK_OPPONENT = true

/** Temporary, for testing: extra attribute points at camp, on top of the XP table. Set 0 to undo. */
export const TEST_BONUS_ATTR_POINTS = 10

const TEST_EXTRA_WEAPONS = true

const TEST_GRADED_STOCK = true

const emptySave = (): SaveFile => {
  return { schemaVersion: SCHEMA_VERSION, graveyard: [], settings: { animationSpeed: 1, logLimit: 2000 } }
}

/**
 * localStorage for now; swap these two functions for a backend later.
 * Old saves are migrated; one that can't be loaded is kept under a backup key.
 */
const readSave = (): SaveFile => {
  try {
    const { save, backup } = loadSave(localStorage.getItem(KEY), emptySave)
    if (backup) localStorage.setItem(`${KEY}.backup-${Date.now()}`, backup)
    return save
  } catch {
    return emptySave()
  }
}

const writeSave = (save: SaveFile) => {
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
    battle: s => s.save.run?.battle,
    screen: s => s.save.run?.screen,
    shop: s => s.save.run?.shop
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
      const opponents = TEST_WEAK_OPPONENT
        ? [randomSpec(seed + 1, { attrPoints: 0, xp: 0 })]
        : [0, 1].map(i => randomSpec(seed + i + 1, { attrPoints: i * 2, xp: i * 500 }))
      const battle = createBattle({
        id: `battle-${seed}`,
        battleNo: run.character.stats.battlesWon + 1,
        seed,
        character: toRaw(run.character),
        opponents,
        biome: biomeFor(seed)
      })
      if (TEST_WEAK_OPPONENT) for (const u of Object.values(battle.units)) if (u.side === 'enemy') u.stCurrent = 1
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

    /**
     * After a win: add the rewards, count it, clear the battle and go to camp.
     * Healing is automatic, since the next battle starts from full ST.
     */
    finishVictory() {
      const run = this.save.run
      const battle = run?.battle
      if (!run || battle?.phase !== 'victory') return
      const c = run.character
      const stats = c.stats
      const rewards = battle.rewards ?? { xp: 0, gold: 0 }
      c.xp.earned += rewards.xp
      c.xp.unspent += rewards.xp
      c.gold += rewards.gold
      stats.xpEarned += rewards.xp
      stats.goldEarned += rewards.gold
      stats.battlesWon++
      stats.kills += Object.values(battle.units).filter(u => u.side === 'enemy' && !isAlive(u)).length
      stats.turnsSurvived += battle.round
      delete run.battle
      run.screen = 'camp'
      writeSave(this.save)
    },

    /** Saves attributes placed at camp: only raises, and only up to what the XP table allows. */
    setAttributes(attrs: Attributes) {
      const c = this.save.run?.character
      if (!c || this.save.run?.screen !== 'camp') return
      if ((['ST', 'DX', 'IQ'] as const).some(k => attrs[k] < c.base[k])) return
      if (attrs.ST + attrs.DX + attrs.IQ > attrTotalFor(c.xp.earned) + TEST_BONUS_ATTR_POINTS) return
      c.base = { ...attrs }
      writeSave(this.save)
    },

    /** Saves talents learned at camp: keeps every saved one, pays XP per new rank, stays within IQ. */
    setTalents(talents: OwnedTalent[]) {
      const c = this.save.run?.character
      if (!c || this.save.run?.screen !== 'camp') return
      if (c.talents.some(t => rankOf(talents, t.id, t.weaponTalent) < t.rank)) return
      const cost = newTalentXp(c.talents, talents)
      if (cost > c.xp.unspent || iqUsed(talents, c.class) > c.base.IQ) return
      c.talents = talents.map(t => ({ ...t }))
      c.xp.unspent -= cost
      writeSave(this.save)
    },

    /** Stocks this camp visit's shop, once. */
    openShop() {
      const run = this.save.run
      if (!run || run.screen !== 'camp') return
      const weaponCount = TEST_EXTRA_WEAPONS ? 4 : 2
      const stock = run.shop?.stock ?? []
      const enoughWeapons = stock.filter(i => ITEMS[i.defId]?.kind === 'weapon').length >= weaponCount
      const needsGrades = TEST_GRADED_STOCK && stock.every(i => i.grade === 'ordinary')
      if (run.shop && enoughWeapons && !needsGrades) return
      const fresh = shopStock(randomSeed(), { weapon: weaponCount })
      run.shop = {
        stock: TEST_GRADED_STOCK ? fresh.map((item, i) => ({ ...item, grade: GRADE_ORDER[i % GRADE_ORDER.length]! })) : fresh
      }
      writeSave(this.save)
    },

    /** Saves the camp's buys and sells, if they all go through and leave a usable loadout. */
    applyShop(actions: ShopAction[]) {
      const run = this.save.run
      const c = run?.character
      if (!run?.shop || !c || run.screen !== 'camp' || !actions.length) return
      const { state, error } = applyShop(
        { inventory: c.inventory, equipped: c.equipped, gold: c.gold, stock: run.shop.stock },
        actions
      )
      if (error) return
      const gear = loadoutOf(state)
      if (!gear.weapon || loadoutProblems(c.base, gear, c.talents).length) return
      c.inventory = state.inventory
      c.equipped = state.equipped
      c.gold = state.gold
      run.shop.stock = state.stock
      writeSave(this.save)
    },

    /** Leaves camp for the next fight; the battle page starts it. The next camp gets a new shop. */
    leaveCamp() {
      const run = this.save.run
      if (run?.screen !== 'camp') return
      run.screen = 'battle'
      delete run.shop
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
