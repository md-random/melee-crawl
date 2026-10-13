<script setup lang="ts">
import type {
  DiceExpr, EffectDef, GradeId, IconDraft, IconSpec, Requirement, TalentAudience, TalentCategory, TalentNode, WeaponDef, WeaponSpec
} from '#shared/types'
import { GRADES, GRADE_ORDER } from '#shared/data/grades'
import { iconIdFromName, iconProblems, isSvgIcon, parseTags, svgProblems } from '#shared/engine/icons'
import { idFromName } from '#shared/engine/ids'
import { MAX_LEVEL, TALENT_AUDIENCES, TALENT_CATEGORIES, arrangeTalents, parentIds, talentProblems } from '#shared/engine/talents'
import { ATTACK_KINDS, RANGED_KINDS, WEAPON_TALENTS, weaponProblems } from '#shared/engine/weapons'

if (!import.meta.dev) await navigateTo('/')

const CREATORS = [
  { id: 'icons', label: 'SVG icons' },
  { id: 'weapons', label: 'Weapons' },
  { id: 'talents', label: 'Talents' },
  { id: 'opponents', label: 'Opponents' }
] as const
const creator = ref<(typeof CREATORS)[number]['id']>('icons')

const errorText = (e: unknown): string => {
  const data = (e as { data?: { statusMessage?: string; message?: string } }).data
  return data?.statusMessage ?? data?.message ?? (e instanceof Error ? e.message : String(e))
}

const library = ref<IconSpec[]>([])
const loadError = ref('')
const filter = ref('')

const load = async () => {
  try {
    const list = await $fetch<unknown>('/api/admin/icons')
    if (!Array.isArray(list)) {
      loadError.value = 'The icon routes are not running. Restart the dev server.'
      return
    }
    library.value = list as IconSpec[]
  } catch (e) {
    loadError.value = errorText(e)
  }
}
onMounted(load)

const shown = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return library.value
  return library.value.filter(i => i.name.toLowerCase().includes(q) || i.tags.some(t => t.includes(q)))
})

const drafts = ref<IconDraft[]>([])
const draftsError = ref('')
const selection = ref<{ kind: 'draft' | 'library'; id: string }>()

const newestFirst = computed(() => [...drafts.value].reverse())

const loadDrafts = async () => {
  try {
    const list = await $fetch<unknown>('/api/admin/icon-drafts')
    if (!Array.isArray(list)) return
    const known = new Set(drafts.value.map(d => d.id))
    const added = (list as IconDraft[]).filter(d => !known.has(d.id))
    drafts.value = list as IconDraft[]
    draftsError.value = ''
    const newest = added.at(-1)
    const s = selection.value
    if (newest) selection.value = { kind: 'draft', id: newest.id }
    else if (s?.kind === 'draft' && !drafts.value.some(d => d.id === s.id)) {
      const last = drafts.value.at(-1)
      selection.value = last ? { kind: 'draft', id: last.id } : undefined
    }
  } catch (e) {
    draftsError.value = errorText(e)
  }
}

let draftTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  loadDrafts()
  draftTimer = setInterval(loadDrafts, 2000)
})
onBeforeUnmount(() => clearInterval(draftTimer))

const current = computed(() => {
  const s = selection.value
  if (s?.kind === 'draft') {
    const d = drafts.value.find(x => x.id === s.id)
    return d && { svg: d.svg, caption: d.prompt || d.id, problems: d.problems }
  }
  if (s?.kind === 'library') {
    const i = library.value.find(x => x.id === s.id)
    return i && { svg: i.svg, caption: i.name, problems: [] as string[] }
  }
  return undefined
})

const previewGrade = ref<GradeId>('ordinary')
const gradeColor = computed(() => GRADES[previewGrade.value].color)

const editingId = ref<string>()
const form = ref({ name: '', tags: '' })
const saving = ref(false)
const saveStatus = ref('')

const startNew = () => {
  editingId.value = undefined
  selection.value = undefined
  form.value = { name: '', tags: '' }
  saveStatus.value = ''
}

const openIcon = (icon: IconSpec) => {
  selection.value = { kind: 'library', id: icon.id }
  editingId.value = icon.id
  form.value = { name: icon.name, tags: icon.tags.join(', ') }
  saveStatus.value = ''
}

const formIcon = computed<IconSpec | undefined>(() => (current.value && !current.value.problems.length
  ? { id: iconIdFromName(form.value.name), name: form.value.name.trim(), tags: parseTags(form.value.tags), svg: current.value.svg }
  : undefined))

const updatingIcon = computed(() => !!editingId.value && formIcon.value?.id === editingId.value)

const nextLibrary = computed(() => {
  const icon = formIcon.value
  if (!icon) return undefined
  return updatingIcon.value ? library.value.map(i => (i.id === editingId.value ? icon : i)) : [...library.value, icon]
})

const saveProblems = computed(() => (nextLibrary.value ? iconProblems(nextLibrary.value) : []))

const writeLibrary = async (list: IconSpec[]) => {
  await $fetch('/api/admin/icons', { method: 'PUT', body: list })
  library.value = list
}

