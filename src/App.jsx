import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, Clock3, MessageCircle, Plus, Search, UsersRound } from 'lucide-react'
import AppointmentCard from './components/AppointmentCard'
import StatCard from './components/StatCard'
import { appointments, freeSlots, professionals } from './data/demo'
import { applyProfessionalTheme } from './lib/theme'

const navItems = ['Início', 'Agenda', 'Pacientes', 'Pendências', 'Mensagens']

export default function App() {
  const [professionalId, setProfessionalId] = useState(professionals[0].id)
  const [activeNav, setActiveNav] = useState('Início')

  const professional = useMemo(
    () => professionals.find((p) => p.id === professionalId) ?? professionals[0],
    [professionalId],
  )

  const todayAppointments = appointments.filter((a) => a.professionalId === professional.id)
  const waiting = todayAppointments.filter((a) => a.status === 'waiting').length
  const pendingPayments = todayAppointments.filter((a) => a.payment === 'pending').length
  const pendingInvoices = todayAppointments.filter((a) => ['waiting_data', 'ready'].includes(a.invoice)).length

  useEffect(() => {
    applyProfessionalTheme(professional.theme)
  }, [professional])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">L</div>
          <div>
            <strong>Libri Agenda</strong>
            <span>gestão de atendimentos</span>
          </div>
        </div>

        <nav>
          {navItems.map((item) => (
            <button
              key={item}
              className={activeNav === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveNav(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span>V1 · protótipo funcional</span>
          <small>Sem dados reais de pacientes.</small>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="professional-switcher">
            <div className="avatar">{professional.initials}</div>
            <label>
              <span>Profissional atual</span>
              <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <ChevronDown size={16} className="select-icon" />
          </div>

          <div className="top-actions">
            <button className="icon-button" title="Buscar"><Search size={18} /></button>
            <button className="primary-button"><Plus size={18} /> Novo agendamento</button>
          </div>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">{professional.specialty}</span>
            <h1>Agenda da {professional.name}</h1>
            <p>Consultas, pendências e próximos horários em uma única visão.</p>
          </div>
          <div className="hero-badge">
            <Clock3 size={18} />
            Consulta padrão: {professional.settings.durationMinutes} min
          </div>
        </section>

        <section className="stats-grid">
          <StatCard label="Consultas hoje" value={todayAppointments.length} hint="agenda atual" />
          <StatCard label="Aguardando confirmação" value={waiting} hint="precisam de contato" />
          <StatCard label="Pagamentos pendentes" value={pendingPayments} hint="acompanhar" />
          <StatCard label="Notas fiscais" value={pendingInvoices} hint="com pendência" />
        </section>

        <section className="dashboard-grid">
          <div className="panel main-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Hoje</span>
                <h2>Consultas do dia</h2>
              </div>
              <button className="text-button"><CalendarDays size={17} /> Ver agenda</button>
            </div>
            <div className="appointment-list">
              {todayAppointments.map((item) => <AppointmentCard key={item.id} item={item} />)}
            </div>
          </div>

          <div className="side-column">
            <div className="panel compact-panel">
              <div className="panel-head small">
                <div>
                  <span className="eyebrow">Disponibilidade</span>
                  <h2>Próximos horários</h2>
                </div>
              </div>
              <div className="slot-list">
                {freeSlots.map((slot) => <button key={slot}>{slot}</button>)}
              </div>
              <button className="secondary-button">Encontrar horário</button>
            </div>

            <div className="panel compact-panel">
              <span className="eyebrow">Atalhos</span>
              <div className="shortcut-grid">
                <button><UsersRound size={18} /> Pacientes</button>
                <button><MessageCircle size={18} /> Mensagens</button>
                <button><CalendarDays size={18} /> Bloquear horário</button>
                <button><Clock3 size={18} /> Reagendar</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
