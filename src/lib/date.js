export function todayISO() {
  const d = new Date()
  return toISODate(d)
}

export function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(value) {
  const [y, m, d] = String(value).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function addDays(value, amount) {
  const d = typeof value === 'string' ? parseISODate(value) : new Date(value)
  d.setDate(d.getDate() + amount)
  return toISODate(d)
}

export function startOfWeek(value) {
  const d = typeof value === 'string' ? parseISODate(value) : new Date(value)
  const day = d.getDay()
  const delta = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + delta)
  return toISODate(d)
}

export function endOfWeek(value) {
  return addDays(startOfWeek(value), 6)
}

export function startOfMonth(value) {
  const d = typeof value === 'string' ? parseISODate(value) : new Date(value)
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonth(value) {
  const d = typeof value === 'string' ? parseISODate(value) : new Date(value)
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function monthGrid(value) {
  const first = parseISODate(startOfMonth(value))
  const mondayIndex = (first.getDay() + 6) % 7
  const gridStart = addDays(first, -mondayIndex)
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  const { year = true, ...rest } = options
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(year === false ? {} : { year: 'numeric' }),
    ...rest,
  }).format(parseISODate(value))
}

export function formatLongDate(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(parseISODate(value))
}

export function weekdayShort(value) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
    .format(parseISODate(value))
    .replace('.', '')
}

export function formatBRL(value) {
  if (value === null || value === undefined || value === '') return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value))
}

export function minutesToTime(total) {
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function timeToMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number)
  return h * 60 + m
}
