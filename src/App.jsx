import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3, FileText, Home, MessageCircle,
  Plus, Search, Settings, Stethoscope, UsersRound, WalletCards, XCircle, CheckCircle2,
  Ban, CalendarRange, UserRoundPlus, Palette, History, LockKeyhole, Fingerprint,
} from 'lucide-react'
import { api } from './lib/api'
import { applyProfessionalTheme } from './lib/theme'
import {
  addDays, endOfMonth, endOfWeek, formatBRL, formatDate, formatLongDate, monthGrid,
  parseISODate, startOfMonth, startOfWeek, todayISO, weekdayShort,
} from './lib/date'
import { openWhatsApp, renderTemplate } from './lib/whatsapp'
import { loginWithPasskey as performPasskeyLogin, passkeySupported, registerPasskey } from './lib/webauthn'
import Modal from './components/Modal'
import StatusBadge from './components/StatusBadge'
import AppointmentModal from './components/AppointmentModal'
import PatientModal from './components/PatientModal'
import AvailabilityModal from './components/AvailabilityModal'
import ProfessionalModal from './components/ProfessionalModal'
import BlockModal from './components/BlockModal'

const workspaceNavItems = [
  ['Início', Home],
  ['Agenda', CalendarDays],
  ['Pacientes', UsersRound],
  ['Pendências', WalletCards],
  ['Mensagens', MessageCircle],
  ['Configurações', Settings],
]

const adminNavItems = [
  ['Home', Home],
  ['Profissionais', Stethoscope],
  ['Mensagens padrão', MessageCircle],
  ['Configurações', Settings],
]

const weekdays = [
  [1, 'Segunda'], [2, 'Terça'], [3, 'Quarta'], [4, 'Quinta'], [5, 'Sexta'], [6, 'Sábado'], [0, 'Domingo'],
]

const messageTemplateCatalog = [
  ['first_contact', 'Primeiro contato'], ['online_info', 'Informações - Online'],
  ['in_person_info', 'Informações - Presencial'], ['values_online', 'Valores - Online'],
  ['values_in_person', 'Valores - Presencial'], ['available_times', 'Horários disponíveis'],
  ['appointment_confirmation', 'Confirmação de agendamento'], ['reminder', 'Lembrete'],
  ['payment', 'Pagamento'], ['invoice_data', 'Solicitar dados para NF'], ['invoice_issued', 'NF emitida'],
  ['reschedule', 'Reagendamento'], ['cancellation', 'Cancelamento'], ['return_offer', 'Retorno'],
]

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'P'
}

function sortAppointments(items) {
  return [...items].sort((a, b) => `${a.appointment_date} ${a.start_time}`.localeCompare(`${b.appointment_date} ${b.start_time}`))
}

function blockAppliesToDate(block, date) {
  const exceptions = Array.isArray(block.exceptions) ? block.exceptions : []
  if (exceptions.includes(date)) return false

  if (Number(block.recurring) === 1) {
    const startsOnOrAfterAnchor = !block.block_date || date >= block.block_date
    return startsOnOrAfterAnchor && Number(block.recurrence_weekday) === parseISODate(date).getDay()
  }

  const endDate = block.end_date || block.block_date
  return date >= block.block_date && date <= endDate
}

function blockIsPeriod(block) {
  return Number(block.recurring) !== 1 && Boolean(block.end_date) && block.end_date !== block.block_date
}

