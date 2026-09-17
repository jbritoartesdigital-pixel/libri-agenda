const labels = {
  reserved: 'Reservado',
  awaiting_confirmation: 'Aguardando confirmação',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  no_show: 'Faltou',
  pending: 'Pendente',
  paid: 'Pago',
  exempt: 'Isento',
  not_requested: 'Não solicitada',
  awaiting_data: 'Aguardando dados',
  ready: 'Pronta para emissão',
  issued: 'Emitida',
}

export default function StatusBadge({ value, kind = 'status' }) {
  return <span className={`status-badge ${kind} ${value || 'neutral'}`}>{labels[value] || value || '—'}</span>
}
