import { useEffect, useState } from 'react'
import Modal from './Modal'

const empty = {
  full_name: '', whatsapp: '', email: '', preferred_modality: '', birth_date: '', administrative_notes: '',
}

export default function PatientModal({ patient, fiscal, onClose, onSave, onSaveFiscal, onArchive }) {
  const [form, setForm] = useState(empty)
  const [tax, setTax] = useState({ cpf: '', invoice_email: '', address: '', city: '', state: '', postal_code: '' })
  const [showFiscal, setShowFiscal] = useState(false)

  useEffect(() => {
    setForm(patient ? { ...empty, ...patient } : empty)
    setTax({ cpf: '', invoice_email: '', address: '', city: '', state: '', postal_code: '', ...(fiscal || {}) })
  }, [patient, fiscal])

  return (
    <Modal title={patient?.id ? patient.full_name : 'Novo paciente'} subtitle="Cadastro administrativo. Evite informações clínicas." onClose={onClose} wide>
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(form) }}>
        <label className="field span-2"><span>Nome completo</span><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></label>
        <label className="field"><span>WhatsApp</span><input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(61) 99999-9999" required /></label>
        <label className="field"><span>E-mail</span><input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="field"><span>Preferência</span><select value={form.preferred_modality || ''} onChange={(e) => setForm({ ...form, preferred_modality: e.target.value || null })}><option value="">Não definida</option><option value="online">Online</option><option value="in_person">Presencial</option></select></label>
        <label className="field"><span>Data de nascimento</span><input type="date" value={form.birth_date || ''} onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })} /></label>
        <label className="field span-2"><span>Observação administrativa</span><textarea rows="3" value={form.administrative_notes || ''} onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })} /></label>
        <div className="modal-actions span-2">
          {patient?.id && <button type="button" className="danger-soft" onClick={onArchive}>Arquivar</button>}
          <button type="button" className="ghost-button" onClick={onClose}>Cancelar</button>
          <button className="primary-button">Salvar paciente</button>
        </div>
      </form>

      {patient?.id && (
        <div className="collapsible">
          <button className="collapsible-trigger" onClick={() => setShowFiscal((v) => !v)}>{showFiscal ? 'Ocultar' : 'Abrir'} dados para nota fiscal</button>
          {showFiscal && (
            <form className="form-grid inset" onSubmit={(e) => { e.preventDefault(); onSaveFiscal(tax) }}>
              <label className="field"><span>CPF</span><input value={tax.cpf || ''} onChange={(e) => setTax({ ...tax, cpf: e.target.value })} /></label>
              <label className="field"><span>E-mail da NF</span><input type="email" value={tax.invoice_email || ''} onChange={(e) => setTax({ ...tax, invoice_email: e.target.value })} /></label>
              <label className="field span-2"><span>Endereço</span><input value={tax.address || ''} onChange={(e) => setTax({ ...tax, address: e.target.value })} /></label>
              <label className="field"><span>Cidade</span><input value={tax.city || ''} onChange={(e) => setTax({ ...tax, city: e.target.value })} /></label>
              <label className="field"><span>Estado</span><input value={tax.state || ''} onChange={(e) => setTax({ ...tax, state: e.target.value })} /></label>
              <label className="field"><span>CEP</span><input value={tax.postal_code || ''} onChange={(e) => setTax({ ...tax, postal_code: e.target.value })} /></label>
              <div className="modal-actions span-2"><button className="secondary-button fit">Salvar dados fiscais</button></div>
            </form>
          )}
        </div>
      )}
    </Modal>
  )
}
