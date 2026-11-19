import Dexie, { type Table } from 'dexie'
import type { Workout } from './types'

class GymDB extends Dexie {
  workouts!: Table<Workout, number>
  bodyWeights!: Table<{ id?: number; date: string; kg: number }, number>
  photos!: Table<{ id?: number; date: string; blob: Blob }, number>
  settings!: Table<{ key: string; value: unknown }, string>
  /** Личные рекорды на раз, вводятся вручную (для подтягиваний — доп. вес) */
  records!: Table<{ id?: number; exId: string; date: string; kg: number }, number>

  constructor() {
    super('gym')
    this.version(1).stores({
      workouts: '++id, date, dayId',
      bodyWeights: '++id, date',
      photos: '++id, date',
      settings: 'key',
    })
    this.version(2).stores({ records: '++id, exId, date' })
  }
}

export const db = new GymDB()

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* не критично */
  }
}
