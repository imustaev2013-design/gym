import { db } from './db'
import { dateStr } from './logic'

const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(r.error)
    r.readAsDataURL(b)
  })

/** Все данные (включая фото) — в один JSON-файл */
export async function buildBackup(): Promise<File> {
  const [workouts, bodyWeights, records, settings, photos] = await Promise.all([
    db.workouts.toArray(),
    db.bodyWeights.toArray(),
    db.records.toArray(),
    db.settings.toArray(),
    db.photos.toArray(),
  ])
  const ph = await Promise.all(photos.map(async (p) => ({ id: p.id, date: p.date, data: await toDataUrl(p.blob) })))
  const json = JSON.stringify({
    app: 'gym-log',
    version: 1,
    exportedAt: new Date().toISOString(),
    workouts,
    bodyWeights,
    records,
    settings: settings.filter((s) => s.key !== 'lastBackup'),
    photos: ph,
  })
  return new File([json], `gym-backup-${dateStr()}.json`, { type: 'application/json' })
}

export const markBackup = () => db.settings.put({ key: 'lastBackup', value: dateStr() })

/** Полная замена текущих данных данными из файла */
export async function restoreBackup(file: File) {
  let data: any
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error('Не удалось прочитать файл')
  }
  if (data?.app !== 'gym-log') throw new Error('Это не файл бэкапа приложения')
  const photos = await Promise.all(
    (data.photos ?? []).map(async (p: { id?: number; date: string; data: string }) => ({
      id: p.id,
      date: p.date,
      blob: await (await fetch(p.data)).blob(),
    })),
  )
  await db.transaction('rw', db.workouts, db.bodyWeights, db.records, db.settings, db.photos, async () => {
    await Promise.all([db.workouts.clear(), db.bodyWeights.clear(), db.records.clear(), db.photos.clear()])
    await db.settings.where('key').notEqual('lastBackup').delete()
    await db.workouts.bulkAdd(data.workouts ?? [])
    await db.bodyWeights.bulkAdd(data.bodyWeights ?? [])
    await db.records.bulkAdd(data.records ?? [])
    await db.settings.bulkPut(data.settings ?? [])
    await db.photos.bulkAdd(photos)
  })
}

/** Сжатие фото до ~1200px по длинной стороне, JPEG 0.8 */
export async function compressImage(file: File, max = 1200): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close?.()
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось сжать фото'))), 'image/jpeg', 0.8))
}