export default function App() {
  const [session, setSession] = useState(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeys, setPasskeys] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [professionalId, setProfessionalId] = useState(null)
  const [activeNav, setActiveNav] = useState('Profissionais')
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [blocks, setBlocks] = useState([])
  const [messages, setMessages] = useState([])
  const [defaultMessages, setDefaultMessages] = useState([])
  const [rules, setRules] = useState([])
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(true)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [search, setSearch] = useState('')
  const [calendarDate, setCalendarDate] = useState(todayISO())
  const [calendarView, setCalendarView] = useState('week')

  const [appointmentModal, setAppointmentModal] = useState(null)
  const [patientModal, setPatientModal] = useState(null)
  const [patientFiscal, setPatientFiscal] = useState(null)
  const [professionalModal, setProfessionalModal] = useState(null)
  const [blockModal, setBlockModal] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [messagePatient, setMessagePatient] = useState(null)
  const [messagePicker, setMessagePicker] = useState(null)
  const [invoiceModal, setInvoiceModal] = useState(null)

  const professional = useMemo(
    () => professionals.find((p) => Number(p.id) === Number(professionalId)) || null,
    [professionals, professionalId],
  )

  const today = todayISO()
  const todayAppointments = useMemo(() => sortAppointments(appointments.filter((a) => a.appointment_date === today && a.status !== 'cancelled')), [appointments, today])
  const pendingConfirmations = appointments.filter((a) => a.status === 'awaiting_confirmation' || a.status === 'reserved')
  const pendingPayments = appointments.filter((a) => a.payment_status === 'pending' && !['cancelled'].includes(a.status))
  const pendingInvoices = appointments.filter((a) => ['awaiting_data', 'ready'].includes(a.invoice_status))

  useEffect(() => { bootstrap() }, [])
  useEffect(() => { applyProfessionalTheme(professional || null) }, [professional])
  useEffect(() => { if (professionalId) loadWorkspace(professionalId) }, [professionalId])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  async function bootstrap() {
    setLoading(true); setError('')
    try {
      if (window.location.pathname === '/') window.history.replaceState({}, '', '/admin')
      const sessionData = await api.get('/api/auth/session')
      setSetupRequired(Boolean(sessionData?.setup_required))
      if (!sessionData?.authenticated) {
        setSession(null)
        setProfessionals([])
        setPasskeys([])
        setDefaultMessages([])
        setProfessionalId(null)
        return
      }
      setSession(sessionData)
      if (sessionData.role === 'professional' && sessionData.slug && window.location.pathname !== `/${sessionData.slug}`) {
        window.history.replaceState({}, '', `/${sessionData.slug}`)
      }
      const [professionalData, passkeyData, defaultMessageData] = await Promise.all([
        api.get('/api/professionals'),
        api.get('/api/auth/passkeys').catch(() => []),
        api.get('/api/message-defaults').catch(() => []),
      ])
      setProfessionals(professionalData)
      setPasskeys(passkeyData)
      setDefaultMessages(defaultMessageData)
      if (sessionData.role === 'professional' && professionalData.length) {
        setProfessionalId(professionalData[0].id)
        setActiveNav('Início')
      } else {
        setProfessionalId(null)
        setActiveNav('Home')
      }
    } catch (e) {
      setSession(null)
      setError(e.message)
    } finally { setLoading(false) }
  }

  async function login(password, remember = true) {
    setAuthBusy(true); setError('')
    try {
      const slug = window.location.pathname.split('/').filter(Boolean)[0] || 'admin'
      await api.post('/api/auth/login', { slug, password, remember })
      await bootstrap()
    } catch (e) { setError(e.message) } finally { setAuthBusy(false) }
  }

  async function biometricLogin(remember = true, automatic = false) {
    setAuthBusy(true)
    if (!automatic) setError('')
    try {
      const slug = window.location.pathname.split('/').filter(Boolean)[0] || 'admin'
      await performPasskeyLogin(slug, remember)
      await bootstrap()
    } catch (e) {
      const unavailable = /Ainda não há biometria cadastrada|Biometria não reconhecida|Acesso não encontrado/i.test(e?.message || '')
      if (!automatic && e?.name !== 'NotAllowedError') {
        setError(e.message || 'Não foi possível usar a biometria.')
      } else if (automatic && !unavailable && e?.name !== 'NotAllowedError') {
        // Falhas técnicas reais continuam visíveis; ausência/cancelamento apenas cai para senha.
        setError(e.message || 'Não foi possível usar a biometria.')
      }
    } finally {
      setAuthBusy(false)
    }
  }

  async function enablePasskey() {
    setPasskeyBusy(true); setError('')
    try {
      await registerPasskey()
      setPasskeys(await api.get('/api/auth/passkeys'))
      notify('Biometria ativada neste aparelho.')
    } catch (e) {
      if (e?.name !== 'NotAllowedError') setError(e.message || 'Não foi possível ativar a biometria.')
    } finally { setPasskeyBusy(false) }
  }

  async function removePasskey(id) {
    if (!window.confirm('Remover esta biometria? Este aparelho deixará de entrar por biometria se esta for a credencial usada nele.')) return
    try {
      await api.delete(`/api/auth/passkeys/${id}`)
      setPasskeys(await api.get('/api/auth/passkeys'))
      notify('Biometria removida.')
    } catch (e) { setError(e.message) }
  }

  async function setupAdmin(name, password) {
    setAuthBusy(true); setError('')
    try {
      await api.post('/api/auth/setup', { name, password })
      await bootstrap()
    } catch (e) { setError(e.message) } finally { setAuthBusy(false) }
  }

  async function logout() {
    try { await api.post('/api/auth/logout', {}) } catch {}
    setSession(null)
    setProfessionals([])
    setPasskeys([])
    setDefaultMessages([])
    setProfessionalId(null)
    setPatients([]); setAppointments([]); setBlocks([]); setMessages([]); setRules([]); setAudit([])
    setActiveNav('Home')
  }

  async function loadProfessionals() {
    const list = await api.get('/api/professionals')
    setProfessionals(list)
    return list
  }

  async function loadWorkspace(id) {
    setWorkspaceLoading(true); setError('')
    try {
      const from = addDays(todayISO(), -180)
      const to = addDays(todayISO(), 365)
      const [patientData, appointmentData, blockData, messageData, ruleData, auditData] = await Promise.all([
        api.get(`/api/professionals/${id}/patients`),
        api.get(`/api/professionals/${id}/appointments?from=${from}&to=${to}`),
        api.get(`/api/professionals/${id}/blocks?from=${from}&to=${to}`),
        api.get(`/api/professionals/${id}/messages`),
        api.get(`/api/professionals/${id}/schedule-rules`),
        api.get(`/api/professionals/${id}/audit`),
      ])
      setPatients(patientData); setAppointments(appointmentData); setBlocks(blockData); setMessages(messageData); setRules(ruleData); setAudit(auditData)
    } catch (e) { setError(e.message) } finally { setWorkspaceLoading(false) }
  }

  function notify(text) { setToast(text) }

  function leaveWorkspace() {
    if (session?.role !== 'admin') return
    setProfessionalId(null)
    setPatients([]); setAppointments([]); setBlocks([]); setMessages([]); setRules([]); setAudit([])
    setActiveNav('Home')
    setSearch('')
  }

  async function saveProfessional(data) {
    try {
      const { access_slug, new_password, ...profileData } = data
      let targetId = professionalModal?.id || null
      if (targetId) {
        await api.patch(`/api/professionals/${targetId}`, profileData)
      } else {
        const created = await api.post('/api/professionals', profileData)
        targetId = created.id
      }

      const slugChanged = Boolean(professionalModal?.access_slug) && access_slug !== professionalModal.access_slug
      if (new_password || slugChanged) {
        await api.put(`/api/professionals/${targetId}/access`, { slug: access_slug, password: new_password })
      }

      const list = await loadProfessionals()
      if (!professionalModal?.id && targetId) {
        setProfessionalId(targetId)
        setActiveNav('Início')
      }
      setProfessionalModal(null); notify('Profissional salvo.')
    } catch (e) { setError(e.message) }
  }

  async function openPatient(patient = null) {
    setPatientFiscal(null)
    if (patient?.id) {
      try { setPatientFiscal(await api.get(`/api/patients/${patient.id}/fiscal`)) } catch { setPatientFiscal(null) }
    }
    setPatientModal(patient || {})
  }

  async function savePatient(data, fiscalData = null) {
    try {
      let saved
      if (patientModal?.id) {
        saved = await api.patch(`/api/patients/${patientModal.id}`, data)
      } else {
        saved = await api.post(`/api/professionals/${professionalId}/patients`, data)
      }

      const patientId = saved?.id || patientModal?.id
      if (patientId && fiscalData) {
        await api.put(`/api/patients/${patientId}/fiscal`, fiscalData)
      }

      setPatients(await api.get(`/api/professionals/${professionalId}/patients`))
      setPatientModal(null)
      notify('Paciente salvo.')
      return saved
    } catch (e) {
      setError(e.message)
      throw e
    }
  }

  async function archivePatient() {
    if (!patientModal?.id) return
    if (!window.confirm('Arquivar este paciente? O histórico de consultas será preservado.')) return
    await api.patch(`/api/patients/${patientModal.id}`, { archived: 1 })
    setPatients(await api.get(`/api/professionals/${professionalId}/patients`))
    setPatientModal(null); notify('Paciente arquivado.')
  }

  async function deletePatient() {
    if (!patientModal?.id) return
    if (!window.confirm('Excluir este cadastro? Isso só é permitido quando o paciente não possui nenhuma consulta vinculada.')) return
    try {
      await api.delete(`/api/patients/${patientModal.id}`)
      setPatients(await api.get(`/api/professionals/${professionalId}/patients`))
      setPatientModal(null)
      notify('Cadastro excluído.')
    } catch (e) {
      setError(e.message)
    }
  }

  async function saveAppointment(data) {
    try {
      if (appointmentModal?.id) await api.patch(`/api/appointments/${appointmentModal.id}`, data)
      else await api.post(`/api/professionals/${professionalId}/appointments`, data)
      await loadWorkspace(professionalId)
      setAppointmentModal(null); notify('Consulta salva.')
    } catch (e) { setError(e.message) }
  }

  async function quickStatus(status) {
    if (!appointmentModal?.id) return
    try {
      const updated = await api.patch(`/api/appointments/${appointmentModal.id}`, { status })
      setAppointmentModal(updated)
      await loadWorkspace(professionalId)
      notify('Status atualizado.')
    } catch (e) { setError(e.message) }
  }

  function openAvailabilityFromAppointment(form) {
    const draft = { ...form }
    const editing = Boolean(appointmentModal?.id)
    setAvailability({
      mode: 'pick',
      initial: { from: draft.appointment_date || todayISO(), type: draft.appointment_type, modality: draft.modality },
      context: editing ? { kind: 'rebook', appointment: appointmentModal } : { kind: 'new', draft },
    })
  }

  function startReturn(days) {
    const appointment = appointmentModal
    setAvailability({
      mode: 'pick',
      initial: { from: addDays(appointment.appointment_date, days), type: 'followup', modality: appointment.modality },
      context: { kind: 'return', appointment },
    })
  }

  async function pickSlot(slot) {
    const context = availability?.context
    try {
      if (context?.kind === 'rebook') {
        await api.patch(`/api/appointments/${context.appointment.id}`, { appointment_date: slot.date, start_time: slot.start_time, end_time: slot.end_time })
        setAppointmentModal(null); notify('Consulta reagendada.')
      } else if (context?.kind === 'return') {
        await api.post(`/api/professionals/${professionalId}/appointments`, {
          patient_id: context.appointment.patient_id,
          appointment_date: slot.date, start_time: slot.start_time, end_time: slot.end_time,
          appointment_type: 'followup', modality: context.appointment.modality,
          status: 'awaiting_confirmation', duration_minutes: slot.duration_minutes,
        })
        setAppointmentModal(null); notify('Retorno agendado.')
      } else if (context?.kind === 'new') {
        setAppointmentModal({ initial: { ...context.draft, appointment_date: slot.date, start_time: slot.start_time, duration_minutes: slot.duration_minutes } })
      }
      setAvailability(null)
      await loadWorkspace(professionalId)
    } catch (e) { setError(e.message) }
  }

  async function saveBlock(data) {
    try {
      if (blockModal?.block?.id) {
        await api.patch(`/api/blocks/${blockModal.block.id}`, data)
        notify('Bloqueio atualizado.')
      } else {
        await api.post(`/api/professionals/${professionalId}/blocks`, data)
        notify('Bloqueio criado.')
      }
      setBlockModal(null)
      await loadWorkspace(professionalId)
    } catch (e) { setError(e.message) }
  }

  async function deleteBlock(id) {
    if (!window.confirm('Remover este bloqueio?')) return
    try {
      await api.delete(`/api/blocks/${id}`)
      setBlockModal(null)
      await loadWorkspace(professionalId)
      notify('Bloqueio removido.')
    } catch (e) { setError(e.message) }
  }

  async function excludeBlockDate(id, date) {
    try {
      await api.post(`/api/blocks/${id}/exceptions`, { date })
      setBlockModal(null)
      await loadWorkspace(professionalId)
      notify(`Dia ${formatDate(date)} liberado.`)
    } catch (e) { setError(e.message) }
  }

  async function saveRules(nextRules) {
    try {
      const result = await api.put(`/api/professionals/${professionalId}/schedule-rules`, { rules: nextRules })
      setRules(result); notify('Rotina semanal salva.')
    } catch (e) { setError(e.message) }
  }

  async function saveMessage(template) {
    try {
      const saved = await api.put(`/api/professionals/${professionalId}/messages`, template)
      setMessages((prev) => [...prev.filter((m) => m.template_key !== saved.template_key), saved].sort((a, b) => String(a.template_key).localeCompare(String(b.template_key))))
      notify('Mensagem personalizada salva.')
    } catch (e) { setError(e.message) }
  }

  async function resetMessage(templateKey) {
    try {
      await api.delete(`/api/professionals/${professionalId}/messages/${encodeURIComponent(templateKey)}`)
      setMessages((prev) => prev.filter((m) => m.template_key !== templateKey))
      notify('Mensagem voltou a usar o padrão.')
    } catch (e) { setError(e.message) }
  }

  async function saveDefaultMessage(template) {
    try {
      const saved = await api.put('/api/message-defaults', template)
      setDefaultMessages((prev) => [...prev.filter((m) => m.template_key !== saved.template_key), saved].sort((a, b) => String(a.template_key).localeCompare(String(b.template_key))))
      notify('Mensagem padrão salva.')
    } catch (e) { setError(e.message) }
  }

  function messageTemplate(key) {
    const custom = messages.find((m) => m.template_key === key)?.content
    if (custom) return custom
    return defaultMessages.find((m) => m.template_key === key)?.content || ''
  }

  function appointmentVars(item) {
    return {
      nome: item.patient_name,
      data: formatDate(item.appointment_date),
      hora: item.start_time,
      modalidade: item.modality === 'online' ? 'Online' : 'Presencial',
      valor: formatBRL(item.price),
      link_consulta: professional?.online_link || '',
      pix: professional?.pix_key || '',
      profissional: professional?.name || '',
    }
  }

  function whatsappAppointment(item, key = 'appointment_confirmation') {
    try {
      const fallback = `Olá, ${item.patient_name}! Sua consulta com ${professional.name} está agendada para ${formatDate(item.appointment_date)} às ${item.start_time}.`
      const text = renderTemplate(messageTemplate(key) || fallback, appointmentVars(item))
      openWhatsApp(item.patient_whatsapp, text)
    } catch (e) { setError(e.message) }
  }

  function whatsappPatient(patient, key = 'first_contact') {
    try {
      const fallback = `Olá, ${patient.full_name}! Tudo bem? Eu cuido dos agendamentos de ${professional.name}. Como posso te ajudar?`
      const text = renderTemplate(messageTemplate(key) || fallback, { nome: patient.full_name, profissional: professional?.name || '' })
      openWhatsApp(patient.whatsapp, text)
    } catch (e) { setError(e.message) }
  }

  function sendAvailableTimes(patient) {
    setMessagePatient(patient)
    setAvailability({ mode: 'message', initial: { from: todayISO(), type: 'first', modality: patient.preferred_modality || 'online' }, context: { kind: 'message', patient } })
  }

  function useSelectedSlots(slots) {
    const lines = slots.map((s) => `• ${formatDate(s.date)} às ${s.start_time}`).join('\n')
    const template = messageTemplate('available_times') || 'Olá, {nome}! Tenho estes horários disponíveis:\n\n{horarios}\n\nQual deles fica melhor para você?'
    const text = renderTemplate(template, { nome: messagePatient.full_name, horarios: lines, profissional: professional?.name || '' })
    try { openWhatsApp(messagePatient.whatsapp, text) } catch (e) { setError(e.message) }
    setAvailability(null); setMessagePatient(null)
  }

  if (loading) return <div className="loading-screen"><div className="brand-mark">L</div><span>Carregando Libri Agenda...</span></div>

  if (!session?.authenticated) {
    const slug = window.location.pathname.split('/').filter(Boolean)[0] || 'admin'
    return <LoginScreen slug={slug} setupRequired={setupRequired} busy={authBusy} error={error} onLogin={login} onPasskey={biometricLogin} onSetup={setupAdmin} />
  }

  const inWorkspace = Boolean(professionalId && professional)
  const sidebarItems = session?.role === 'admin' && !inWorkspace ? adminNavItems : workspaceNavItems

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">L</div><div><strong>Libri Agenda</strong><span>gestão de atendimentos</span></div></div>
        {session?.role === 'admin' && inWorkspace && (
          <button className="workspace-back" onClick={leaveWorkspace}><ChevronLeft size={17}/> Voltar à Home</button>
        )}
        <nav>
          {sidebarItems.map(([name, Icon]) => (
            <button key={name} className={activeNav === name ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(name)}><Icon size={17} />{name}</button>
          ))}
        </nav>
        <div className="sidebar-foot"><span>{session?.name || 'Libri Agenda'}</span><small>{session?.role === 'admin' ? 'Administradora' : 'Profissional'}</small></div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark">L</div><strong>Libri Agenda</strong></div>
          {professional && (
            <div className="professional-switcher">
              {professional.photo_url ? <img src={professional.photo_url} alt="" /> : <div className="avatar">{initials(professional.name)}</div>}
              {session?.role === 'admin' ? (
                <label><span>Profissional atual</span><select value={professionalId || ''} onChange={(e) => { setProfessionalId(Number(e.target.value)); setActiveNav('Início') }}>{professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              ) : (
                <label><span>{professional.specialty || 'Profissional'}</span><strong>{professional.name}</strong></label>
              )}
            </div>
          )}
          <div className="top-actions">
            {session?.role === 'admin' && inWorkspace && <button className="ghost-button workspace-home-button" onClick={leaveWorkspace}><Home size={17}/><span>Home</span></button>}
            {professional && <button className="icon-button" title="Buscar" onClick={() => setActiveNav('Pacientes')}><Search size={18} /></button>}
            {professional && <button className="icon-button mobile-settings-button" title="Configurações" aria-label="Configurações" onClick={() => setActiveNav('Configurações')}><Settings size={18} /></button>}
            {professional && <button className="primary-button" onClick={() => setAppointmentModal({ initial: { appointment_date: todayISO() } })}><Plus size={18} /> Novo agendamento</button>}
            <button className="ghost-button" onClick={logout}>Sair</button>
          </div>
        </header>

        {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
        {workspaceLoading && <div className="thin-loader" />}

        {session?.role === 'admin' && !inWorkspace && activeNav === 'Home' && (
          <AdminHomeScreen session={session} professionals={professionals} onOpen={(id) => { setProfessionalId(id); setActiveNav('Início') }} onAdd={() => setProfessionalModal({})} onMessages={() => setActiveNav('Mensagens padrão')} />
        )}
        {session?.role === 'admin' && !inWorkspace && activeNav === 'Profissionais' && (
          <ProfessionalsScreen professionals={professionals} onOpen={(id) => { setProfessionalId(id); setActiveNav('Início') }} onEdit={setProfessionalModal} onAdd={() => setProfessionalModal({})} />
        )}
        {session?.role === 'admin' && !inWorkspace && activeNav === 'Mensagens padrão' && (
          <DefaultMessagesScreen messages={defaultMessages} onSave={saveDefaultMessage} />
        )}
        {session?.role === 'admin' && !inWorkspace && activeNav === 'Configurações' && (
          <AdminSettingsScreen session={session} passkeys={passkeys} passkeyBusy={passkeyBusy} onEnablePasskey={enablePasskey} onRemovePasskey={removePasskey} />
        )}
        {professional && activeNav === 'Início' && <HomeScreen professional={professional} todayAppointments={todayAppointments} pendingConfirmations={pendingConfirmations} pendingPayments={pendingPayments} pendingInvoices={pendingInvoices} onOpenAppointment={setAppointmentModal} onAgenda={() => setActiveNav('Agenda')} onFind={() => setAvailability({ mode: 'pick', initial: { from: todayISO(), type: 'first', modality: 'online' }, context: { kind: 'new', draft: { appointment_type: 'first', modality: 'online' } } })} onSettings={() => setActiveNav('Configurações')} />}
        {professional && activeNav === 'Agenda' && <AgendaScreen date={calendarDate} setDate={setCalendarDate} view={calendarView} setView={setCalendarView} appointments={appointments} blocks={blocks} onAppointment={setAppointmentModal} onNew={(date) => setAppointmentModal({ initial: { appointment_date: date } })} onBlock={(date, block = null) => setBlockModal({ date, block })} />}
        {professional && activeNav === 'Pacientes' && <PatientsScreen patients={patients} search={search} setSearch={setSearch} appointments={appointments} onOpen={openPatient} onNew={() => openPatient()} onWhatsApp={whatsappPatient} onTimes={sendAvailableTimes} onSchedule={(patient) => setAppointmentModal({ initial: { patient_id: patient.id, appointment_date: todayISO(), modality: patient.preferred_modality || 'online' } })} />}
        {professional && activeNav === 'Pendências' && <PendingScreen confirmations={pendingConfirmations} payments={pendingPayments} invoices={pendingInvoices} onOpen={setAppointmentModal} onWhatsApp={whatsappAppointment} onInvoice={setInvoiceModal} />}
        {professional && activeNav === 'Mensagens' && <MessagesScreen messages={messages} defaults={defaultMessages} professional={professional} onSave={saveMessage} onReset={resetMessage} />}
        {professional && activeNav === 'Configurações' && <SettingsScreen professional={professional} session={session} rules={rules} blocks={blocks} audit={audit} passkeys={passkeys} passkeyBusy={passkeyBusy} onEnablePasskey={enablePasskey} onRemovePasskey={removePasskey} onEdit={() => setProfessionalModal(professional)} onSaveRules={saveRules} onBlock={() => setBlockModal({ date: todayISO(), block: null })} onEditBlock={(block) => setBlockModal({ date: block.block_date, block })} onDeleteBlock={deleteBlock} />}

        {session?.role === 'professional' && !professional && <div className="empty-state big">Seu ambiente profissional não está disponível.</div>}
      </main>

      <MobileNav active={activeNav} setActive={setActiveNav} role={session?.role} inWorkspace={inWorkspace} onHome={leaveWorkspace} />

      {appointmentModal && <AppointmentModal
        appointment={appointmentModal.id ? appointmentModal : null}
        initial={appointmentModal.initial}
        professional={professional}
        patients={patients}
        onClose={() => setAppointmentModal(null)}
        onSave={saveAppointment}
        onStatus={quickStatus}
        onFindTime={openAvailabilityFromAppointment}
        onWhatsApp={() => whatsappAppointment(appointmentModal)}
        onReturn={startReturn}
      />}
      {patientModal && <PatientModal patient={patientModal.id ? patientModal : null} fiscal={patientFiscal} onClose={() => setPatientModal(null)} onSave={savePatient} onArchive={archivePatient} onDelete={deletePatient} />}
      {professionalModal && <ProfessionalModal professional={professionalModal.id ? professionalModal : null} onClose={() => setProfessionalModal(null)} onSave={saveProfessional} />}
      {blockModal && <BlockModal initialDate={blockModal.date} block={blockModal.block} onClose={() => setBlockModal(null)} onSave={saveBlock} onRemove={deleteBlock} onExcludeDate={excludeBlockDate} />}
      {availability && <AvailabilityModal professionalId={professionalId} api={api} initial={availability.initial} mode={availability.mode} maxSelect={3} onClose={() => setAvailability(null)} onPick={pickSlot} onUseSelected={useSelectedSlots} />}
      {invoiceModal && <InvoiceModal appointment={invoiceModal} onClose={() => setInvoiceModal(null)} onDone={async () => { await loadWorkspace(professionalId); setInvoiceModal(null); notify('Nota fiscal atualizada.') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function LoginScreen({ slug, setupRequired, busy, error, onLogin, onPasskey, onSetup }) {
  const isAdmin = slug === 'admin'
  const needsSetup = isAdmin && setupRequired
  const [name, setName] = useState('Julianna')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [localError, setLocalError] = useState('')
  const autoPasskeyStarted = useRef(false)

  useEffect(() => {
    if (needsSetup || !passkeySupported() || autoPasskeyStarted.current) return
    if (document.visibilityState !== 'visible') return

    autoPasskeyStarted.current = true
    const timer = window.setTimeout(() => {
      onPasskey(true, true)
    }, 250)

    return () => window.clearTimeout(timer)
    // Executar uma única vez para este link de login.
  }, [slug, needsSetup])

  function submit(e) {
    e.preventDefault()
    setLocalError('')
    if (needsSetup) {
      if (password.length < 8) return setLocalError('Use uma senha com pelo menos 8 caracteres.')
      if (password !== confirm) return setLocalError('As senhas não conferem.')
      onSetup(name, password)
      return
    }
    onLogin(password, remember)
  }

  return <div className="login-page">
    <div className="login-card">
      <div className="login-logo">L</div>
      <span className="eyebrow">Libri Agenda</span>
      <h1>{needsSetup ? 'Criar acesso da administradora' : isAdmin ? 'Área da administradora' : 'Acesso profissional'}</h1>
      <p>{needsSetup ? 'Defina sua senha uma única vez.' : busy ? 'Verificando a biometria deste aparelho...' : 'A biometria é solicitada automaticamente quando estiver disponível. A senha continua como alternativa.'}</p>
      <form onSubmit={submit}>
        {needsSetup && <label className="field"><span>Seu nome</span><input value={name} onChange={(e)=>setName(e.target.value)} required /></label>}
        <label className="field"><span>Senha</span><input type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} minLength="8" required autoFocus /></label>
        {needsSetup && <label className="field"><span>Confirmar senha</span><input type="password" value={confirm} onChange={(e)=>setConfirm(e.target.value)} minLength="8" required /></label>}
        {!needsSetup && <label className="remember-login"><input type="checkbox" checked={remember} onChange={(e)=>setRemember(e.target.checked)} /><span>Manter conectado neste aparelho</span></label>}
        {(localError || error) && <div className="login-error">{localError || error}</div>}
        <button className="primary-button login-submit" disabled={busy}>{busy ? 'Entrando...' : needsSetup ? 'Criar acesso' : 'Entrar'}</button>
        {!needsSetup && passkeySupported() && (
          <button type="button" className="biometric-login-button" disabled={busy} onClick={() => onPasskey(remember)}>
            <Fingerprint size={19}/> Entrar com biometria
          </button>
        )}
      </form>
      {!needsSetup && passkeySupported() && <small className="login-help">A digital, rosto ou PIN ficam no aparelho. A agenda não recebe seus dados biométricos.</small>}
      {!isAdmin && <small className="login-help">Este link abre somente o ambiente deste profissional.</small>}
    </div>
  </div>
}

function AdminHomeScreen({ session, professionals, onOpen, onAdd, onMessages }) {
  return <>
    <section className="admin-home-hero">
      <div><span className="eyebrow">Central administrativa</span><h1>Home</h1><p>Escolha um profissional para entrar no ambiente dele ou cuide das configurações gerais da sua operação.</p></div>
      <button className="primary-button" onClick={onAdd}><Plus size={18}/> Cadastrar profissional</button>
    </section>

    <div className="admin-summary-grid">
      <article className="admin-summary-card"><Stethoscope size={22}/><div><strong>{professionals.length}</strong><span>{professionals.length === 1 ? 'profissional ativo' : 'profissionais ativos'}</span></div></article>
      <button className="admin-summary-card action-card" onClick={onMessages}><MessageCircle size={22}/><div><strong>Mensagens padrão</strong><span>Defina textos usados por todos, com personalização por profissional.</span></div></button>
    </div>

    <section className="admin-home-section">
      <div className="panel-head"><div><span className="eyebrow">Ambientes</span><h2>Profissionais</h2></div></div>
      <div className="admin-professional-list">
        {professionals.map((p)=><button key={p.id} className="admin-professional-row" onClick={()=>onOpen(p.id)}>
          {p.photo_url ? <img src={p.photo_url} alt=""/> : <div className="avatar">{initials(p.name)}</div>}
          <div><strong>{p.name}</strong><span>{p.specialty || 'Profissional'}</span></div>
          <span className="open-workspace">Abrir ambiente <ChevronRight size={16}/></span>
        </button>)}
        {!professionals.length && <div className="empty-state">Nenhum profissional cadastrado ainda.</div>}
      </div>
    </section>
  </>
}

function DefaultMessagesScreen({ messages, onSave }) {
  const map = Object.fromEntries(messages.map((m)=>[m.template_key,m]))
  const [editing,setEditing]=useState(null)
  return <>
    <section className="page-head compact"><div><span className="eyebrow">Central administrativa</span><h1>Mensagens padrão</h1><p>Esses textos são usados automaticamente quando o profissional não possui uma versão personalizada.</p></div></section>
    <div className="message-grid">
      {messageTemplateCatalog.map(([key,title])=>{const item=map[key];return <article className="message-card" key={key}>
        <div className="message-card-head"><div><strong>{item?.title||title}</strong><small>Padrão · {key}</small></div><button className="ghost-button small" onClick={()=>setEditing(item||{template_key:key,title,content:'',active:1})}>Editar</button></div>
        <p>{item?.content||'Ainda não configurada.'}</p>
      </article>})}
    </div>
    {editing&&<MessageEditor item={editing} subtitle="Este texto será o padrão para todos os profissionais que não tiverem uma versão própria." onClose={()=>setEditing(null)} onSave={async(v)=>{await onSave(v);setEditing(null)}}/>}
  </>
}

function AdminSettingsScreen({ session, passkeys, passkeyBusy, onEnablePasskey, onRemovePasskey }) {
  return <>
    <section className="page-head compact"><div><span className="eyebrow">Central administrativa</span><h1>Configurações</h1><p>Segurança do seu acesso à Libri Agenda.</p></div></section>
    <div className="panel security-panel">
      <div className="security-head"><Fingerprint size={28}/><div><h2>Biometria da administradora</h2><p>Cadastre este aparelho para entrar usando digital, rosto ou PIN sem digitar sua senha.</p></div></div>
      {passkeySupported() ? <button className="primary-button fit" disabled={passkeyBusy} onClick={onEnablePasskey}><Fingerprint size={17}/> {passkeyBusy?'Aguardando aparelho...':'Ativar biometria neste aparelho'}</button> : <div className="helper">Este navegador não oferece suporte à biometria do aparelho.</div>}
      <div className="passkey-list"><strong>Biometrias cadastradas</strong>{passkeys?.length?passkeys.map((item)=><div className="passkey-item" key={item.id}><div><span>{item.device_label||'Aparelho'}</span><small>{item.created_at?`Cadastrada em ${new Date(item.created_at+'Z').toLocaleDateString('pt-BR')}`:''}</small></div><button className="danger-soft" onClick={()=>onRemovePasskey(item.id)}>Remover</button></div>):<small className="muted">Nenhuma biometria cadastrada para este acesso.</small>}</div>
    </div>
  </>
}

function ProfessionalsScreen({ professionals, onOpen, onEdit, onAdd }) {
  return <>
    <section className="page-head"><div><span className="eyebrow">Sua operação</span><h1>Meus profissionais</h1><p>Cada ambiente tem agenda, pacientes, mensagens e identidade próprios.</p></div><button className="primary-button" onClick={onAdd}><Plus size={18} /> Cadastrar profissional</button></section>
    <div className="professional-grid">
      {professionals.map((p) => <article className="professional-card" key={p.id} style={{ '--card-primary': p.primary_color, '--card-secondary': p.secondary_color }}>
        <div className="professional-card-top">{p.photo_url ? <img src={p.photo_url} alt="" /> : <div className="pro-avatar">{initials(p.name)}</div>}<span className="active-dot">Ativo</span></div>
        <h2>{p.name}</h2><p>{p.specialty || 'Profissional'}</p>
        <div className="color-dots"><i style={{ background: p.primary_color }} /><i style={{ background: p.secondary_color }} /><i style={{ background: p.accent_color }} /></div>
        <div className="card-actions"><button className="primary-button" onClick={() => onOpen(p.id)}>Abrir ambiente</button><button className="ghost-button" onClick={() => onEdit(p)}><Palette size={16} /> Editar</button></div>
      </article>)}
      {!professionals.length && <div className="empty-state big">Nenhum profissional cadastrado ainda.</div>}
    </div>
  </>
}

function HomeScreen({ professional, todayAppointments, pendingConfirmations, pendingPayments, pendingInvoices, onOpenAppointment, onAgenda, onFind, onSettings }) {
  return <>
    <section className="hero">
      <div><span className="eyebrow">{professional.specialty}</span><h1>Agenda da {professional.name}</h1><p>Consultas, pendências e próximos passos em uma visão limpa.</p></div>
      <div className="hero-actions">
        <div className="hero-badge"><Clock3 size={18} /> Consulta padrão: {professional.first_appointment_duration || 50} min</div>
        <button className="ghost-button workspace-settings-cta" onClick={onSettings}><Settings size={17}/> Configurações</button>
      </div>
    </section>
    <section className="stats-grid"><Stat icon={CalendarDays} label="Consultas hoje" value={todayAppointments.length} /><Stat icon={MessageCircle} label="Aguardando confirmação" value={pendingConfirmations.length} /><Stat icon={WalletCards} label="Pagamentos pendentes" value={pendingPayments.length} /><Stat icon={FileText} label="Notas fiscais" value={pendingInvoices.length} /></section>
    <section className="dashboard-grid">
      <div className="panel main-panel"><div className="panel-head"><div><span className="eyebrow">Hoje</span><h2>Consultas do dia</h2></div><button className="text-button" onClick={onAgenda}><CalendarDays size={17} /> Ver agenda</button></div><div className="appointment-list">{todayAppointments.map((a) => <AppointmentRow key={a.id} item={a} onOpen={() => onOpenAppointment(a)} />)}{!todayAppointments.length && <div className="empty-state">Nenhuma consulta hoje.</div>}</div></div>
      <div className="side-column"><div className="panel compact-panel"><span className="eyebrow">Disponibilidade</span><h2>Precisa achar um horário?</h2><p className="muted">A busca considera rotina, bloqueios e consultas já marcadas.</p><button className="secondary-button" onClick={onFind}>Encontrar horário</button></div><div className="panel compact-panel"><span className="eyebrow">Endereços</span><p><strong>Online:</strong> {professional.online_platform || '—'}</p><p><strong>Presencial:</strong> {professional.clinic_name || '—'}</p></div></div>
    </section>
  </>
}

function AgendaScreen({ date, setDate, view, setView, appointments, blocks, onAppointment, onNew, onBlock }) {
  const ranges = view === 'day' ? [date, date] : view === 'week' ? [startOfWeek(date), endOfWeek(date)] : [startOfMonth(date), endOfMonth(date)]
  const visibleAppointments = appointments.filter((a) => a.appointment_date >= ranges[0] && a.appointment_date <= ranges[1])
  const visibleBlocks = blocks.filter((b) => {
    if (Number(b.recurring) === 1) return true
    const endDate = b.end_date || b.block_date
    return b.block_date <= ranges[1] && endDate >= ranges[0]
  })
  function move(dir) { setDate(view === 'day' ? addDays(date, dir) : view === 'week' ? addDays(date, dir * 7) : addDays(startOfMonth(date), dir > 0 ? 35 : -7)) }
  return <>
    <section className="page-head compact"><div><span className="eyebrow">Agenda</span><h1>{view === 'day' ? formatLongDate(date) : view === 'week' ? `${formatDate(ranges[0])} a ${formatDate(ranges[1])}` : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseISODate(date))}</h1></div><div className="toolbar"><button className="icon-button" onClick={() => move(-1)}><ChevronLeft size={18} /></button><button className="ghost-button" onClick={() => setDate(todayISO())}>Hoje</button><button className="icon-button" onClick={() => move(1)}><ChevronRight size={18} /></button><div className="segmented">{[['day','Dia'],['week','Semana'],['month','Mês']].map(([k,l]) => <button key={k} className={view===k?'active':''} onClick={() => setView(k)}>{l}</button>)}</div><button className="ghost-button" onClick={() => onBlock(date)}><Ban size={16}/> Bloquear</button><button className="primary-button" onClick={() => onNew(date)}><Plus size={17}/> Consulta</button></div></section>
    {view === 'day' && <DayView date={date} appointments={visibleAppointments} blocks={visibleBlocks} onAppointment={onAppointment} onNew={onNew} onBlock={onBlock} />}
    {view === 'week' && <WeekView date={date} appointments={visibleAppointments} blocks={visibleBlocks} onAppointment={onAppointment} onNew={onNew} onBlock={onBlock} />}
    {view === 'month' && <MonthView date={date} appointments={visibleAppointments} blocks={visibleBlocks} onAppointment={onAppointment} onNew={onNew} onBlock={onBlock} />}
  </>
}

function DayView({ date, appointments, blocks, onAppointment, onNew, onBlock }) {
  const dayBlocks = blocks.filter((b) => blockAppliesToDate(b, date))
  return <div className="panel"><div className="calendar-day-head"><strong>{formatLongDate(date)}</strong><button className="text-button" onClick={() => dayBlocks.length ? onBlock(date, dayBlocks[0]) : onNew(date)}>{dayBlocks.length ? <><Ban size={16}/> Ver bloqueio</> : <><Plus size={16}/> Adicionar</>}</button></div>{dayBlocks.map((b) => <BlockRow key={`b-${b.id}`} block={b} onOpen={() => onBlock(date, b)} />)}<div className="appointment-list">{sortAppointments(appointments).map((a) => <AppointmentRow key={a.id} item={a} onOpen={() => onAppointment(a)} />)}{!appointments.length && !dayBlocks.length && <div className="empty-state">Dia livre.</div>}</div></div>
}

function WeekView({ date, appointments, blocks, onAppointment, onNew, onBlock }) {
  const start = startOfWeek(date)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return <div className="week-grid">{days.map((day) => { const dayBlocks = blocks.filter((b) => blockAppliesToDate(b, day)); const dayAppts = sortAppointments(appointments.filter((a) => a.appointment_date === day)); return <div className={`week-column ${day===todayISO()?'today':''}`} key={day}><button className="week-head" onClick={() => dayBlocks.length ? onBlock(day, dayBlocks[0]) : onNew(day)}><span>{weekdayShort(day)}</span><strong>{parseISODate(day).getDate()}</strong></button>{dayBlocks.map((b)=><button type="button" className="mini-block" key={`b-${b.id}`} onClick={()=>onBlock(day,b)}><Ban size={13}/>{b.title}</button>)}{dayAppts.map((a)=><button key={a.id} className={`mini-appointment ${a.status}`} onClick={()=>onAppointment(a)}><strong>{a.start_time}</strong><span>{a.patient_name}</span><small>{a.modality==='online'?'Online':'Presencial'}</small></button>)}{!dayBlocks.length&&!dayAppts.length&&<div className="week-empty">Livre</div>}</div>})}</div>
}

function MonthView({ date, appointments, blocks, onAppointment, onNew, onBlock }) {
  const days = monthGrid(date); const currentMonth = parseISODate(date).getMonth()
  return <div className="month-grid">{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d)=><div className="month-weekday" key={d}>{d}</div>)}{days.map((day)=>{const dayAppts=appointments.filter((a)=>a.appointment_date===day);const dayBlocks=blocks.filter((b)=>blockAppliesToDate(b,day));return <div className={`month-cell ${parseISODate(day).getMonth()!==currentMonth?'muted-cell':''} ${day===todayISO()?'today':''}`} key={day}><button className="month-date" onClick={()=>dayBlocks.length ? onBlock(day,dayBlocks[0]) : onNew(day)}>{parseISODate(day).getDate()}</button>{dayBlocks.slice(0,2).map((b)=><button type="button" className="month-block" key={`b-${b.id}`} onClick={()=>onBlock(day,b)}>{b.title}</button>)}{dayBlocks.length>2&&<small>+{dayBlocks.length-2} bloqueios</small>}{dayAppts.slice(0,3).map((a)=><button className="month-appt" key={a.id} onClick={()=>onAppointment(a)}>{a.start_time} {a.patient_name}</button>)}{dayAppts.length>3&&<small>+{dayAppts.length-3} consultas</small>}</div>})}</div>
}

function PatientsScreen({ patients, search, setSearch, appointments, onOpen, onNew, onWhatsApp, onTimes, onSchedule }) {
  const filtered = patients.filter((p) => `${p.full_name} ${p.whatsapp} ${p.email||''}`.toLowerCase().includes(search.toLowerCase()))
  return <><section className="page-head compact"><div><span className="eyebrow">Cadastros</span><h1>Pacientes</h1><p>Somente dados administrativos.</p></div><button className="primary-button" onClick={onNew}><UserRoundPlus size={18}/> Novo paciente</button></section><div className="search-box"><Search size={17}/><input placeholder="Buscar por nome, WhatsApp ou e-mail" value={search} onChange={(e)=>setSearch(e.target.value)}/></div><div className="table-card"><div className="table-head"><span>Paciente</span><span>Preferência</span><span>Próxima consulta</span><span>Ações</span></div>{filtered.map((p)=>{const next=sortAppointments(appointments.filter((a)=>a.patient_id===p.id&&a.appointment_date>=todayISO()&&!['cancelled'].includes(a.status)))[0];return <div className="table-row" key={p.id}><button className="patient-name" onClick={()=>onOpen(p)}><strong>{p.full_name}</strong><small>{p.whatsapp}</small></button><span>{p.preferred_modality==='online'?'Online':p.preferred_modality==='in_person'?'Presencial':'—'}</span><span>{next?`${formatDate(next.appointment_date)} · ${next.start_time}`:'—'}</span><div className="row-actions"><button onClick={()=>onWhatsApp(p)}>WhatsApp</button><button onClick={()=>onTimes(p)}>Horários</button><button onClick={()=>onSchedule(p)}>Agendar</button></div></div>})}{!filtered.length&&<div className="empty-state">Nenhum paciente encontrado.</div>}</div></>
}

function PendingScreen({ confirmations, payments, invoices, onOpen, onWhatsApp, onInvoice }) {
  return <><section className="page-head compact"><div><span className="eyebrow">Controle diário</span><h1>Pendências</h1><p>Resolveu, a pendência some automaticamente.</p></div></section><div className="pending-grid"><PendingGroup title="Confirmações" icon={MessageCircle} items={confirmations} empty="Nenhuma confirmação pendente." render={(a)=><PendingItem key={a.id} item={a} onOpen={()=>onOpen(a)} action={<button onClick={()=>onWhatsApp(a)}>WhatsApp</button>}/>} /><PendingGroup title="Pagamentos" icon={WalletCards} items={payments} empty="Nenhum pagamento pendente." render={(a)=><PendingItem key={a.id} item={a} onOpen={()=>onOpen(a)} action={<button onClick={()=>onOpen(a)}>Abrir</button>}/>} /><PendingGroup title="Notas fiscais" icon={FileText} items={invoices} empty="Nenhuma NF pendente." render={(a)=><PendingItem key={a.id} item={a} onOpen={()=>onOpen(a)} action={<button onClick={()=>onInvoice(a)}>NF</button>}/>} /></div></>
}

function MessagesScreen({ messages, defaults, professional, onSave, onReset }) {
  const customMap = Object.fromEntries(messages.map((m)=>[m.template_key,m]))
  const defaultMap = Object.fromEntries(defaults.map((m)=>[m.template_key,m]))
  const [editing, setEditing] = useState(null)

  return <>
    <section className="page-head compact"><div><span className="eyebrow">WhatsApp</span><h1>Mensagens de {professional.name}</h1><p>Por padrão, este ambiente usa as mensagens gerais. Personalize somente o que precisar.</p></div></section>
    <div className="message-grid">{messageTemplateCatalog.map(([key,title])=>{
      const custom=customMap[key]
      const base=defaultMap[key]
      const effective=custom||base
      return <article className="message-card" key={key}>
        <div className="message-card-head">
          <div><strong>{effective?.title||title}</strong><small className={custom?'message-source custom':'message-source'}>{custom?'Personalizada':'Usando padrão'} · {key}</small></div>
          <div className="message-card-actions">
            {custom&&<button className="text-button" onClick={()=>onReset(key)}>Usar padrão</button>}
            <button className="ghost-button small" onClick={()=>setEditing({...(effective||{template_key:key,title,content:'',active:1}), template_key:key, title:effective?.title||title})}>{custom?'Editar':'Personalizar'}</button>
          </div>
        </div>
        <p>{effective?.content||'Ainda não há texto padrão configurado.'}</p>
      </article>
    })}</div>
    {editing&&<MessageEditor item={editing} subtitle={`Esta versão será usada somente por ${professional.name}.`} onClose={()=>setEditing(null)} onSave={async(v)=>{await onSave(v);setEditing(null)}}/>}
  </>
}

function MessageEditor({ item, subtitle = 'Edite o texto da mensagem.', onClose, onSave }) {
  const [form,setForm]=useState(item)
  return <Modal title="Editar mensagem" subtitle={subtitle} onClose={onClose} wide><form className="form-grid" onSubmit={(e)=>{e.preventDefault();onSave(form)}}><label className="field"><span>Título</span><input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}/></label><label className="field"><span>Chave</span><input value={form.template_key} disabled/></label><label className="field span-2"><span>Mensagem</span><textarea rows="12" value={form.content||''} onChange={(e)=>setForm({...form,content:e.target.value})}/><small className="muted">Variáveis: {'{nome}'}, {'{profissional}'}, {'{data}'}, {'{hora}'}, {'{valor}'}, {'{horarios}'}, {'{pix}'}.</small></label><div className="modal-actions span-2"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button">Salvar mensagem</button></div></form></Modal>
}

function SettingsScreen({ professional, session, rules, blocks, audit, passkeys, passkeyBusy, onEnablePasskey, onRemovePasskey, onEdit, onSaveRules, onBlock, onEditBlock }) {
  const [tab,setTab]=useState('agenda')
  const initialWeekly = useMemo(()=>weekdays.map(([weekday,label])=>{const rule=rules.find((r)=>Number(r.weekday)===weekday);return {weekday,label,enabled:Boolean(rule),start_time:rule?.start_time||'09:00',end_time:rule?.end_time||'18:00',modality:rule?.modality||'both'}}),[rules])
  const [weekly,setWeekly]=useState(initialWeekly)
  useEffect(()=>setWeekly(initialWeekly),[initialWeekly])

  return <>
    <section className="page-head compact">
      <div><span className="eyebrow">Configurações</span><h1>{professional.name}</h1><p>Rotina, identidade, bloqueios e histórico.</p></div>
      <button className="primary-button" onClick={onEdit}><Palette size={17}/> Identidade e valores</button>
    </section>

    <div className="tabs">
      <button className={tab==='agenda'?'active':''} onClick={()=>setTab('agenda')}>Agenda</button>
      <button className={tab==='bloqueios'?'active':''} onClick={()=>setTab('bloqueios')}>Bloqueios</button>
      <button className={tab==='historico'?'active':''} onClick={()=>setTab('historico')}>Histórico</button>
      <button className={tab==='acesso'?'active':''} onClick={()=>setTab('acesso')}>Acesso</button>
    </div>

    {tab==='agenda'&&<div className="panel">
      <div className="panel-head"><div><h2>Rotina semanal</h2><p className="muted">Use apenas os períodos em que consultas particulares podem ser marcadas.</p></div></div>
      <div className="weekly-settings">{weekly.map((row,i)=><div className="weekly-row" key={row.weekday}><label className="check-field"><input type="checkbox" checked={row.enabled} onChange={(e)=>{const n=[...weekly];n[i]={...row,enabled:e.target.checked};setWeekly(n)}}/><strong>{row.label}</strong></label><input type="time" value={row.start_time} disabled={!row.enabled} onChange={(e)=>{const n=[...weekly];n[i]={...row,start_time:e.target.value};setWeekly(n)}}/><span>até</span><input type="time" value={row.end_time} disabled={!row.enabled} onChange={(e)=>{const n=[...weekly];n[i]={...row,end_time:e.target.value};setWeekly(n)}}/><select value={row.modality} disabled={!row.enabled} onChange={(e)=>{const n=[...weekly];n[i]={...row,modality:e.target.value};setWeekly(n)}}><option value="both">Online + presencial</option><option value="online">Somente online</option><option value="in_person">Somente presencial</option></select></div>)}</div>
      <div className="panel-actions"><button className="primary-button" onClick={()=>onSaveRules(weekly.filter((r)=>r.enabled).map(({weekday,start_time,end_time,modality})=>({weekday,start_time,end_time,modality})))}>Salvar rotina</button></div>
    </div>}

    {tab==='bloqueios'&&<div className="panel">
      <div className="panel-head"><div><h2>Bloqueios</h2><p className="muted">Ambulatório, pós, folga, férias e compromissos.</p></div><button className="primary-button" onClick={onBlock}><Plus size={16}/> Novo bloqueio</button></div>
      <div className="block-list">{blocks.map((b)=><div className="block-item" key={b.id}><Ban size={17}/><div><strong>{b.title}</strong><small>{Number(b.recurring)===1?`Recorrente · ${weekdays.find(([d])=>d===Number(b.recurrence_weekday))?.[1]||''}`:blockIsPeriod(b)?`${formatDate(b.block_date)} a ${formatDate(b.end_date)}${Number(b.all_day)===1?' · dia inteiro':` · ${b.start_time}–${b.end_time}`}`:`${formatDate(b.block_date)}${Number(b.all_day)===1?' · dia inteiro':` · ${b.start_time}–${b.end_time}`}`}</small></div><button className="ghost-button compact-action" onClick={()=>onEditBlock(b)}>Abrir</button></div>)}{!blocks.length&&<div className="empty-state">Nenhum bloqueio cadastrado.</div>}</div>
    </div>}

    {tab==='historico'&&<div className="panel">
      <div className="panel-head"><div><h2>Histórico de alterações</h2></div></div>
      <div className="audit-list">{audit.map((a)=><div className="audit-item" key={a.id}><History size={16}/><div><strong>{a.description||a.action}</strong><small>{a.user_name||'Sistema'} · {new Date(a.created_at+'Z').toLocaleString('pt-BR')}</small></div></div>)}{!audit.length&&<div className="empty-state">Ainda não há alterações registradas.</div>}</div>
    </div>}

    {tab==='acesso'&&<>
      <div className="panel access-panel">
        <LockKeyhole size={28}/>
        <div><h2>Acesso da profissional</h2><p>{professional.access_slug ? <>Link direto: <code>{window.location.origin}/{professional.access_slug}</code>. A senha pode ser alterada em <strong>Identidade e valores</strong>.</> : <>Ainda não há login próprio configurado. Abra <strong>Identidade e valores</strong>, escolha o link e defina uma senha.</>}</p></div>
      </div>

      {session?.role === 'professional' ? <div className="panel security-panel">
        <div className="security-head">
          <Fingerprint size={28}/>
          <div><h2>Biometria deste login</h2><p>A digital, rosto ou PIN são verificados pelo próprio aparelho.</p></div>
        </div>
        {passkeySupported() ? <button className="primary-button fit" disabled={passkeyBusy} onClick={onEnablePasskey}><Fingerprint size={17}/> {passkeyBusy ? 'Aguardando aparelho...' : 'Ativar biometria neste aparelho'}</button> : <div className="helper">Este navegador não oferece suporte à biometria do aparelho.</div>}
        <div className="passkey-list"><strong>Biometrias cadastradas</strong>{passkeys?.length ? passkeys.map((item)=><div className="passkey-item" key={item.id}><div><span>{item.device_label || 'Aparelho'}</span><small>{item.created_at ? `Cadastrada em ${new Date(item.created_at+'Z').toLocaleDateString('pt-BR')}` : ''}</small></div><button className="danger-soft" onClick={()=>onRemovePasskey(item.id)}>Remover</button></div>) : <small className="muted">Nenhuma biometria cadastrada para este login.</small>}</div>
      </div> : <div className="panel access-note"><Home size={22}/><div><strong>Sua biometria fica na Home administrativa</strong><p className="muted">Volte à Home e abra Configurações para gerenciar a biometria da administradora.</p></div></div>}
    </>}
  </>
}

function InvoiceModal({ appointment, onClose, onDone }) {
  const [form, setForm] = useState({ invoice_number: '', issued_at: todayISO(), mark_issued: true })
  const [invoice, setInvoice] = useState(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(true)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    api.get(`/api/appointments/${appointment.id}/invoice`)
      .then((data) => {
        if (cancelled) return
        setInvoice(data)
        setForm({
          invoice_number: data?.invoice_number || '',
          issued_at: data?.issued_at || todayISO(),
          mark_issued: appointment.invoice_status === 'issued' || Boolean(data?.issued_at),
        })
      })
      .catch((e) => !cancelled && setLocalError(e.message))
      .finally(() => !cancelled && setBusy(false))
    return () => { cancelled = true }
  }, [appointment.id])

  async function save(e) {
    e.preventDefault()
    setBusy(true); setLocalError('')
    try {
      await api.put(`/api/appointments/${appointment.id}/invoice`, form)
      if (file) await api.upload(`/api/appointments/${appointment.id}/invoice-file`, file)
      await onDone()
    } catch (e) {
      setLocalError(e.message)
      setBusy(false)
    }
  }

  function openPdf(download = false) {
    const suffix = download ? '?download=1' : ''
    window.open(`/api/appointments/${appointment.id}/invoice-file${suffix}`, '_blank', 'noopener,noreferrer')
  }

  async function sharePdf() {
    setLocalError('')
    try {
      const blob = await api.blob(`/api/appointments/${appointment.id}/invoice-file`)
      const name = invoice?.file_name || `nota-fiscal-${appointment.patient_name || appointment.id}.pdf`
      const shareFile = new File([blob], name, { type: 'application/pdf' })
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [shareFile] }))) {
        await navigator.share({ files: [shareFile], title: 'Nota fiscal' })
        return
      }
      openPdf(true)
    } catch (e) {
      if (e?.name !== 'AbortError') setLocalError(e.message || 'Não foi possível compartilhar o PDF.')
    }
  }

  async function removePdf() {
    if (!window.confirm('Remover o PDF anexado desta nota fiscal?')) return
    setBusy(true); setLocalError('')
    try {
      await api.delete(`/api/appointments/${appointment.id}/invoice-file`)
      setInvoice((prev) => ({ ...(prev || {}), file_name: '', file_url: '' }))
      setFile(null)
    } catch (e) { setLocalError(e.message) }
    finally { setBusy(false) }
  }

  return <Modal title={`Nota fiscal · ${appointment.patient_name}`} subtitle="O PDF fica privado e vinculado somente a esta consulta." onClose={onClose}>
    <form className="form-grid" onSubmit={save}>
      {localError && <div className="inline-error span-2">{localError}</div>}
      <label className="field span-2"><span>Número da nota</span><input value={form.invoice_number} onChange={(e)=>setForm({...form,invoice_number:e.target.value})}/></label>
      <label className="field span-2"><span>Data de emissão</span><input type="date" value={form.issued_at} onChange={(e)=>setForm({...form,issued_at:e.target.value})}/></label>
      <label className="field span-2"><span>PDF da nota fiscal</span><input type="file" accept="application/pdf,.pdf" onChange={(e)=>setFile(e.target.files?.[0] || null)}/><small>{file ? `Novo arquivo: ${file.name}` : 'PDF de até 10 MB.'}</small></label>
      {invoice?.file_name && <div className="invoice-file span-2"><div><FileText size={20}/><div><strong>{invoice.file_name}</strong><small>PDF anexado</small></div></div><div className="invoice-file-actions"><button type="button" className="ghost-button small" onClick={()=>openPdf(false)}>Visualizar</button><button type="button" className="ghost-button small" onClick={()=>openPdf(true)}>Baixar</button><button type="button" className="primary-button small" onClick={sharePdf}>Compartilhar</button><button type="button" className="danger-soft" onClick={removePdf}>Remover</button></div></div>}
      <label className="check-field span-2"><input type="checkbox" checked={form.mark_issued} onChange={(e)=>setForm({...form,mark_issued:e.target.checked})}/><span>Marcar NF como emitida</span></label>
      <div className="modal-actions span-2"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}>{busy?'Salvando...':'Salvar NF'}</button></div>
    </form>
  </Modal>
}

