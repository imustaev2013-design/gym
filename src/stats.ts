import { plan } from './logic'
import type { ExLog, PlanExercise, Workout } from './types'

export const exById = (exId: string): PlanExercise | undefined =>
  plan.days.flatMap((d) => d.exercises).find((e) => e.id === exId)

/** Коэффициент: 1RM = вес × k(повторы). Среднее формул Эпли и Бжицки */
export function k(reps: number): number {
  if (reps <= 1) return 1
  const epley = 1 + reps / 30
  const brzycki = 36 / (37 - reps)
  return (epley + brzycki) / 2
}

export function setOneRM(weight: number, reps: number): number | null {
  if (!(weight > 0) || !(reps > 0) || reps >= 37) return null
  return weight * k(reps)
}

export interface BodyEntry {
  date: string
  kg: number
}

/** Вес тела на дату: последняя запись не позже даты, иначе самая ранняя */
export function bodyOn(date: string, entries: BodyEntry[]): number | null {
  if (!entries.length) return null
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  const before = sorted.filter((e) => e.date <= date)
  return (before.at(-1) ?? sorted[0]).kg
}

export interface Point {
  date: string
  /** рабочий вес (для подтягиваний — доп. вес) */
  weight: number
  oneRM: number | null
  /** лучший подход по 1RM сделан на >12 повторов */
  inexact: boolean
}

export const doneSets = (l: ExLog) => l.sets.filter((s) => s.done && (s.reps ?? 0) > 0)

export function exerciseHistory(exId: string, workouts: Workout[], body: BodyEntry[]): Point[] {
  const ex = exById(exId)
  const bw = ex?.type === 'bodyweight'
  const pts: Point[] = []
  for (const w of [...workouts].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const log = w.exercises.find((e) => e.exId === exId)
    if (!log || log.skipped) continue
    const sets = doneSets(log)
    if (!sets.length) continue
    const base = bw ? bodyOn(w.date, body) : 0
    let best: number | null = null
    let inexact = false
    for (const s of sets) {
      if (base == null) break
      const r = setOneRM(base + (s.weight ?? 0), s.reps!)
      if (r != null && (best == null || r > best)) {
        best = r
        inexact = s.reps! > 12
      }
    }
    pts.push({ date: w.date, weight: Math.max(...sets.map((s) => s.weight ?? 0)), oneRM: best, inexact })
  }
  return pts
}

const nf = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
export const fmtKg = (n: number) => nf(Math.round(n * 2) / 2 === n ? n : Math.round(n * 10) / 10)

/** «60 × 6, 6, 5» */
export function setsLine(ex: PlanExercise | undefined, log: ExLog): string {
  const sets = doneSets(log)
  if (!sets.length) return ''
  const bw = ex?.type === 'bodyweight'
  const prefix = bw ? '+' : ''
  const ws = sets.map((s) => s.weight ?? 0)
  const reps = sets.map((s) => s.reps)
  if (ws.every((x) => x === ws[0])) {
    if (bw && ws[0] === 0) return reps.join(', ')
    return `${prefix}${nf(ws[0])} × ${reps.join(', ')}`
  }
  return sets.map((s) => `${prefix}${nf(s.weight ?? 0)}×${s.reps}`).join(', ')
}

export function fmtDate(date: string, long = false): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(
    'ru-RU',
    long ? { weekday: 'short', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' },
  )
}
