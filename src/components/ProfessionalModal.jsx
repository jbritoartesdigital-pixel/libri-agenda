import { useEffect, useState } from 'react'
import Modal from './Modal'

const empty = {
  name: '', specialty: '', professional_registry: '', photo_url: '', logo_url: '',
  primary_color: '#6f8278', secondary_color: '#d8e0dc', accent_color: '#b88968', theme_mode: 'light',
  online_enabled: 1, in_person_enabled: 1, online_platform: '', online_link: '', clinic_name: '', clinic_address: '',
  first_online_price: '', first_in_person_price: '', followup_online_price: '', followup_in_person_price: '',
  first_appointment_duration: 50, followup_appointment_duration: 50, interval_minutes: 0,
  pix_key: '', pix_holder: '', payment_instructions: '', invoice_mode: 'on_request',
}

export default function ProfessionalModal({ professional, onClose, onSave }) {
  const [form, setForm] = useState(empty)
  useEffect(() => setForm(professional ? { ...empty, ...professional } : empty), [professional])
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const numberOrNull = (v) => v === '' || v === null || v === undefined ? null : Number(v)

  function submit(e) {
    e.preventDefault()
    onSave({
      ...form,
      online_enabled: form.online_enabled ? 1 : 0,
      in_person_enabled: form.in_person_enabled ? 1 : 0,
      first_online_price: numberOrNull(form.first_online_price),
      first_in_person_price: numberOrNull(form.first_in_person_price),
      followup_online_price: numberOrNull(form.followup_online_price),
      followup_in_person_price: numberOrNull(form.followup_in_person_price),
      first_appointment_duration: Number(form.first_appointment_duration || 50),
      followup_appointment_duration: Number(form.followup_appointment_duration || 50),
      interval_minutes: Number(form.interval_minutes || 0),
    })
  }

  return (
    <Modal title={professional?.id ? 'Configurar profissional' : 'Cadastrar profissional'} subtitle="Cada profissional tem agenda, pacientes, mensagens e identidade próprios." onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <div className="form-section span-2"><h3>Identidade</h3><p>O ambiente muda automaticamente para estas cores.</p></div>
        <label className="field"><span>Nome profissional</span><input value={form.name} onChange={(e) => set('name', e.target.value)} required /></label>
        <label className="field"><span>Especialidade</span><input value={form.specialty || ''} onChange={(e) => set('specialty', e.target.value)} /></label>
        <label className="field"><span>Registro profissional</span><input value={form.professional_registry || ''} onChange={(e) => set('professional_registry', e.target.value)} placeholder="Opcional" /></label>
        <label className="field"><span>Foto/logo (URL)</span><input value={form.photo_url || form.logo_url || ''} onChange={(e) => set('photo_url', e.target.value)} placeholder="Opcional" /></label>
        <label className="field color-field"><span>Cor principal</span><input type="color" value={form.primary_color || '#6f8278'} onChange={(e) => set('primary_color', e.target.value)} /></label>
        <label className="field color-field"><span>Cor secundária</span><input type="color" value={form.secondary_color || '#d8e0dc'} onChange={(e) => set('secondary_color', e.target.value)} /></label>
        <label className="field color-field"><span>Destaque</span><input type="color" value={form.accent_color || '#b88968'} onChange={(e) => set('accent_color', e.target.value)} /></label>

        <div className="form-section span-2"><h3>Atendimento</h3></div>
        <label className="check-field"><input type="checkbox" checked={Boolean(Number(form.online_enabled))} onChange={(e) => set('online_enabled', e.target.checked)} /><span>Atendimento online</span></label>
        <label className="check-field"><input type="checkbox" checked={Boolean(Number(form.in_person_enabled))} onChange={(e) => set('in_person_enabled', e.target.checked)} /><span>Atendimento presencial</span></label>
        <label className="field"><span>Plataforma online</span><input value={form.online_platform || ''} onChange={(e) => set('online_platform', e.target.value)} /></label>
        <label className="field"><span>Link online padrão</span><input value={form.online_link || ''} onChange={(e) => set('online_link', e.target.value)} /></label>
        <label className="field"><span>Local</span><input value={form.clinic_name || ''} onChange={(e) => set('clinic_name', e.target.value)} /></label>
        <label className="field"><span>Endereço</span><input value={form.clinic_address || ''} onChange={(e) => set('clinic_address', e.target.value)} /></label>

        <div className="form-section span-2"><h3>Valores e duração</h3></div>
        <label className="field"><span>Primeira · online</span><input type="number" min="0" step="0.01" value={form.first_online_price ?? ''} onChange={(e) => set('first_online_price', e.target.value)} /></label>
        <label className="field"><span>Primeira · presencial</span><input type="number" min="0" step="0.01" value={form.first_in_person_price ?? ''} onChange={(e) => set('first_in_person_price', e.target.value)} /></label>
        <label className="field"><span>Retorno · online</span><input type="number" min="0" step="0.01" value={form.followup_online_price ?? ''} onChange={(e) => set('followup_online_price', e.target.value)} /></label>
        <label className="field"><span>Retorno · presencial</span><input type="number" min="0" step="0.01" value={form.followup_in_person_price ?? ''} onChange={(e) => set('followup_in_person_price', e.target.value)} /></label>
        <label className="field"><span>Duração primeira (min)</span><input type="number" min="10" step="5" value={form.first_appointment_duration} onChange={(e) => set('first_appointment_duration', e.target.value)} /></label>
        <label className="field"><span>Duração retorno (min)</span><input type="number" min="10" step="5" value={form.followup_appointment_duration} onChange={(e) => set('followup_appointment_duration', e.target.value)} /></label>
        <label className="field"><span>Intervalo (min)</span><input type="number" min="0" step="5" value={form.interval_minutes} onChange={(e) => set('interval_minutes', e.target.value)} /></label>

        <div className="form-section span-2"><h3>Pagamento e NF</h3></div>
        <label className="field"><span>Chave PIX</span><input value={form.pix_key || ''} onChange={(e) => set('pix_key', e.target.value)} /></label>
        <label className="field"><span>Titular PIX</span><input value={form.pix_holder || ''} onChange={(e) => set('pix_holder', e.target.value)} /></label>
        <label className="field span-2"><span>Instruções de pagamento</span><textarea rows="3" value={form.payment_instructions || ''} onChange={(e) => set('payment_instructions', e.target.value)} /></label>
        <label className="field span-2"><span>Emissão de NF</span><select value={form.invoice_mode || 'on_request'} onChange={(e) => set('invoice_mode', e.target.value)}><option value="on_request">Somente quando solicitada</option><option value="always">Sempre emitir</option></select></label>

        <div className="modal-actions span-2"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button">Salvar profissional</button></div>
      </form>
    </Modal>
  )
}
