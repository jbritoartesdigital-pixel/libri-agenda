import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { addDays, formatDate } from '../lib/date'

export default function AvailabilityModal({
  professionalId,
  api,
  initial = {},
  mode = 'pick',
  maxSelect = 3,
  onClose,
  onPick,
  onUseSelected,
}) {
  const referenceDate = initial.from || new Date().toISOString().slice(0, 10)
  const dateInputRef = useRef(null)

  const [filters, setFilters] = useState({
    from: referenceDate,
    type: initial.type || 'followup',
    modality: initial.modality || 'online',
    period: initial.period || 'any',
  })
  const [slots, setSlots] = useState([])
  const [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load(nextFilters = filters) {
    setLoading(true)
    setError('')

    try {
      const qs = new URLSearchParams({ ...nextFilters, days: '45' })
      const result = await api.get(`/api/professionals/${professionalId}/availability?${qs}`)
      setSlots(result.slots || [])
      setSelected([])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function applyReturnOffset(days) {
    const next = {
      ...filters,
      type: 'followup',
      from: addDays(referenceDate, days),
    }

    setFilters(next)
    await load(next)
  }

  function chooseAnotherDate() {
    const input = dateInputRef.current
    if (!input) return

    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker()
        return
      } catch {}
    }

    input.focus()
  }

  function toggle(slot) {
    const key = `${slot.date}-${slot.start_time}`

    if (selected.some((s) => `${s.date}-${s.start_time}` === key)) {
      setSelected(selected.filter((s) => `${s.date}-${s.start_time}` !== key))
    } else if (selected.length < maxSelect) {
      setSelected([...selected, slot])
    }
  }

  function pick(slot) {
    onPick({
      ...slot,
      appointment_type: filters.type,
      modality: filters.modality,
    })
  }

  return (
    <Modal
      title={mode === 'message' ? 'Montar horários disponíveis' : 'Encontrar horário'}
      subtitle="A busca respeita rotina, consultas e bloqueios cadastrados."
      onClose={onClose}
      wide
    >
      <div className="filter-row">
        <label className="field">
          <span>A partir de</span>
          <input
            ref={dateInputRef}
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>

        <label className="field">
          <span>Tipo</span>
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="first">Primeira consulta</option>
            <option value="followup">Retorno</option>
          </select>
        </label>

        <label className="field">
          <span>Modalidade</span>
          <select value={filters.modality} onChange={(e) => setFilters({ ...filters, modality: e.target.value })}>
            <option value="online">Online</option>
            <option value="in_person">Presencial</option>
          </select>
        </label>

        <label className="field">
          <span>Período</span>
          <select value={filters.period} onChange={(e) => setFilters({ ...filters, period: e.target.value })}>
            <option value="any">Qualquer</option>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
          </select>
        </label>

        <button className="secondary-button fit align-end" onClick={() => load()}>Buscar</button>
      </div>

      {filters.type === 'followup' && (
        <section className="return-shortcuts">
          <div className="return-shortcuts-head">
            <strong>Quando deve ser o retorno?</strong>
            <span>Base: {formatDate(referenceDate)}</span>
          </div>

          <div className="return-shortcut-buttons">
            {[15, 30, 45, 60].map((days) => {
              const target = addDays(referenceDate, days)

              return (
                <button
                  type="button"
                  key={days}
                  className={days === 30 ? 'return-shortcut primary' : 'return-shortcut'}
                  onClick={() => applyReturnOffset(days)}
                >
                  <strong>+{days} dias</strong>
                  <small>{formatDate(target, { year: false })}</small>
                </button>
              )
            })}

            <button type="button" className="return-shortcut" onClick={chooseAnotherDate}>
              <strong>Outra data</strong>
              <small>Escolher</small>
            </button>
          </div>
        </section>
      )}

      {loading && <div className="empty-state">Procurando horários...</div>}
      {error && <div className="error-box">{error}</div>}

      {!loading && !error && slots.length === 0 && (
        <div className="empty-state">Nenhum horário calculado. Verifique a rotina semanal ou tente outra data.</div>
      )}

      <div className="slots-grid">
        {slots.slice(0, 30).map((slot) => {
          const key = `${slot.date}-${slot.start_time}`
          const isSelected = selected.some((s) => `${s.date}-${s.start_time}` === key)

          return (
            <button
              key={key}
              className={isSelected ? 'slot-card selected' : 'slot-card'}
              onClick={() => mode === 'pick' ? pick(slot) : toggle(slot)}
            >
              <strong>{formatDate(slot.date, { year: false })}</strong>
              <span>{slot.start_time}</span>
            </button>
          )
        })}
      </div>

      {mode === 'message' && (
        <div className="modal-actions">
          <span className="helper">Selecione até {maxSelect} horários.</span>
          <button className="primary-button" disabled={!selected.length} onClick={() => onUseSelected(selected)}>
            Usar horários selecionados
          </button>
        </div>
      )}
    </Modal>
  )
}
