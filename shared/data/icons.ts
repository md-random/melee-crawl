import type { IconSpec } from '../types'
import ICON_LIST from './icons.json'

export const ICONS: Record<string, IconSpec> = Object.fromEntries((ICON_LIST as IconSpec[]).map(i => [i.id, i]))
