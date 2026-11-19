import { saveProfile, useProfile } from '../standards'

export type Theme = 'auto' | 'light' | 'dark'
export type Size = 's' | 'm' | 'l'

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([k, label]) => (
        <button key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export default function Settings({ theme, size, onTheme, onSize }: { theme: Theme; size: Size; onTheme: (t: Theme) => void; onSize: (s: Size) => void }) {
  const profile = useProfile()
  const sex = profile?.sex ?? 'm'
  const age = profile?.age

  return (
    <>
      <div className="sheet-label">Пол</div>
      <Seg
        value={profile ? sex : ('' as 'm')}
        options={[
          ['m', 'Мужчина'],
          ['f', 'Женщина'],
        ]}
        onChange={(v) => saveProfile({ sex: v, age: age ?? 30 })}
      />

      <div className="sheet-label">Возраст</div>
      <label className="field wide">
        <input
          key={age ?? 'none'}
          inputMode="numeric"
          placeholder="—"
          defaultValue={age ?? ''}
          onBlur={(e) => {
            const v = parseInt(e.target.value, 10)
            if (v >= 10 && v <= 100 && v !== age) saveProfile({ sex, age: v })
          }}
        />
        <small>лет</small>
      </label>
      <p className="meta">Пол и возраст нужны для процентилей в разделе «Достижения». Вес тела берётся из раздела «Вес тела».</p>

      <div className="sheet-label" style={{ marginTop: 20 }}>
        Тема
      </div>
      <Seg
        value={theme}
        options={[
          ['auto', 'Как в системе'],
          ['light', 'Светлая'],
          ['dark', 'Тёмная'],
        ]}
        onChange={onTheme}
      />

      <div className="sheet-label">Размер интерфейса</div>
      <Seg
        value={size}
        options={[
          ['s', 'Мелко'],
          ['m', 'Средне'],
          ['l', 'Крупно'],
        ]}
        onChange={onSize}
      />
    </>
  )
}