function AppointmentRow({ item, onOpen }) { return <button className="appointment-row" onClick={onOpen}><div className="time-cell"><strong>{item.start_time}</strong><small>{item.end_time}</small></div><div className="appointment-main"><strong>{item.patient_name}</strong><span>{item.appointment_type==='first'?'Primeira consulta':'Retorno'} · {item.modality==='online'?'Online':'Presencial'}</span></div><StatusBadge value={item.status}/><div className="money-cell"><strong>{formatBRL(item.price)}</strong><StatusBadge value={item.payment_status} kind="payment"/></div></button> }
function BlockRow({ block, onOpen }) { return <button type="button" className="block-row block-row-button" onClick={onOpen}><Ban size={16}/><strong>{block.title}</strong><span>{Number(block.all_day)===1?'Dia inteiro':`${block.start_time}–${block.end_time}`}</span></button> }
function Stat({ icon:Icon,label,value }) { return <div className="stat-card"><div className="stat-icon"><Icon size={18}/></div><strong>{value}</strong><span>{label}</span></div> }
function PendingGroup({ title, icon:Icon, items, empty, render }) { return <section className="panel"><div className="panel-head"><div className="group-title"><Icon size={18}/><h2>{title}</h2></div><span className="count-pill">{items.length}</span></div>{items.length?items.map(render):<div className="empty-state">{empty}</div>}</section> }
function PendingItem({ item, onOpen, action }) { return <div className="pending-item"><button onClick={onOpen}><strong>{item.patient_name}</strong><span>{formatDate(item.appointment_date)} · {item.start_time}</span></button>{action}</div> }
function MobileNav({ active, setActive, role, inWorkspace, onHome }) {
  const items = role === 'admin' && !inWorkspace
    ? [['Home',Home],['Profissionais',Stethoscope],['Mensagens padrão',MessageCircle],['Configurações',Settings]]
    : [['Início',Home],['Agenda',CalendarDays],['Pacientes',UsersRound],['Pendências',WalletCards],['Mensagens',MessageCircle],['Configurações',Settings]]
  return <div className="mobile-nav" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>{items.map(([name,Icon])=><button key={name} className={active===name?'active':''} onClick={()=>setActive(name)}><Icon size={19}/><span>{name}</span></button>)}</div>
}
