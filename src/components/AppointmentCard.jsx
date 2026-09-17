import { MessageCircle, CalendarClock, CheckCircle2 } from 'lucide-react'

const statusLabel = {
  confirmed: 'Confirmada',
  waiting: 'Aguardando confirmação',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  missed: 'Faltou',
  reserved: 'Reservado',
}

export default function AppointmentCard({ item }) {
  return (
    <article className={`appointment status-${item.status}`}>
      <div className="appointment-time">{item.time}</div>
      <div className="appointment-main">
        <strong>{item.patient}</strong>
        <span>{item.type} · {item.modality}</span>
        <span className="status-pill">{statusLabel[item.status] ?? item.status}</span>
      </div>
      <div className="quick-actions" aria-label="Ações rápidas">
        <button title="WhatsApp"><MessageCircle size={17} /></button>
        <button title="Reagendar"><CalendarClock size={17} /></button>
        <button title="Marcar realizada"><CheckCircle2 size={17} /></button>
      </div>
    </article>
  )
}