const removeDraft = async (id: string) => {
  await $fetch(`/api/admin/icon-drafts/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await loadDrafts()
}

const rejectDraft = async () => {
  const s = selection.value
  if (s?.kind !== 'draft') return
  try {
    await removeDraft(s.id)
    saveStatus.value = 'Draft rejected'
  } catch (e) {
    saveStatus.value = errorText(e)
  }
}

const save = async () => {
  const list = nextLibrary.value
  const icon = formIcon.value
  if (!list || !icon || saveProblems.value.length || saving.value) return
  const draft = selection.value?.kind === 'draft' ? selection.value.id : undefined
  saving.value = true
  saveStatus.value = ''
  try {
    await writeLibrary(list)
    editingId.value = icon.id
    selection.value = { kind: 'library', id: icon.id }
    if (draft) await removeDraft(draft)
    saveStatus.value = `Saved ${icon.name}`
  } catch (e) {
    saveStatus.value = errorText(e)
  } finally {
    saving.value = false
  }
}

const removeIcon = async () => {
  const icon = library.value.find(i => i.id === editingId.value)
  if (!icon || !confirm(`Delete ${icon.name} from the library?`)) return
  try {
    await writeLibrary(library.value.filter(i => i !== icon))
    startNew()
    saveStatus.value = `Deleted ${icon.name}`
  } catch (e) {
    saveStatus.value = errorText(e)
  }
}

interface WeaponForm {
  name: string
  icon: string
  talent: string
  dice: number | ''
  mod: number | ''
  minST: number | ''
  hands: 1 | 2 | ''
  attackKind: WeaponDef['attackKind'] | ''
  range: number | ''
  cost: number | ''
  unverified: boolean
}

const blankWeaponForm = (): WeaponForm => ({
  name: '', icon: '', talent: '', dice: '', mod: '', minST: '', hands: '', attackKind: '', range: '', cost: '', unverified: false
})

const weapons = ref<WeaponSpec[]>([])
const weaponsError = ref('')
const editingWeaponId = ref<string>()
const weaponForm = ref<WeaponForm>(blankWeaponForm())
const weaponSaving = ref(false)
const weaponStatus = ref('')

const loadWeapons = async () => {
  try {
    const list = await $fetch<unknown>('/api/admin/weapons')
    if (!Array.isArray(list)) {
      weaponsError.value = 'The weapon routes are not running. Restart the dev server.'
      return
    }
    weapons.value = list as WeaponSpec[]
  } catch (e) {
    weaponsError.value = errorText(e)
  }
}
onMounted(loadWeapons)

const dmg = (d: DiceExpr) => `${d.dice}d${d.mod ? (d.mod > 0 ? `+${d.mod}` : d.mod) : ''}`

const weaponLine = (w: WeaponSpec) => `${dmg(w.damage)} · ST ${w.minST} · ${w.hands}H${w.range ? ` · Rng ${w.range}` : ''}`

const isRangedForm = computed(() => {
  const kind = weaponForm.value.attackKind
  return !!kind && RANGED_KINDS.includes(kind)
})

const startNewWeapon = () => {
  editingWeaponId.value = undefined
  weaponForm.value = blankWeaponForm()
  weaponStatus.value = ''
}

const openWeapon = (w: WeaponSpec) => {
  editingWeaponId.value = w.id
  weaponForm.value = {
    name: w.name,
    icon: w.icon,
    talent: w.talent,
    dice: w.damage.dice,
    mod: w.damage.mod,
    minST: w.minST,
    hands: w.hands,
    attackKind: w.attackKind,
    range: w.range ?? '',
    cost: w.cost,
    unverified: !!w.unverified
  }
  weaponStatus.value = ''
}

const formWeapon = computed(() => {
  const f = weaponForm.value
  return {
    id: idFromName(f.name),
    name: f.name.trim(),
    icon: f.icon.trim(),
    talent: f.talent,
    damage: { dice: f.dice, mod: f.mod },
    minST: f.minST,
    hands: f.hands,
    attackKind: f.attackKind,
    ...(isRangedForm.value ? { range: f.range } : {}),
    cost: f.cost,
    ...(f.unverified ? { unverified: true } : {})
  }
})

const weaponIcon = computed(() => weaponForm.value.icon.trim())

const weaponIconIsSvg = computed(() => isSvgIcon(weaponIcon.value))

const weaponSvgShown = computed(() => (weaponIconIsSvg.value && !svgProblems(weaponIcon.value).length ? weaponIcon.value : undefined))

const weaponIconFilter = ref('')

const iconChoices = (name: string, filterText: string) => {
  const q = filterText.trim().toLowerCase()
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const related = (i: IconSpec) => [i.name.toLowerCase(), ...i.tags].some(t => words.some(w => t.includes(w) || w.includes(t)))
  const shown = q ? library.value.filter(i => i.name.toLowerCase().includes(q) || i.tags.some(t => t.includes(q))) : library.value
  return [...shown].sort((a, b) => Number(related(b)) - Number(related(a)))
}

const weaponIconChoices = computed(() => iconChoices(weaponForm.value.name, weaponIconFilter.value))

const updatingWeapon = computed(() => !!editingWeaponId.value && formWeapon.value.id === editingWeaponId.value)

const nextWeapons = computed<unknown[]>(() => (updatingWeapon.value
  ? weapons.value.map(w => (w.id === editingWeaponId.value ? formWeapon.value : w))
  : [...weapons.value, formWeapon.value]))

const weaponSaveProblems = computed(() => weaponProblems(nextWeapons.value))

const writeWeapons = async (list: unknown[]) => {
  await $fetch('/api/admin/weapons', { method: 'PUT', body: list })
  weapons.value = list as WeaponSpec[]
}

const saveWeapon = async () => {
  const w = formWeapon.value
  if (weaponSaveProblems.value.length || weaponSaving.value) return
  weaponSaving.value = true
  weaponStatus.value = ''
  try {
    await writeWeapons(nextWeapons.value)
    editingWeaponId.value = w.id
    weaponStatus.value = `Saved ${w.name}`
  } catch (e) {
    weaponStatus.value = errorText(e)
  } finally {
    weaponSaving.value = false
  }
}

const removeWeapon = async () => {
  const w = weapons.value.find(x => x.id === editingWeaponId.value)
  if (!w || !confirm(`Delete ${w.name}?`)) return
  try {
    await writeWeapons(weapons.value.filter(x => x !== w))
    startNewWeapon()
    weaponStatus.value = `Deleted ${w.name}`
  } catch (e) {
    weaponStatus.value = errorText(e)
  }
}

interface TalentForm {
  name: string
  description: string
  for: TalentAudience
  category: TalentCategory | ''
  icon: string
  branch: string
  level: number | ''
  col?: number
  iqCost: number | ''
  minIQ: number | ''
  maxRanks: number | ''
  requires?: Requirement
  rankRequires: Record<number, Requirement | undefined>
  costOverrides: { ifHasTalent: string; iqCost: number | '' }[]
  perWeapon: boolean
  weaponPrereq: string
  effects: EffectDef[]
  unverified: boolean
}

const LEVELS = Array.from({ length: MAX_LEVEL + 1 }, (_, i) => i)

const blankTalentForm = (): TalentForm => ({
  name: '', description: '', for: 'both', category: '', icon: '', branch: '', level: '', iqCost: '', minIQ: '', maxRanks: 1,
  rankRequires: {}, costOverrides: [], perWeapon: false, weaponPrereq: '', effects: [], unverified: false
})

const talents = ref<TalentNode[]>([])
const talentsError = ref('')

const loadTalents = async () => {
  try {
    const list = await $fetch<unknown>('/api/admin/talents')
    if (!Array.isArray(list)) {
      talentsError.value = 'The talent routes are not running. Restart the dev server.'
      return
    }
    talents.value = list as TalentNode[]
  } catch (e) {
    talentsError.value = errorText(e)
  }
}
onMounted(loadTalents)

const editingTalentId = ref<string>()
const talentForm = ref<TalentForm>(blankTalentForm())
const talentSaving = ref(false)
const talentStatus = ref('')

const talentChoices = computed(() => talents.value.map(t => ({ id: t.id, name: t.name })))

const talentLevels = computed(() => LEVELS
  .map(level => ({ level, talents: talents.value.filter(t => t.pos.row === level) }))
  .filter(g => g.talents.length))

const branchChoices = computed(() => [...new Set(talents.value.map(t => t.branch))])

const perWeaponChoices = computed(() => talents.value.filter(t => t.perWeapon))

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const startNewTalent = () => {
  editingTalentId.value = undefined
  talentForm.value = blankTalentForm()
  talentStatus.value = ''
}

const openTalent = (t: TalentNode) => {
  editingTalentId.value = t.id
  talentForm.value = {
    name: t.name,
    description: t.description,
    for: t.for,
    category: t.category,
    icon: t.icon,
    branch: t.branch,
    level: t.pos.row,
    col: t.pos.col,
    iqCost: t.iqCost,
    minIQ: t.minIQ,
    maxRanks: t.maxRanks,
    requires: t.requires && copy(t.requires),
    rankRequires: copy(t.rankRequires ?? {}),
    costOverrides: (t.costOverrides ?? []).map(o => ({ ...o })),
    perWeapon: !!t.perWeapon,
    weaponPrereq: t.weaponPrereq ?? '',
    effects: copy(t.effects),
    unverified: !!t.unverified
  }
  talentStatus.value = ''
}

const startCol = (f: TalentForm): number => {
  const branch = talents.value.filter(t => t.pos.row === 0 && t.branch === f.branch.trim())
  if (f.level === 0 && branch.length) return Math.max(...branch.map(t => t.pos.col)) + 0.5
  return Math.max(-1, ...talents.value.map(t => t.pos.col)) + 1
}

const extraRanks = computed(() => {
  const max = talentForm.value.maxRanks
  return Number.isInteger(max) ? Array.from({ length: Math.max(0, (max as number) - 1) }, (_, i) => i + 2) : []
})

const formTalent = computed(() => {
  const f = talentForm.value
  const rankRequires = Object.fromEntries(extraRanks.value.flatMap(rank => (f.rankRequires[rank] ? [[rank, f.rankRequires[rank]]] : [])))
  return {
    id: idFromName(f.name),
    name: f.name.trim(),
    description: f.description.trim(),
    for: f.for,
    category: f.category,
    icon: f.icon.trim(),
    branch: f.branch.trim(),
    pos: { col: f.col ?? startCol(f), row: f.level },
    iqCost: f.iqCost,
    minIQ: f.minIQ,
    ...(f.requires ? { requires: f.requires } : {}),
    ...(Object.keys(rankRequires).length ? { rankRequires } : {}),
    ...(f.costOverrides.length ? { costOverrides: f.costOverrides } : {}),
    maxRanks: f.maxRanks,
    ...(f.perWeapon ? { perWeapon: true } : {}),
    ...(f.perWeapon && f.weaponPrereq ? { weaponPrereq: f.weaponPrereq } : {}),
    effects: f.effects,
    ...(f.unverified ? { unverified: true } : {})
  }
})

const updatingTalent = computed(() => !!editingTalentId.value && formTalent.value.id === editingTalentId.value)

const nextTalents = computed(() => arrangeTalents(updatingTalent.value
  ? talents.value.map(t => (t.id === editingTalentId.value ? formTalent.value : t))
  : [...talents.value, formTalent.value]))

const talentSaveProblems = computed(() => talentProblems(nextTalents.value, weapons.value))

const writeTalents = async (list: unknown[]) => {
  await $fetch('/api/admin/talents', { method: 'PUT', body: list })
  talents.value = list as TalentNode[]
}

const saveTalent = async () => {
  const t = formTalent.value
  const list = nextTalents.value
  if (talentSaveProblems.value.length || talentSaving.value) return
  talentSaving.value = true
  talentStatus.value = ''
  try {
    await writeTalents(list)
    editingTalentId.value = t.id
    talentForm.value.col = list.find(x => x.id === t.id)?.pos.col
    talentStatus.value = `Saved ${t.name}`
  } catch (e) {
    talentStatus.value = errorText(e)
  } finally {
    talentSaving.value = false
  }
}

const removeTalent = async () => {
  const t = talents.value.find(x => x.id === editingTalentId.value)
  if (!t || !confirm(`Delete ${t.name}?`)) return
  try {
    await writeTalents(arrangeTalents(talents.value.filter(x => x !== t)))
    startNewTalent()
    talentStatus.value = `Deleted ${t.name}`
  } catch (e) {
    talentStatus.value = errorText(e)
  }
}

const setRankRequire = (rank: number, req: Requirement | undefined) => {
  talentForm.value.rankRequires = { ...talentForm.value.rankRequires, [rank]: req }
}

const addCostOverride = () => {
  talentForm.value.costOverrides = [...talentForm.value.costOverrides, { ifHasTalent: '', iqCost: '' }]
}

const removeCostOverride = (i: number) => {
  talentForm.value.costOverrides = talentForm.value.costOverrides.filter((_, j) => j !== i)
}

const talentIcon = computed(() => talentForm.value.icon.trim())

const talentIconIsSvg = computed(() => isSvgIcon(talentIcon.value))

const talentSvgShown = computed(() => (talentIconIsSvg.value && !svgProblems(talentIcon.value).length ? talentIcon.value : undefined))

const talentIconFilter = ref('')

const talentIconChoices = computed(() => iconChoices(talentForm.value.name, talentIconFilter.value))

const TREE_W = 76
const TREE_H = 92

const treeLinks = computed(() => {
  const list = talents.value
  const byId = new Map(list.map(t => [t.id, t]))
  return list.flatMap(t => parentIds(t, list).flatMap(id => {
    const f = typeof id === 'string' ? byId.get(id) : undefined
    return f ? [{ key: `${f.id}>${t.id}`, x1: (f.pos.col + 0.5) * TREE_W, y1: f.pos.row * TREE_H + 78, x2: (t.pos.col + 0.5) * TREE_W, y2: t.pos.row * TREE_H + 4 }] : []
  }))
})

const treeSize = computed(() => {
  const list = talents.value
  return {
    width: (Math.ceil(Math.max(0, ...list.map(t => t.pos.col))) + 2) * TREE_W,
    height: (Math.max(0, ...list.map(t => t.pos.row)) + 2) * TREE_H
  }
})

const treeDialog = useTemplateRef<HTMLDialogElement>('treeDialog')

const openTree = () => treeDialog.value?.showModal()

const closeTree = () => treeDialog.value?.close()
</script>

<template>
  <div class="page">
    <h1>Admin</h1>

    <div class="layout">
      <div class="tabs">
        <button v-for="c in CREATORS" :key="c.id" :class="{ active: creator === c.id }" @click="creator = c.id">{{ c.label }}</button>
      </div>

      <section v-if="creator === 'icons'" class="box creator">
        <div class="col-panel">
          <header class="col-head">
            <h2>Library</h2>
            <span class="col-line" />
          </header>
          <p v-if="loadError" class="error">{{ loadError }}</p>
          <input v-model="filter" class="field" placeholder="Filter by name or tag">
          <ul class="icon-list">
            <li v-for="i in shown" :key="i.id">
              <button :class="['icon-row', { active: i.id === editingId }]" @click="openIcon(i)">
                <GameIcon :svg="i.svg" :label="i.name" :size="32" :color="gradeColor" />
                <span class="row-text">
                  <span>{{ i.name }}</span>
                  <small>{{ i.tags.join(', ') }}</small>
                </span>
              </button>
            </li>
            <li v-if="!shown.length && !loadError" class="muted">{{ library.length ? 'No match.' : 'No saved icons yet.' }}</li>
          </ul>
        </div>

        <div class="col-panel">
          <header class="col-head">
            <h2>Drafts</h2>
            <span class="col-line" />
          </header>
          <p v-if="draftsError" class="error">{{ draftsError }}</p>

          <template v-if="current">
            <p class="caption">{{ current.caption }}</p>
            <ul v-if="current.problems.length" class="problems">
              <li v-for="p in current.problems" :key="p">⚠ {{ p }}</li>
            </ul>
            <template v-else>
              <div class="stage">
                <GameIcon :svg="current.svg" :size="256" :color="gradeColor" />
              </div>
              <div class="sizes">
                <GameIcon :svg="current.svg" :size="64" :color="gradeColor" />
                <GameIcon :svg="current.svg" :size="32" :color="gradeColor" />
              </div>
              <div class="grades">
                <button
                  v-for="g in GRADE_ORDER"
                  :key="g"
                  :class="['neu-btn', 'small', 'grade-btn', { active: previewGrade === g }]"
                  :style="{ '--grade': GRADES[g].color }"
                  @click="previewGrade = g"
                >
                  {{ GRADES[g].name }}
                </button>
              </div>
            </template>
          </template>
          <p v-else class="muted">{{ drafts.length ? 'Pick a draft.' : 'No drafts yet.' }}</p>

          <template v-if="drafts.length">
            <h3>All drafts</h3>
            <div class="versions">
              <button
                v-for="d in newestFirst"
                :key="d.id"
                :class="['version', { active: selection?.kind === 'draft' && selection.id === d.id }]"
                :title="d.prompt"
                @click="selection = { kind: 'draft', id: d.id }"
              >
                <GameIcon v-if="!d.problems.length" :svg="d.svg" :size="48" :color="gradeColor" />
                <span v-else class="bad-draft">⚠</span>
              </button>
            </div>
          </template>
        </div>

        <div class="col-panel">
          <header class="col-head">
            <h2>Save</h2>
            <span class="col-line" />
          </header>
          <div class="fields">
            <label>Name <input v-model="form.name" class="field" placeholder="Short sword"></label>
            <label>Tags <input v-model="form.tags" class="field" placeholder="weapon, sword"></label>
          </div>
          <ul v-if="current && saveProblems.length" class="problems">
            <li v-for="p in saveProblems" :key="p">⚠ {{ p }}</li>
          </ul>
          <div class="actions">
            <button class="neu-btn save" :disabled="!current || saveProblems.length > 0 || saving" @click="save">
              {{ updatingIcon ? 'Update' : 'Save' }}
            </button>
            <button v-if="selection?.kind === 'draft'" class="neu-btn danger" @click="rejectDraft">Reject</button>
            <button v-if="editingId" class="neu-btn small" @click="startNew">Start new</button>
            <button v-if="editingId" class="neu-btn small danger" @click="removeIcon">Delete</button>
          </div>
          <p v-if="saveStatus" class="muted">{{ saveStatus }}</p>
        </div>
      </section>

      <section v-else-if="creator === 'weapons'" class="box weapon-creator">
        <div class="col-panel">
          <header class="col-head">
            <h2>Weapons</h2>
            <span class="col-line" />
          </header>
          <p v-if="weaponsError" class="error">{{ weaponsError }}</p>
          <ul class="icon-list">
            <li v-for="w in weapons" :key="w.id">
              <button :class="['icon-row', { active: w.id === editingWeaponId }]" @click="openWeapon(w)">
                <span class="row-text">
                  <span>{{ w.name }}</span>
                  <small>{{ weaponLine(w) }}</small>
                </span>
              </button>
            </li>
            <li v-if="!weapons.length && !weaponsError" class="muted">No weapons yet.</li>
          </ul>
        </div>

        <div class="col-panel">
          <header class="col-head">
            <h2>Save</h2>
            <span class="col-line" />
          </header>
          <div class="fields">
            <label>Name <input v-model="weaponForm.name" class="field"></label>
            <label>Talent
              <select v-model="weaponForm.talent" class="field">
                <option value="" disabled>Pick a talent</option>
                <option v-for="t in WEAPON_TALENTS" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </label>
            <label>Damage dice <input v-model.number="weaponForm.dice" type="number" min="0" step="1" class="field"></label>
            <label>Damage modifier <input v-model.number="weaponForm.mod" type="number" step="1" class="field"></label>
            <label>Min ST <input v-model.number="weaponForm.minST" type="number" min="0" step="1" class="field"></label>
            <label>Hands
              <select v-model="weaponForm.hands" class="field">
                <option value="" disabled>Pick hands</option>
                <option :value="1">1</option>
                <option :value="2">2</option>
              </select>
            </label>
            <label>Attack kind
              <select v-model="weaponForm.attackKind" class="field">
                <option value="" disabled>Pick an attack kind</option>
                <option v-for="k in ATTACK_KINDS" :key="k" :value="k">{{ k }}</option>
              </select>
            </label>
            <label v-if="isRangedForm">Range <input v-model.number="weaponForm.range" type="number" min="1" step="1" class="field"></label>
            <label>Cost <input v-model.number="weaponForm.cost" type="number" min="0" step="1" class="field"></label>
            <label class="check"><input v-model="weaponForm.unverified" type="checkbox"> Unverified</label>
          </div>
          <ul v-if="weaponSaveProblems.length" class="problems">
            <li v-for="p in weaponSaveProblems" :key="p">⚠ {{ p }}</li>
          </ul>
          <div class="actions">
            <button class="neu-btn save" :disabled="weaponSaveProblems.length > 0 || weaponSaving" @click="saveWeapon">
              {{ updatingWeapon ? 'Update' : 'Save' }}
            </button>
            <button v-if="editingWeaponId" class="neu-btn small" @click="startNewWeapon">Start new</button>
            <button v-if="editingWeaponId" class="neu-btn small danger" @click="removeWeapon">Delete</button>
          </div>
          <p v-if="weaponStatus" class="muted">{{ weaponStatus }}</p>
        </div>

        <div class="side">
          <div class="col-panel">
            <header class="col-head">
              <h2>Icon</h2>
              <span class="col-line" />
            </header>
            <div v-if="weaponSvgShown || (weaponIcon && !weaponIconIsSvg)" class="sizes">
              <GameIcon v-if="weaponSvgShown" :svg="weaponSvgShown" :label="weaponForm.name" :size="64" />
              <span v-else class="emoji">{{ weaponIcon }}</span>
            </div>
            <div class="fields">
              <label>Icon <textarea v-model="weaponForm.icon" rows="4" class="field svg-text" placeholder="Emoji or SVG" /></label>
            </div>
            <div v-if="weaponIcon" class="actions">
              <button class="neu-btn small danger" @click="weaponForm.icon = ''">Remove icon</button>
            </div>
            <h3>Library</h3>
            <input v-model="weaponIconFilter" class="field" placeholder="Filter by name or tag">
            <div class="versions picker">
              <button
                v-for="i in weaponIconChoices"
                :key="i.id"
                :class="['version', { active: weaponIcon === i.svg }]"
                :title="i.name"
                @click="weaponForm.icon = i.svg"
              >
                <GameIcon :svg="i.svg" :label="i.name" :size="48" />
              </button>
            </div>
            <p v-if="!weaponIconChoices.length" class="muted">{{ library.length ? 'No match.' : 'No saved icons yet.' }}</p>
          </div>

          <div class="col-panel">
            <ReferenceGuide :weapons="weapons" :talents="talents" />
          </div>
        </div>
      </section>

      <section v-else-if="creator === 'talents'" class="box talent-creator">
        <div class="col-panel">
          <header class="col-head">
            <h2>Talents</h2>
            <span class="col-line" />
          </header>
          <p v-if="talentsError" class="error">{{ talentsError }}</p>
          <details v-for="g in talentLevels" :key="g.level" class="level-group" open>
            <summary>{{ g.level === 0 ? 'Base' : `Level ${g.level}` }}</summary>
            <ul class="icon-list">
              <li v-for="t in g.talents" :key="t.id">
                <button :class="['icon-row', { active: t.id === editingTalentId }]" @click="openTalent(t)">
                  <span class="row-text">
                    <span>{{ t.name }}</span>
                    <small>{{ t.branch }} · {{ t.category }}</small>
                  </span>
                </button>
              </li>
            </ul>
          </details>
          <p v-if="!talents.length && !talentsError" class="muted">No talents yet.</p>
        </div>

        <div class="col-panel">
          <header class="col-head">
            <h2>Save</h2>
            <span class="col-line" />
          </header>
          <div class="fields">
            <label>Name <input v-model="talentForm.name" class="field"></label>
            <label>Description <textarea v-model="talentForm.description" rows="3" class="field desc-text" /></label>
            <label>Category
              <select v-model="talentForm.category" class="field">
                <option value="" disabled>Pick a category</option>
                <option v-for="c in TALENT_CATEGORIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <label>Branch
              <input v-model="talentForm.branch" class="field" list="talent-branches">
              <datalist id="talent-branches">
                <option v-for="b in branchChoices" :key="b" :value="b" />
              </datalist>
            </label>
            <label>Level
              <select v-model="talentForm.level" class="field">
                <option value="" disabled>Pick a level</option>
                <option v-for="l in LEVELS" :key="l" :value="l">{{ l === 0 ? 'Base' : l }}</option>
              </select>
            </label>
            <label>For
              <select v-model="talentForm.for" class="field">
                <option v-for="a in TALENT_AUDIENCES" :key="a" :value="a">{{ a }}</option>
              </select>
            </label>
            <label>IQ cost <input v-model.number="talentForm.iqCost" type="number" min="0" step="1" class="field"></label>
            <label>Min IQ <input v-model.number="talentForm.minIQ" type="number" min="0" step="1" class="field"></label>
            <label>Max ranks <input v-model.number="talentForm.maxRanks" type="number" min="1" step="1" class="field"></label>
            <label class="check"><input v-model="talentForm.unverified" type="checkbox"> Unverified</label>
          </div>

          <h3>Needs</h3>
          <RequirementEditor v-model="talentForm.requires" :talents="talentChoices" />

          <template v-for="rank in extraRanks" :key="rank">
            <h3>Rank {{ rank }} also needs</h3>
            <RequirementEditor
              :model-value="talentForm.rankRequires[rank]"
              :talents="talentChoices"
              @update:model-value="setRankRequire(rank, $event)"
            />
          </template>

          <h3>Cost overrides</h3>
          <div class="fields">
            <div v-for="(o, i) in talentForm.costOverrides" :key="i" class="override">
              <select v-model="o.ifHasTalent" class="field">
                <option value="" disabled>If has talent</option>
                <option v-for="t in talentChoices" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
              <input v-model.number="o.iqCost" type="number" min="0" step="1" class="field" placeholder="IQ cost">
              <button class="neu-btn small danger" @click="removeCostOverride(i)">Remove</button>
            </div>
          </div>
          <div class="actions">
            <button class="neu-btn small" @click="addCostOverride">Add</button>
          </div>

          <h3>Per weapon</h3>
          <div class="fields">
            <label class="check"><input v-model="talentForm.perWeapon" type="checkbox"> Taken once per weapon talent</label>
            <label v-if="talentForm.perWeapon">Weapon prerequisite
              <select v-model="talentForm.weaponPrereq" class="field">
                <option value="">None</option>
                <option v-for="t in perWeaponChoices" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </label>
          </div>

          <ul v-if="talentSaveProblems.length" class="problems">
            <li v-for="p in talentSaveProblems" :key="p">⚠ {{ p }}</li>
          </ul>
          <div class="actions">
            <button class="neu-btn save" :disabled="talentSaveProblems.length > 0 || talentSaving" @click="saveTalent">
              {{ updatingTalent ? 'Update' : 'Save' }}
            </button>
            <button v-if="editingTalentId" class="neu-btn small" @click="startNewTalent">Start new</button>
            <button v-if="editingTalentId" class="neu-btn small danger" @click="removeTalent">Delete</button>
          </div>
          <p v-if="talentStatus" class="muted">{{ talentStatus }}</p>
        </div>

        <div class="side">
          <div class="col-panel">
            <header class="col-head">
              <h2>Tree</h2>
              <span class="col-line" />
            </header>
            <button class="neu-btn open-tree" title="Open tree" aria-label="Open tree" @click="openTree">⤢</button>
            <dialog ref="treeDialog" class="tree-dialog">
              <header class="col-head">
                <h2>Tree</h2>
                <span class="col-line" />
                <button class="neu-btn small" @click="closeTree">Close</button>
              </header>
              <div class="tree-scroll">
                <div class="talent-tree" :style="{ width: `${treeSize.width}px`, height: `${treeSize.height}px` }">
                  <svg class="tree-lines" :width="treeSize.width" :height="treeSize.height" aria-hidden="true">
                    <line v-for="l in treeLinks" :key="l.key" :x1="l.x1" :y1="l.y1" :x2="l.x2" :y2="l.y2" />
                  </svg>
                  <div
                    v-for="t in talents"
                    :key="t.id"
                    :class="['tree-node', { editing: t.id === editingTalentId }]"
                    :style="{ left: `${t.pos.col * TREE_W}px`, top: `${t.pos.row * TREE_H}px`, width: `${TREE_W}px` }"
                  >
                    <span class="tree-art">
                      <GameIcon v-if="isSvgIcon(t.icon)" :svg="t.icon" :label="t.name" :size="26" />
                      <template v-else>{{ t.icon }}</template>
                    </span>
                    <span class="tree-name">{{ t.name }}</span>
                  </div>
                </div>
              </div>
            </dialog>
          </div>

          <div class="col-panel">
            <header class="col-head">
              <h2>Icon</h2>
              <span class="col-line" />
            </header>
            <div v-if="talentSvgShown || (talentIcon && !talentIconIsSvg)" class="sizes">
              <GameIcon v-if="talentSvgShown" :svg="talentSvgShown" :label="talentForm.name" :size="64" />
              <span v-else class="emoji">{{ talentIcon }}</span>
            </div>
            <div class="fields">
              <label>Icon <textarea v-model="talentForm.icon" rows="4" class="field svg-text" placeholder="Emoji or SVG" /></label>
            </div>
            <div v-if="talentIcon" class="actions">
              <button class="neu-btn small danger" @click="talentForm.icon = ''">Remove icon</button>
            </div>
            <h3>Library</h3>
            <input v-model="talentIconFilter" class="field" placeholder="Filter by name or tag">
            <div class="versions picker">
              <button
                v-for="i in talentIconChoices"
                :key="i.id"
                :class="['version', { active: talentIcon === i.svg }]"
                :title="i.name"
                @click="talentForm.icon = i.svg"
              >
                <GameIcon :svg="i.svg" :label="i.name" :size="48" />
              </button>
            </div>
            <p v-if="!talentIconChoices.length" class="muted">{{ library.length ? 'No match.' : 'No saved icons yet.' }}</p>
          </div>

          <div class="col-panel">
            <ReferenceGuide :weapons="weapons" :talents="talents" />
          </div>
        </div>
      </section>

      <section v-else class="box">
        <div class="col-panel">
          <header class="col-head">
            <h2>{{ CREATORS.find(c => c.id === creator)?.label }}</h2>
            <span class="col-line" />
          </header>
          <p class="muted">Not built yet.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 16px;
}

h1 {
  margin: 0 0 16px;
  font-size: 1.4rem;
}

.layout {
  --panel: #2b2e34;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.box {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}

.creator {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

.weapon-creator {
  display: grid;
  grid-template-columns: 260px minmax(0, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.talent-creator {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: start;
}

@media (max-width: 1000px) {
  .creator,
  .weapon-creator,
  .talent-creator {
    grid-template-columns: minmax(0, 1fr);
  }
}

.col-panel {
  padding: 14px 16px 16px;
  border-radius: 16px;
  background: var(--panel);
  box-shadow: inset 4px 4px 10px rgba(0, 0, 0, 0.55), inset -3px -3px 8px rgba(255, 255, 255, 0.05);
}

.col-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.col-head h2 {
  margin: 0;
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  white-space: nowrap;
}

.col-line {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, color-mix(in srgb, var(--accent) 45%, var(--muted)), transparent);
}

h3 {
  margin: 16px 0 8px;
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tabs {
  align-self: flex-start;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.55), inset -3px -3px 7px rgba(255, 255, 255, 0.05);
}

.tabs button {
  padding: 6px 20px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  transition: box-shadow 0.15s, color 0.15s;
}

.tabs button:hover {
  color: var(--fg);
}

.tabs .active {
  background: var(--panel);
  color: var(--fg);
  box-shadow: 3px 3px 7px rgba(0, 0, 0, 0.55), -2px -2px 6px rgba(255, 255, 255, 0.06);
}

:deep(.neu-btn) {
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: var(--panel);
  box-shadow: 4px 4px 9px rgba(0, 0, 0, 0.55), -3px -3px 8px rgba(255, 255, 255, 0.06);
  transition: box-shadow 0.15s, transform 0.15s, color 0.15s;
}

:deep(.neu-btn:hover:not(:disabled)) {
  color: #fff;
  transform: translateY(-1px);
  box-shadow: 6px 6px 14px rgba(0, 0, 0, 0.6), -4px -4px 11px rgba(255, 255, 255, 0.08);
}

:deep(.neu-btn:active:not(:disabled)) {
  transform: none;
  box-shadow: inset 3px 3px 7px rgba(0, 0, 0, 0.6), inset -2px -2px 6px rgba(255, 255, 255, 0.05);
}

:deep(.neu-btn:disabled) {
  opacity: 0.4;
  box-shadow: none;
  cursor: default;
}

:deep(.small) {
  padding: 4px 12px;
  font-size: 0.8rem;
}

:deep(.danger) {
  color: #e07a6a;
}

:deep(.field) {
  width: 100%;
  min-width: 0;
  padding: 7px 12px;
  border: none;
  border-radius: 12px;
  background: var(--panel);
  color: var(--fg);
  box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.55), inset -2px -2px 5px rgba(255, 255, 255, 0.05);
}

:deep(.field:focus) {
  outline: none;
  box-shadow:
    inset 2px 2px 5px rgba(0, 0, 0, 0.55),
    inset -2px -2px 5px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent);
}

.caption {
  margin: 0 0 12px;
  font-size: 0.85rem;
}

.bad-draft {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  color: #e07a6a;
}

.icon-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.icon-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: var(--panel);
  text-align: left;
  box-shadow: 3px 3px 7px rgba(0, 0, 0, 0.5), -2px -2px 6px rgba(255, 255, 255, 0.05);
}

.icon-row.active,
.version.active {
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.55),
    inset -3px -3px 7px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px color-mix(in srgb, var(--accent) 70%, transparent);
}

.row-text {
  display: grid;
  min-width: 0;
}

.row-text small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
}

.stage {
  display: grid;
  place-items: center;
  padding: 24px;
  border-radius: 16px;
  background:
    repeating-conic-gradient(rgba(255, 255, 255, 0.03) 0 25%, transparent 0 50%) 0 0 / 16px 16px,
    var(--panel);
  box-shadow: inset 4px 4px 10px rgba(0, 0, 0, 0.55), inset -3px -3px 8px rgba(255, 255, 255, 0.05);
}

.sizes {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 16px;
  margin: 16px 0;
}

.grades {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.grade-btn {
  color: color-mix(in srgb, var(--grade) 85%, white);
}

.grade-btn.active {
  box-shadow:
    inset 3px 3px 7px rgba(0, 0, 0, 0.6),
    inset -2px -2px 6px rgba(255, 255, 255, 0.05),
    inset 0 0 0 1.5px color-mix(in srgb, var(--grade) 75%, transparent);
}

.versions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.version {
  display: grid;
  place-items: center;
  padding: 6px;
  border: none;
  border-radius: 12px;
  background: var(--panel);
  box-shadow: 3px 3px 7px rgba(0, 0, 0, 0.5), -2px -2px 6px rgba(255, 255, 255, 0.05);
}

.fields {
  display: grid;
  gap: 10px;
}

.fields label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 0.75rem;
}

.fields .check {
  display: flex;
  align-items: center;
  gap: 8px;
}

.emoji {
  font-size: 48px;
  line-height: 64px;
}

.svg-text {
  font-family: monospace;
  font-size: 0.75rem;
  resize: vertical;
}

.picker {
  margin-top: 12px;
}

.save {
  font-weight: 700;
}

.problems {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  color: #e07a6a;
  font-size: 0.8rem;
}

.desc-text {
  font: inherit;
  resize: vertical;
}

.override {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px auto;
  align-items: center;
  gap: 6px;
}

.level-group + .level-group {
  margin-top: 14px;
}

.level-group summary {
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
}

.side {
  display: grid;
  gap: 16px;
  align-content: start;
}

.open-tree {
  font-size: 1.4rem;
}

.tree-dialog {
  width: calc(100vw - 32px);
  max-width: none;
  height: calc(100vh - 32px);
  max-height: none;
  padding: 14px 16px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
  color: var(--fg);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

.tree-dialog[open] {
  display: flex;
  flex-direction: column;
}

.tree-dialog::backdrop {
  background: rgba(10, 8, 6, 0.6);
}

.tree-scroll {
  flex: 1;
  overflow: auto;
}

.talent-tree {
  position: relative;
}

.tree-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.tree-lines line {
  stroke: color-mix(in srgb, var(--muted) 45%, transparent);
  stroke-width: 2;
}

.tree-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 6px;
  user-select: none;
}

.tree-art {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--panel);
  box-shadow: 4px 4px 9px rgba(0, 0, 0, 0.55), -3px -3px 8px rgba(255, 255, 255, 0.06);
  font-size: 1.3rem;
}

.tree-name {
  max-height: 2.4em;
  overflow: hidden;
  font-size: 0.68rem;
  line-height: 1.2;
  text-align: center;
}


.tree-node.editing .tree-art {
  box-shadow:
    4px 4px 9px rgba(0, 0, 0, 0.55),
    -3px -3px 8px rgba(255, 255, 255, 0.06),
    inset 0 0 0 2px color-mix(in srgb, var(--accent) 75%, transparent);
}

.muted {
  color: var(--muted);
  font-size: 0.85rem;
}

.error {
  color: #e07a6a;
  font-size: 0.85rem;
}
</style>
