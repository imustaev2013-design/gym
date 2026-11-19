export type ExType = 'barbell' | 'dumbbell' | 'block' | 'bodyweight'

export interface PlanExercise {
  id: string
  name: string
  variant?: string
  sets: number
  reps: [number, number]
  type: ExType
  step: number
  perLeg?: boolean
}
export interface PlanDay {
  id: string
  title: string
  /** короткое название для шапки: «A1 · Грудь» */
  short?: string
  exercises: PlanExercise[]
}
export interface Plan {
  cycle: string[]
  restAfter: string[]
  days: PlanDay[]
}

export interface SetLog {
  /** Рабочий вес; для подтягиваний — дополнительный вес (0 по умолчанию) */
  weight: number | null
  reps: number | null
  done: boolean
  doneAt?: number
}
export interface ExLog {
  exId: string
  skipped: boolean
  sets: SetLog[]
  status?: 'easy' | 'normal' | 'hard'
  comment?: string
  tags?: string[]
}
export interface Workout {
  id?: number
  date: string // YYYY-MM-DD, локальная дата
  dayId: string
  exercises: ExLog[]
  comment?: string
  tags?: string[]
  startedAt?: number
  finishedAt?: number
  /** нажата «Завершить тренировку» */
  finished?: boolean
}
