import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import StatusBadge from './StatusBadge'
import { addDays, formatBRL, formatDate } from '../lib/date'

const emptyForm = {
  patient_id: '', appointment_date: '', start_time: '09:00', appointment_type: 'first',
  modality: 'online', status: 'awaiting_confirmation', duration_minutes: 50, price: '',
  payment_status: 'pending', invoice_status: 'not_requested', administrative_notes: '',
}

export default function AppointmentModal({
  appointment, professional, patients, initial, onClose, onSave, onStatus, onFindTime, onWhatsApp, onReturn,
}) {
  const [form, setForm] = useState(emptyForm)
  const [customReturnDate, setCustomReturnDate] = useState('')
  const editing = Boolean(appointment?.id)

  useEffect(() => {
    setCustomReturnDate('')
    if (appointment) {
      setForm({
        patient_id: appointment.patient_id || '',
        appointment_date: appointment.appointment_date || '',
        start_time: appointment.start_time || '09:00',
        appointment_type: appointment.appointment_type || 'first',
        modality: appointment.modality || 'online',
        status: appointment.status || 'awaiting_confirmation',
        duration_minutes: appointment.duration_minutes || 50,
        price: appointment.price ?? '',
        payment_status: appointment.payment_status || 'pending',
        invoice_status: appointment.invoice_status || 'not_requested',
        administrative_notes: appointment.administrative_notes || '',
      })
    } else {
      const type = initial?.appointment_type || 'first'
      const modality = initial?.modality || 'online'
      const duration = type === 'first' ? professional?.first_appointment_duration : professional?.followup_appointment_duration
      const price = type === 'first'
        ? (modality === 'online' ? professional?.first_online_price : professional?.first_in_person_price)
        : (modality === 'online' ? professional?.followup_online_price : professional?.followup_in_person_price)
      setForm({ ...emptyForm, ...initial, appointment_type: type, modality, duration_minutes: duration || 50, price: price ?? '' })
    }
  }, [appointment, initial, professional])

  const selectedPatient = useMemo(() => patients.find((p) => String(p.id) === String(form.patient_id)), [patients, form.patient_id])

  function setField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'appointment_type' || key === 'modality') {
        const type = key === 'appointment_type' ? value : next.appointment_type
        const modality = key === 'modality' ? value : next.modality
        next.duration_minutes = type === 'first'
          ? professional.first_appointment_duration || 50
          : professional.followup_appointment_duration || 50
        next.price = type === 'first'
          ? (modality === 'online' ? professional.first_online_price : professional.first_in_person_price)
          : (modality === 'online' ? professional.followup_online_price : professional.followup_in_person_price)
      }
      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    await onSave({
      ...form,
      patient_id: Number(form.patient_id),
      duration_minutes: Number(form.duration_minutes || 50),
      price: form.price === '' ? null : Number(form.price),
    })
  }

  return (
    <Modal
      title={editing ? `Consulta · ${appointment.patient_name}` : 'Novo agendamento'}
      subtitle={editing ? `${appointment.appointment_date} às ${appointment.start_time}` : 'Cadastre a consulta e siga direto para o WhatsApp se quiser.'}
      onClose={onClose}
      wide
    >
      {editing && (
        <div className="summary-strip">
          <StatusBadge value={appointment.status} />
          <span>{appointment.appointment_type === 'first' ? 'Primeira consulta' : 'Retorno'}</span>
          <span>{appointment.modality === 'online' ? 'Online' : 'Presencial'}</span>
          <strong>{formatBRL(appointment.price)}</strong>
        </div>
      )}

      <form className="form-grid" onSubmit={submit}>
        <label className="field span-2">
          <span>Paciente</span>
          <select value={form.patient_id} onChange={(e) => setField('patient_id', e.target.value)} required disabled={editing}>
            <option value="">Selecione...</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Data</span>
          <input type="date" value={form.appointment_date} onChange={(e) => setField('appointment_date', e.target.value)} required />
        </label>
        <label className="field">
          <span>Horário</span>
          <input type="time" value={form.start_time} onChange={(e) => setField('start_time', e.target.value)} required />
        </label>

        <label className="field">
          <span>Tipo</span>
          <select value={form.appointment_type} onChange={(e) => setField('appointment_type', e.target.value)}>
            <option value="first">Primeira consulta</option>
            <option value="followup">Retorno</option>
          </select>
        </label>
        <label className="field">
          <span>Modalidade</span>
          <select value={form.modality} onChange={(e) => setField('modality', e.target.value)}>
            <option value="online">Online</option>
            <option value="in_person">Presencial</option>
          </select>
        </label>

        <label className="field">
          <span>Duração (min)</span>
          <input type="number" min="10" step="5" value={form.duration_minutes} onChange={(e) => setField('duration_minutes', e.target.value)} />
        </label>
        <label className="field">
          <span>Valor</span>
          <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setField('price', e.target.value)} />
        </label>

        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={(e) => setField('status', e.target.value)}>
            <option value="reserved">Reservado</option>
            <option value="awaiting_confirmation">Aguardando confirmação</option>
            <option value="confirmed">Confirmada</option>
            <option value="completed">Realizada</option>
            <option value="cancelled">Cancelada</option>
            <option value="no_show">Faltou</option>
          </select>
        </label>
        <label className="field">
          <span>Pagamento</span>
          <select value={form.payment_status} onChange={(e) => setField('payment_status', e.target.value)}>
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
            <option value="exempt">Isento</option>
          </select>
        </label>

        <label className="field span-2">
          <span>Nota fiscal</span>
          <select value={form.invoice_status} onChange={(e) => setField('invoice_status', e.target.value)}>
            <option value="not_requested">Não solicitada</option>
            <option value="awaiting_data">Aguardando dados</option>
            <option value="ready">Pronta para emissão</option>
            <option value="issued">Emitida</option>
          </select>
        </label>

        <label className="field span-2">
          <span>Observação administrativa</span>
          <textarea rows="3" value={form.administrative_notes} onChange={(e) => setField('administrative_notes', e.target.value)} placeholder="Sem informações clínicas." />
        </label>

        {selectedPatient && <div className="helper span-2">WhatsApp: {selectedPatient.whatsapp}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary-button fit" onClick={() => onFindTime?.(form)}>Encontrar horário</button>
          <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button">{editing ? 'Salvar alterações' : 'Salvar agendamento'}</button>
        </div>
      </form>

      {editing && (
        <div className="action-zone">
          <span className="section-label">Ações rápidas</span>
          <div className="button-row wrap">
            <button onClick={onWhatsApp}>WhatsApp</button>
            <button onClick={() => onFindTime?.(form)}>Reagendar</button>
            <button onClick={() => onStatus('confirmed')}>Confirmar</button>
            <button onClick={() => onStatus('completed')}>Realizada</button>
            <button onClick={() => onStatus('no_show')}>Faltou</button>
            <button onClick={() => onStatus('cancelled')} className="danger-soft">Cancelar consulta</button>
          </div>
          <div className="return-row">
            <span>Agendar retorno:</span>

            {[15, 30, 45, 60].map((days) => {
              const target = addDays(appointment.appointment_date, days)
              return (
                <button
                  type="button"
                  key={days}
                  className={days === 30 ? 'return-primary' : ''}
                  onClick={() => onReturn?.(days)}
                  title={`Buscar horários a partir de ${formatDate(target)}`}
                >
                  <strong>{days} dias</strong>
                  <small>{formatDate(target)}</small>
                </button>
              )
            })}

            <button
              type="button"
              className={customReturnDate ? 'return-primary' : ''}
              onClick={() => setCustomReturnDate((value) => value ? '' : addDays(appointment.appointment_date, 30))}
            >
              <strong>Outra data</strong>
              <small>{customReturnDate ? formatDate(customReturnDate) : 'Escolher'}</small>
            </button>

            {customReturnDate && (
              <div className="form-grid inset span-2" style={{ width: '100%', marginTop: 8 }}>
                <label className="field">
                  <span>Data desejada para o retorno</span>
                  <input
                    type="date"
                    min={addDays(appointment.appointment_date, 1)}
                    value={customReturnDate}
                    onChange={(e) => setCustomReturnDate(e.target.value)}
                  />
                </label>

                <div className="field" style={{ justifyContent: 'end' }}>
                  <span>&nbsp;</span>
                  <button
                    type="button"
                    className="secondary-button fit"
                    disabled={!customReturnDate}
                    onClick={() => {
                      const [ay, am, ad] = appointment.appointment_date.split('-').map(Number)
                      const [ty, tm, td] = customReturnDate.split('-').map(Number)
                      const days = Math.round(
                        (Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86400000
                      )
                      if (days > 0) onReturn?.(days)
                    }}
                  >
                    Buscar horários
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
