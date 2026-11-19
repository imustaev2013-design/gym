import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { buildBackup, markBackup, restoreBackup } from '../backup'
import { fmtDate } from '../stats'

export default function Backup() {
  const last = useLiveQuery(async () => (await db.settings.get('lastBackup'))?.value as string | undefined, [])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const prepare = async () => {
    setBusy(true)
    setMsg(null)
    try {
      setFile(await buildBackup())
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось подготовить файл')
    } finally {
      setBusy(false)
    }
  }

  // Share нужно вызывать сразу по нажатию, поэтому файл готовится заранее отдельным шагом
  const share = async () => {
    if (!file) return
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Бэкап «Зал»' })
        await markBackup()
        setMsg('Бэкап отправлен.')
      } else {
        download()
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('Не удалось поделиться. Попробуй «Скачать файл».')
    }
  }
  const download = () => {
    if (!file) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = file.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10000)
    markBackup()
    setMsg('Файл скачан.')
  }

  const restore = async (f: File | undefined) => {
    if (!f) return
    if (!confirm('Заменить все данные в приложении данными из файла? Текущие данные будут удалены.')) return
    setBusy(true)
    try {
      await restoreBackup(f)
      setMsg('Готово, данные восстановлены.')
      setTimeout(() => location.reload(), 800)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Не удалось восстановить данные')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p className="meta">Последний бэкап: {last ? fmtDate(last, true) : 'ещё не делали'}</p>

      <div className="sheet-label">Экспорт</div>
      <p className="meta">Все данные, включая фото, сохраняются в один файл. Его можно отправить в «Файлы» или по AirDrop на MacBook.</p>
      {!file ? (
        <button className="btn small" disabled={busy} onClick={prepare}>
          {busy ? 'Готовлю файл…' : 'Подготовить бэкап'}
        </button>
      ) : (
        <div className="inline">
          <button className="btn small" onClick={share}>
            Поделиться
          </button>
          <button className="btn small" onClick={download}>
            Скачать файл
          </button>
        </div>
      )}

      <div className="sheet-label" style={{ marginTop: 24 }}>
        Импорт
      </div>
      <p className="meta">Восстановление из файла бэкапа. Текущие данные в приложении будут заменены.</p>
      <label className="btn small file-btn">
        Выбрать файл
        <input type="file" accept=".json,application/json" hidden disabled={busy} onChange={(e) => (restore(e.target.files?.[0]), (e.target.value = ''))} />
      </label>

      {msg && <p className="meta" style={{ marginTop: 16 }}>{msg}</p>}
    </>
  )
}
