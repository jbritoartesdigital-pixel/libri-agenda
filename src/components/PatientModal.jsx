import { useEffect, useState } from 'react'
import Modal from './Modal'

const empty = {
  full_name: '',
  whatsapp: '',
  email: '',
  preferred_modality: '',
  birth_date: '',
  administrative_notes: '',
}

const emptyFiscal = {
  cpf: '',
  invoice_email: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
}

export default function PatientModal({ patient, fiscal, onClose, onSave, onArchive, onDelete }) {
  const [form, setForm] = useState(empty)
  const [tax, setTax] = useState(emptyFiscal)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setForm(patient ? { ...empty, ...patient } : empty)
    setTax({ ...emptyFiscal, ...(fiscal || {}) })
    setBusy(false)
  }, [patient, fiscal])

  async function submit(e) {
    e.preventDefault()
    if (busy) return

    setBusy(true)
    try {
      await onSave(form, tax)
    } catch {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={patient?.id ? patient.full_name : 'Novo paciente'}
      subtitle="Cadastro administrativo. Evite informações clínicas."
      onClose={busy ? undefined : onClose}
      wide
    >
      <form className="form-grid" onSubmit={submit}>
        <label className="field span-2">
          <span>Nome completo</span>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>WhatsApp</span>
          <input
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="(61) 99999-9999"
            inputMode="tel"
            required
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            value={form.email || ''}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>Preferência</span>
          <select
            value={form.preferred_modality || ''}
            onChange={(e) => setForm({ ...form, preferred_modality: e.target.value || null })}
            disabled={busy}
          >
            <option value="">Não definida</option>
            <option value="online">Online</option>
            <option value="in_person">Presencial</option>
          </select>
        </label>

        <label className="field">
          <span>Data de nascimento</span>
          <input
            type="date"
            value={form.birth_date || ''}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value || null })}
            disabled={busy}
          />
        </label>

        <label className="field span-2">
          <span>Observação administrativa</span>
          <textarea
            rows="3"
            value={form.administrative_notes || ''}
            onChange={(e) => setForm({ ...form, administrative_notes: e.target.value })}
            disabled={busy}
          />
        </label>

        <div className="section-divider span-2">
          <strong>Dados para nota fiscal</strong>
          <small>Opcionais no cadastro. Preencha quando o paciente solicitar NF.</small>
        </div>

        <label className="field">
          <span>CPF</span>
          <input
            value={tax.cpf || ''}
            onChange={(e) => setTax({ ...tax, cpf: e.target.value })}
            placeholder="000.000.000-00"
            inputMode="numeric"
            maxLength="14"
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>E-mail da NF</span>
          <input
            type="email"
            value={tax.invoice_email || ''}
            onChange={(e) => setTax({ ...tax, invoice_email: e.target.value })}
            disabled={busy}
          />
        </label>

        <label className="field span-2">
          <span>Endereço</span>
          <input
            value={tax.address || ''}
            onChange={(e) => setTax({ ...tax, address: e.target.value })}
            placeholder="Rua, número e complemento"
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>Cidade</span>
          <input
            value={tax.city || ''}
            onChange={(e) => setTax({ ...tax, city: e.target.value })}
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>Estado</span>
          <input
            value={tax.state || ''}
            onChange={(e) => setTax({ ...tax, state: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="DF"
            maxLength="2"
            disabled={busy}
          />
        </label>

        <label className="field">
          <span>CEP</span>
          <input
            value={tax.postal_code || ''}
            onChange={(e) => setTax({ ...tax, postal_code: e.target.value })}
            placeholder="00000-000"
            inputMode="numeric"
            disabled={busy}
          />
        </label>

        <div className="modal-actions span-2">
          {patient?.id && (
            <>
              <button type="button" className="danger-soft" onClick={onArchive} disabled={busy}>
                Arquivar
              </button>
              <button type="button" className="danger-soft" onClick={onDelete} disabled={busy}>
                Excluir cadastro
              </button>
            </>
          )}
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar paciente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
