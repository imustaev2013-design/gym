import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { dateStr } from '../logic'
import { fmtDate } from '../stats'
import LineChart from './LineChart'

export default function BodyWeight() {
  const entries = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? []
  const [v, setV] = useState('')
  const [d, setD] = useState(dateStr())
  const kg = parseFloat(v.replace(',', '.'))
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? (a.id ?? 0) - (b.id ?? 0) : a.date < b.date ? -1 : 1))

  return (
    <>
      <div className="inline">
        <label className="field grow">
          <input inputMode="decimal" placeholder="Вес" value={v} onChange={(e) => setV(e.target.value)} />
          <small>кг</small>
        </label>
        <input className="comment date" type="date" value={d} max={dateStr()} onChange={(e) => setD(e.target.value)} />
        <button
          className="btn small"
          disabled={!(kg > 20 && kg < 300)}
          onClick={async () => {
            await db.bodyWeights.add({ date: d || dateStr(), kg: Math.round(kg * 10) / 10 })
            setV('')
          }}
        >
          Добавить
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <LineChart points={sorted.map((e) => ({ date: e.date, value: e.kg }))} />
      </div>

      <div className="sheet-label">Записи</div>
      {!sorted.length && <p className="muted">Пока нет записей.</p>}
      {[...sorted].reverse().map((e) => (
        <div key={e.id} className="hist-ex rec-row">
          <span>
            {fmtDate(e.date, true)} · <b>{String(e.kg).replace('.', ',')} кг</b>
          </span>
          <button className="muted" onClick={() => confirm('Удалить запись?') && db.bodyWeights.delete(e.id!)}>
            Удалить
          </button>
        </div>
      ))}
    </>
  )
}
