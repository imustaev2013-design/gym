import { useState } from 'react'
import { TAGS } from '../logic'

/** Теги одним тапом + комментарий (к упражнению или ко всей тренировке) */
export default function Notes({
  title,
  tags,
  comment,
  extra,
  alwaysOpen,
  onTags,
  onComment,
}: {
  title: string
  tags?: string[]
  comment?: string
  extra?: string
  alwaysOpen?: boolean
  onTags: (t: string[]) => void
  onComment: (c: string) => void
}) {
  const filled = !!(tags?.length || comment)
  const [open, setOpen] = useState(!!alwaysOpen || filled)
  if (!open)
    return (
      <button className="m-link" onClick={() => setOpen(true)}>
        + {title.toLowerCase()}
      </button>
    )
  return (
    <div className="notes">
      {alwaysOpen && <div className="notes-title">{title}</div>}
      {extra && <div className="meta">{extra}</div>}
      <div className="chips">
        {TAGS.map((t) => {
          const on = !!tags?.includes(t)
          return (
            <button key={t} className={on ? 'on' : ''} onClick={() => onTags(on ? tags!.filter((x) => x !== t) : [...(tags ?? []), t])}>
              {t}
            </button>
          )
        })}
      </div>
      <input
        className="comment"
        placeholder="Комментарий"
        defaultValue={comment ?? ''}
        onBlur={(e) => e.target.value !== (comment ?? '') && onComment(e.target.value)}
      />
    </div>
  )
}
