import { useMemo, useState } from 'react'
import Modal from './Modal'

const weekdayOptions = [
  [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'],
  [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo'],
]

function weekdayFromDate(value) {
  if (!value) return ''
  const [y, m, d] = String(value).split('-').map(Number)
  return String(new Date(y, (m || 1) - 1, d || 1, 12).getDay())
}

function formatDate(value) {
  if (!value) return ''
  const [y, m, d] = String(value).split('-')
  return `${d}/${m}/${y}`
}

export default function BlockModal({ initialDate, block = null, onClose, onSave, onRemove, onExcludeDate }) {
  const isEditing = Boolean(block?.id)
  const initialMode = Number(block?.recurring) === 1
    ? 'recurring'
    : (block?.end_date && block.end_date !== block.block_date ? 'period' : 'single')

  const [form, setForm] = useState({
    mode: initialMode,
    title: block?.title || '',
    block_date: block?.block_date || initialDate || new Date().toISOString().slice(0, 10),
    end_date: block?.end_date || block?.block_date || initialDate || new Date().toISOString().slice(0, 10),
    start_time: block?.start_time || '',
    end_time: block?.end_time || '',
    all_day: block ? Number(block.all_day) === 1 : true,
    recurrence_weekday: block?.recurrence_weekday != null
      ? String(block.recurrence_weekday)
      : weekdayFromDate(initialDate),
  })

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const clickedDate = initialDate || block?.block_date
  const canReleaseOnlyThisDay = useMemo(() => {
    if (!isEditing || !clickedDate) return false
    return form.mode === 'period' || form.mode === 'recurring'
  }, [isEditing, clickedDate, form.mode])

  function changeMode(mode) {
    setForm((prev) => ({
      ...prev,
      mode,
      end_date: mode === 'period' ? (prev.end_date || prev.block_date) : prev.block_date,
      recurrence_weekday: mode === 'recurring'
        ? (prev.recurrence_weekday || weekdayFromDate(prev.block_date))
        : prev.recurrence_weekday,
    }))
  }

  function submit(e) {
    e.preventDefault()
    if (form.mode === 'period' && form.end_date < form.block_date) return

    onSave({
      title: form.title.trim(),
      block_date: form.block_date,
      end_date: form.mode === 'period' ? form.end_date : form.block_date,
      start_time: form.all_day ? null : form.start_time,
      end_time: form.all_day ? null : form.end_time,
      all_day: Boolean(form.all_day),
      recurring: form.mode === 'recurring',
      recurrence_weekday: form.mode === 'recurring' ? Number(form.recurrence_weekday) : null,
    })
  }

  const removeLabel = form.mode === 'period'
    ? 'Remover todo o período'
    : form.mode === 'recurring'
      ? 'Remover recorrência'
      : 'Remover bloqueio'

  return (
    <Modal
      title={isEditing ? 'Bloqueio da agenda' : 'Bloquear agenda'}
      subtitle={isEditing ? 'Edite, remova ou libere apenas este dia.' : 'Bloqueie um dia, um período ou uma recorrência semanal.'}
      onClose={onClose}
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="field span-2">
          <span>Motivo</span>
          <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Férias, congresso, ambulatório" required />
        </label>

        <label className="field span-2">
          <span>Tipo de bloqueio</span>
          <select value={form.mode} onChange={(e) => changeMode(e.target.value)}>
            <option value="single">Dia específico</option>
            <option value="period">Período</option>
            <option value="recurring">Recorrente semanal</option>
          </select>
        </label>

        <label className={`field ${form.mode === 'period' ? '' : 'span-2'}`}>
          <span>{form.mode === 'recurring' ? 'Começa em' : form.mode === 'period' ? 'Data inicial' : 'Data'}</span>
          <input
            type="date"
            value={form.block_date}
            onChange={(e) => {
              const next = e.target.value
              setForm((prev) => ({
                ...prev,
                block_date: next,
                end_date: prev.mode === 'period' && prev.end_date >= next ? prev.end_date : next,
                recurrence_weekday: prev.mode === 'recurring' ? weekdayFromDate(next) : prev.recurrence_weekday,
              }))
            }}
            required
          />
        </label>

        {form.mode === 'period' && (
          <label className="field">
            <span>Data final</span>
            <input type="date" min={form.block_date} value={form.end_date} onChange={(e) => set('end_date', e.target.value)} required />
          </label>
        )}

        {form.mode === 'recurring' && (
          <label className="field span-2">
            <span>Dia da semana</span>
            <select value={form.recurrence_weekday} onChange={(e) => set('recurrence_weekday', e.target.value)} required>
              {weekdayOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
        )}

        <label className="check-field span-2">
          <input type="checkbox" checked={form.all_day} onChange={(e) => set('all_day', e.target.checked)} />
          <span>Dia inteiro</span>
        </label>

        {!form.all_day && <>
          <label className="field"><span>Início</span><input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} required /></label>
          <label className="field"><span>Fim</span><input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} required /></label>
        </>}

        {isEditing && clickedDate && (
          <div className="block-edit-summary span-2">
            <strong>{block.title}</strong>
            <span>Você abriu este bloqueio pelo dia {formatDate(clickedDate)}.</span>
          </div>
        )}

        {isEditing && (
          <div className="block-danger-actions span-2">
            {canReleaseOnlyThisDay && (
              <button type="button" className="ghost-button" onClick={() => onExcludeDate(block.id, clickedDate)}>
                Liberar só {formatDate(clickedDate)}
              </button>
            )}
            <button type="button" className="danger-soft" onClick={() => onRemove(block.id)}>{removeLabel}</button>
          </div>
        )}

        <div className="modal-actions span-2">
          <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button">{isEditing ? 'Salvar alterações' : 'Criar bloqueio'}</button>
        </div>
      </form>
    </Modal>
  )
}
