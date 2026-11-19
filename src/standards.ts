import { useLiveQuery } from 'dexie-react-hooks'
import data from '../standards.json'
import { db } from './db'

export const LEVEL_NAMES = ['Начинающий', 'Новичок', 'Средний', 'Продвинутый', 'Элита']

export interface Profile {
  sex: 'm' | 'f'
  age: number
}

export function useProfile(): Profile | null | undefined {
  return useLiveQuery(async () => ((await db.settings.get('profile'))?.value as Profile | undefined) ?? null, [])
}
export const saveProfile = (p: Profile) => db.settings.put({ key: 'profile', value: p })

/** Грубая поправка на возраст: до 22 и после 39 пороги чуть ниже */
function ageFactor(age: number): number {
  if (age <= 17) return 0.85
  if (age <= 22) return 0.95
  if (age <= 39) return 1
  return Math.max(0.6, 1 - 0.008 * (age - 39))
}

const table = data.exercises as Record<string, { m: number[]; f: number[] }>
const PCT = data.percentiles

export interface Rating {
  pct: number
  /** индекс достигнутого уровня, -1 — ниже Beginner */
  level: number
  next?: { name: string; oneRM: number }
}

export const hasStandard = (exId: string) => !!table[exId]

export function rate(exId: string, profile: Profile, oneRM: number, bodyKg: number): Rating | null {
  const row = table[exId]
  if (!row || !(bodyKg > 0)) return null
  const f = ageFactor(profile.age)
  const t = row[profile.sex].map((x) => x * f)
  const ratio = oneRM / bodyKg
  const xs = [0, ...t, t[4] * 1.3]
  const ys = [0, ...PCT, 99]
  let pct = 99
  for (let i = 1; i < xs.length; i++) {
    if (ratio <= xs[i]) {
      pct = ys[i - 1] + ((ratio - xs[i - 1]) / (xs[i] - xs[i - 1])) * (ys[i] - ys[i - 1])
      break
    }
  }
  const level = t.reduce((acc, x, i) => (ratio >= x ? i : acc), -1)
  const next = level < 4 ? { name: LEVEL_NAMES[level + 1], oneRM: t[level + 1] * bodyKg } : undefined
  return { pct: Math.round(pct), level, next }
}
