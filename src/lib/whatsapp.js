export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length <= 11) digits = `55${digits}`
  return digits
}

export function renderTemplate(template, vars = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
}

export function openWhatsApp(phone, message = '') {
  const digits = normalizePhone(phone)
  if (!digits) throw new Error('Paciente sem WhatsApp cadastrado.')
  const url = `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
