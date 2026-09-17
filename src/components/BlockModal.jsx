import { useState } from 'react'
import Modal from './Modal'

export default function BlockModal({ initialDate, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', block_date: initialDate || new Date().toISOString().slice(0, 10), start_time: '', end_time: '', all_day: true, recurring: false, recurrence_weekday: '' })
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Modal title="Bloquear agenda" subtitle="Use para ambulatório, pós, almoço, viagem ou compromisso." onClose={onClose}>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave({ ...form, recurrence_weekday: form.recurring ? Number(form.recurrence_weekday) : null }) }}>
        <label className="field span-2"><span>Motivo</span><input value={form.title} onChange={(e) => set('title', e.target.value)} required /></label>
        <label className="field span-2"><span>Data</span><input type="date" value={form.block_date} onChange={(e) => set('block_date', e.target.value)} required /></label>
        <label className="check-field span-2"><input type="checkbox" checked={form.all_day} onChange={(e) => set('all_day', e.target.checked)} /><span>Dia inteiro</span></label>
        {!form.all_day && <><label className="field"><span>Início</span><input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} required /></label><label className="field"><span>Fim</span><input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} required /></label></>}
        <label className="check-field span-2"><input type="checkbox" checked={form.recurring} onChange={(e) => set('recurring', e.target.checked)} /><span>Repetir toda semana</span></label>
        {form.recurring && <label className="field span-2"><span>Dia da semana</span><select value={form.recurrence_weekday} onChange={(e) => set('recurrence_weekday', e.target.value)} required><option value="">Selecione...</option><option value="1">Segunda</option><option value="2">Terça</option><option value="3">Quarta</option><option value="4">Quinta</option><option value="5">Sexta</option><option value="6">Sábado</option><option value="0">Domingo</option></select></label>}
        <div className="modal-actions span-2"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button">Criar bloqueio</button></div>
      </form>
    </Modal>
  )
}
