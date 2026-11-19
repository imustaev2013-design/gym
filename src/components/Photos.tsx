import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { compressImage } from '../backup'
import { dateStr } from '../logic'
import { fmtDate } from '../stats'

type Photo = { id?: number; date: string; blob: Blob }

function useUrls(photos: Photo[]) {
  const urls = useMemo(() => new Map(photos.map((p) => [p.id!, URL.createObjectURL(p.blob)])), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

export default function Photos() {
  const raw = useLiveQuery(() => db.photos.toArray(), [])
  const photos = useMemo(() => [...(raw ?? [])].sort((a, b) => (a.date === b.date ? (a.id ?? 0) - (b.id ?? 0) : a.date < b.date ? -1 : 1)), [raw])
  const urls = useUrls(photos)
  const [view, setView] = useState<Photo | null>(null)
  const [compare, setCompare] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    try {
      for (const f of Array.from(files)) {
        await db.photos.add({ date: dateStr(), blob: await compressImage(f) })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Не удалось сохранить фото')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="inline">
        <label className="btn small file-btn">
          {busy ? 'Сохраняю…' : 'Добавить фото'}
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
        </label>
        {photos.length >= 2 && (
          <button className="btn small" onClick={() => setCompare((c) => !c)}>
            {compare ? 'Галерея' : 'Сравнить'}
          </button>
        )}
      </div>
      <p className="meta">Можно выбрать из галереи или снять камерой. Фото хранятся только в приложении и сжимаются до 1200 px.</p>
      {err && <p className="meta">{err}</p>}

      {compare && photos.length >= 2 ? (
        <Compare photos={photos} urls={urls} />
      ) : (
        <>
          {!photos.length && <p className="muted">Пока нет фото.</p>}
          <div className="grid">
            {[...photos].reverse().map((p) => (
              <button key={p.id} className="thumb" onClick={() => setView(p)}>
                <img src={urls.get(p.id!)} alt="" />
                <span>{fmtDate(p.date)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {view && (
        <div className="viewer">
          <img src={urls.get(view.id!)} alt="" />
          <div className="viewer-bar">
            <span>{fmtDate(view.date, true)}</span>
            <button
              onClick={async () => {
                if (confirm('Удалить фото? Это нельзя отменить.')) {
                  await db.photos.delete(view.id!)
                  setView(null)
                }
              }}
            >
              Удалить
            </button>
            <button onClick={() => setView(null)}>Закрыть</button>
          </div>
        </div>
      )}
    </>
  )
}

function Compare({ photos, urls }: { photos: Photo[]; urls: Map<number, string> }) {
  const [a, setA] = useState(photos[0].id!)
  const [b, setB] = useState(photos.at(-1)!.id!)
  const opt = (p: Photo) => (
    <option key={p.id} value={p.id}>
      {fmtDate(p.date, true)}
    </option>
  )
  return (
    <div className="compare">
      <div>
        <select value={a} onChange={(e) => setA(+e.target.value)}>
          {photos.map(opt)}
        </select>
        <img src={urls.get(a)} alt="" />
      </div>
      <div>
        <select value={b} onChange={(e) => setB(+e.target.value)}>
          {photos.map(opt)}
        </select>
        <img src={urls.get(b)} alt="" />
      </div>
    </div>
  )
}
