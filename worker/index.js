const json = (data, init = {}) => Response.json(data, init)

function error(message, status = 400) {
  return json({ error: message }, { status })
}

async function bodyJson(request) {
  try {
    return await request.json()
  } catch {
    throw new Error('Corpo JSON inválido.')
  }
}

function isoDate(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDate(value) {
  const [y, m, d] = String(value).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0)
}

function addDays(value, amount) {
  const d = parseDate(value)
  d.setDate(d.getDate() + amount)
  return isoDate(d)
}

function timeToMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(total) {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB
}

async function getSession(request, env) {
  const accessRequired = String(env.REQUIRE_ACCESS || 'false').toLowerCase() === 'true'
  const email = request.headers.get('CF-Access-Authenticated-User-Email') || ''

  if (!accessRequired) {
    return { authenticated: false, role: 'admin', name: 'Administradora', email: '', professional_id: null }
  }

  if (!email) return null

  const user = await env.DB.prepare(`
    SELECT id, name, email, role, professional_id
    FROM users
    WHERE lower(email) = lower(?) AND active = 1
    LIMIT 1
  `).bind(email).first()

  return user ? { authenticated: true, ...user } : null
}

function canAccessProfessional(session, professionalId) {
  if (!session) return false
  return session.role === 'admin' || Number(session.professional_id) === Number(professionalId)
}

async function audit(env, session, professionalId, entityType, entityId, action, description = '') {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_log (professional_id, user_id, entity_type, entity_id, action, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      professionalId || null,
      session?.id || null,
      entityType,
      entityId || null,
      action,
      description,
    ).run()
  } catch (e) {
    console.warn('Falha ao registrar auditoria:', e?.message)
  }
}

function professionalPrice(professional, type, modality) {
  if (type === 'first' && modality === 'online') return professional.first_online_price
  if (type === 'first' && modality === 'in_person') return professional.first_in_person_price
  if (type === 'followup' && modality === 'online') return professional.followup_online_price
  if (type === 'followup' && modality === 'in_person') return professional.followup_in_person_price
  return null
}

function professionalDuration(professional, type) {
  return Number(type === 'first'
    ? professional.first_appointment_duration
    : professional.followup_appointment_duration) || 50
}

async function listAvailability(env, professionalId, url) {
  const professional = await env.DB.prepare(`SELECT * FROM professionals WHERE id = ? LIMIT 1`)
    .bind(professionalId).first()
  if (!professional) throw new Error('Profissional não encontrado.')

  const from = url.searchParams.get('from') || isoDate()
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 30), 1), 60)
  const type = url.searchParams.get('type') === 'first' ? 'first' : 'followup'
  const modality = url.searchParams.get('modality') === 'in_person' ? 'in_person' : 'online'
  const period = url.searchParams.get('period') || 'any'
  const duration = Number(url.searchParams.get('duration')) || professionalDuration(professional, type)
  const interval = Number(professional.interval_minutes || 0)
  const to = addDays(from, days - 1)

  const rulesResult = await env.DB.prepare(`
    SELECT * FROM schedule_rules
    WHERE professional_id = ? AND active = 1
    ORDER BY weekday, start_time
  `).bind(professionalId).all()

  const appointmentsResult = await env.DB.prepare(`
    SELECT appointment_date, start_time, end_time, status
    FROM appointments
    WHERE professional_id = ?
      AND appointment_date BETWEEN ? AND ?
      AND status != 'cancelled'
  `).bind(professionalId, from, to).all()

  const blocksResult = await env.DB.prepare(`
    SELECT * FROM schedule_blocks
    WHERE professional_id = ?
      AND (recurring = 1 OR block_date BETWEEN ? AND ?)
  `).bind(professionalId, from, to).all()

  const rules = rulesResult.results || []
  const appointments = appointmentsResult.results || []
  const blocks = blocksResult.results || []
  const slots = []

  for (let offset = 0; offset < days && slots.length < 50; offset += 1) {
    const date = addDays(from, offset)
    const weekday = parseDate(date).getDay()
    const dateRules = rules.filter((rule) =>
      Number(rule.weekday) === weekday &&
      (rule.modality === 'both' || rule.modality === modality),
    )

    for (const rule of dateRules) {
      const ruleStart = timeToMinutes(rule.start_time)
      const ruleEnd = timeToMinutes(rule.end_time)
      const step = Math.max(duration + interval, 10)

      for (let start = ruleStart; start + duration <= ruleEnd; start += step) {
        const end = start + duration
        const startTime = minutesToTime(start)
        const endTime = minutesToTime(end)

        if (period === 'morning' && start >= 12 * 60) continue
        if (period === 'afternoon' && start < 12 * 60) continue

        const blocked = blocks.some((block) => {
          const recurringMatch = Number(block.recurring) === 1 && Number(block.recurrence_weekday) === weekday
          const dateMatch = block.block_date === date
          if (!recurringMatch && !dateMatch) return false
          if (Number(block.all_day) === 1 || !block.start_time || !block.end_time) return true
          return overlaps(start, end, timeToMinutes(block.start_time), timeToMinutes(block.end_time))
        })
        if (blocked) continue

        const occupied = appointments.some((appointment) => {
          if (appointment.appointment_date !== date) return false
          return overlaps(start, end, timeToMinutes(appointment.start_time), timeToMinutes(appointment.end_time))
        })
        if (occupied) continue

        slots.push({ date, start_time: startTime, end_time: endTime, duration_minutes: duration })
        if (slots.length >= 50) break
      }
      if (slots.length >= 50) break
    }
  }

  return { professional_id: professionalId, from, to, type, modality, duration, slots }
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url)

      if (url.pathname === '/api/health') {
        return json({ ok: true, app: 'libri-agenda', database: Boolean(env.DB) })
      }

      if (!env.DB) return error('D1 binding DB não configurado.', 503)

      const session = await getSession(request, env)
      const accessRequired = String(env.REQUIRE_ACCESS || 'false').toLowerCase() === 'true'
      if (accessRequired && !session) return error('Acesso não autorizado.', 401)

      if (url.pathname === '/api/session' && request.method === 'GET') {
        return json(session)
      }

      // PROFESSIONALS -------------------------------------------------------
      if (url.pathname === '/api/professionals' && request.method === 'GET') {
        const where = session?.role === 'professional' ? 'WHERE id = ? AND active = 1' : 'WHERE active = 1'
        const stmt = env.DB.prepare(`
          SELECT id, name, specialty, professional_registry, photo_url, logo_url,
                 primary_color, secondary_color, accent_color, theme_mode, active,
                 online_enabled, in_person_enabled, online_platform, online_link,
                 clinic_name, clinic_address, first_online_price, first_in_person_price,
                 followup_online_price, followup_in_person_price,
                 first_appointment_duration, followup_appointment_duration,
                 interval_minutes, pix_key, pix_holder, payment_instructions, invoice_mode
          FROM professionals
          ${where}
          ORDER BY name
        `)
        const result = session?.role === 'professional'
          ? await stmt.bind(session.professional_id).all()
          : await stmt.all()
        return json(result.results || [])
      }

      if (url.pathname === '/api/professionals' && request.method === 'POST') {
        if (session?.role !== 'admin') return error('Somente a administradora pode cadastrar profissionais.', 403)
        const data = await bodyJson(request)
        if (!String(data.name || '').trim()) return error('Nome é obrigatório.')

        const result = await env.DB.prepare(`
          INSERT INTO professionals (
            name, specialty, professional_registry, photo_url, logo_url,
            primary_color, secondary_color, accent_color, theme_mode,
            online_enabled, in_person_enabled, online_platform, online_link,
            clinic_name, clinic_address, first_online_price, first_in_person_price,
            followup_online_price, followup_in_person_price,
            first_appointment_duration, followup_appointment_duration, interval_minutes,
            pix_key, pix_holder, payment_instructions, invoice_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          String(data.name).trim(), data.specialty || '', data.professional_registry || '',
          data.photo_url || '', data.logo_url || '', data.primary_color || '#6f8278',
          data.secondary_color || '#d8e0dc', data.accent_color || '#b88968', data.theme_mode || 'light',
          data.online_enabled === false ? 0 : 1, data.in_person_enabled === false ? 0 : 1,
          data.online_platform || '', data.online_link || '', data.clinic_name || '', data.clinic_address || '',
          data.first_online_price ?? null, data.first_in_person_price ?? null,
          data.followup_online_price ?? null, data.followup_in_person_price ?? null,
          Number(data.first_appointment_duration || 50), Number(data.followup_appointment_duration || 50),
          Number(data.interval_minutes || 0), data.pix_key || '', data.pix_holder || '',
          data.payment_instructions || '', data.invoice_mode || 'on_request',
        ).run()
        const id = result.meta?.last_row_id
        await audit(env, session, id, 'professional', id, 'create', 'Profissional cadastrado')
        const row = await env.DB.prepare('SELECT * FROM professionals WHERE id = ?').bind(id).first()
        return json(row, { status: 201 })
      }

      const professionalMatch = url.pathname.match(/^\/api\/professionals\/(\d+)$/)
      if (professionalMatch) {
        const professionalId = Number(professionalMatch[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)

        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT * FROM professionals WHERE id = ? LIMIT 1').bind(professionalId).first()
          return row ? json(row) : error('Profissional não encontrado.', 404)
        }

        if (request.method === 'PATCH') {
          const data = await bodyJson(request)
          const allowed = [
            'name', 'specialty', 'professional_registry', 'photo_url', 'logo_url',
            'primary_color', 'secondary_color', 'accent_color', 'theme_mode', 'active',
            'online_enabled', 'in_person_enabled', 'online_platform', 'online_link',
            'clinic_name', 'clinic_address', 'first_online_price', 'first_in_person_price',
            'followup_online_price', 'followup_in_person_price', 'first_appointment_duration',
            'followup_appointment_duration', 'interval_minutes', 'pix_key', 'pix_holder',
            'payment_instructions', 'invoice_mode',
          ]
          const entries = Object.entries(data).filter(([key]) => allowed.includes(key))
          if (!entries.length) return error('Nenhum campo válido para atualizar.')
          const set = entries.map(([key]) => `${key} = ?`).join(', ')
          await env.DB.prepare(`UPDATE professionals SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(...entries.map(([, value]) => value ?? null), professionalId).run()
          await audit(env, session, professionalId, 'professional', professionalId, 'update', 'Configurações atualizadas')
          const row = await env.DB.prepare('SELECT * FROM professionals WHERE id = ?').bind(professionalId).first()
          return json(row)
        }
      }

      // PATIENTS ------------------------------------------------------------
      const patientsCollection = url.pathname.match(/^\/api\/professionals\/(\d+)\/patients$/)
      if (patientsCollection) {
        const professionalId = Number(patientsCollection[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)

        if (request.method === 'GET') {
          const q = String(url.searchParams.get('q') || '').trim()
          const archived = url.searchParams.get('archived') === '1' ? 1 : 0
          const result = q
            ? await env.DB.prepare(`
                SELECT * FROM patients
                WHERE professional_id = ? AND archived = ?
                  AND (full_name LIKE ? OR whatsapp LIKE ? OR email LIKE ?)
                ORDER BY full_name
              `).bind(professionalId, archived, `%${q}%`, `%${q}%`, `%${q}%`).all()
            : await env.DB.prepare(`
                SELECT * FROM patients
                WHERE professional_id = ? AND archived = ?
                ORDER BY full_name
              `).bind(professionalId, archived).all()
          return json(result.results || [])
        }

        if (request.method === 'POST') {
          const data = await bodyJson(request)
          if (!String(data.full_name || '').trim()) return error('Nome do paciente é obrigatório.')
          if (!String(data.whatsapp || '').trim()) return error('WhatsApp é obrigatório.')
          const result = await env.DB.prepare(`
            INSERT INTO patients (
              professional_id, full_name, whatsapp, email, preferred_modality,
              birth_date, administrative_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            professionalId, String(data.full_name).trim(), String(data.whatsapp).trim(),
            data.email || '', data.preferred_modality || null, data.birth_date || null,
            data.administrative_notes || '',
          ).run()
          const id = result.meta?.last_row_id
          await audit(env, session, professionalId, 'patient', id, 'create', `Paciente ${data.full_name} cadastrado`)
          const row = await env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(id).first()
          return json(row, { status: 201 })
        }
      }

      const patientMatch = url.pathname.match(/^\/api\/patients\/(\d+)$/)
      if (patientMatch) {
        const patientId = Number(patientMatch[1])
        const current = await env.DB.prepare('SELECT * FROM patients WHERE id = ? LIMIT 1').bind(patientId).first()
        if (!current) return error('Paciente não encontrado.', 404)
        if (!canAccessProfessional(session, current.professional_id)) return error('Sem acesso a este paciente.', 403)

        if (request.method === 'GET') return json(current)

        if (request.method === 'PATCH') {
          const data = await bodyJson(request)
          const allowed = ['full_name', 'whatsapp', 'email', 'preferred_modality', 'birth_date', 'administrative_notes', 'archived']
          const entries = Object.entries(data).filter(([key]) => allowed.includes(key))
          if (!entries.length) return error('Nenhum campo válido para atualizar.')
          const set = entries.map(([key]) => `${key} = ?`).join(', ')
          await env.DB.prepare(`UPDATE patients SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(...entries.map(([, value]) => value ?? null), patientId).run()
          await audit(env, session, current.professional_id, 'patient', patientId, 'update', 'Cadastro administrativo atualizado')
          return json(await env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(patientId).first())
        }
      }

      const fiscalMatch = url.pathname.match(/^\/api\/patients\/(\d+)\/fiscal$/)
      if (fiscalMatch) {
        const patientId = Number(fiscalMatch[1])
        const patient = await env.DB.prepare('SELECT * FROM patients WHERE id = ?').bind(patientId).first()
        if (!patient) return error('Paciente não encontrado.', 404)
        if (!canAccessProfessional(session, patient.professional_id)) return error('Sem acesso a este paciente.', 403)

        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT * FROM patient_fiscal_data WHERE patient_id = ?').bind(patientId).first()
          return json(row || { patient_id: patientId })
        }

        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          await env.DB.prepare(`
            INSERT INTO patient_fiscal_data (patient_id, cpf, invoice_email, address, city, state, postal_code, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(patient_id) DO UPDATE SET
              cpf = excluded.cpf,
              invoice_email = excluded.invoice_email,
              address = excluded.address,
              city = excluded.city,
              state = excluded.state,
              postal_code = excluded.postal_code,
              updated_at = CURRENT_TIMESTAMP
          `).bind(
            patientId, data.cpf || '', data.invoice_email || '', data.address || '',
            data.city || '', data.state || '', data.postal_code || '',
          ).run()
          await audit(env, session, patient.professional_id, 'patient_fiscal_data', patientId, 'update', 'Dados fiscais atualizados')
          return json(await env.DB.prepare('SELECT * FROM patient_fiscal_data WHERE patient_id = ?').bind(patientId).first())
        }
      }

      // APPOINTMENTS --------------------------------------------------------
      const appointmentsCollection = url.pathname.match(/^\/api\/professionals\/(\d+)\/appointments$/)
      if (appointmentsCollection) {
        const professionalId = Number(appointmentsCollection[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)

        if (request.method === 'GET') {
          const from = url.searchParams.get('from')
          const to = url.searchParams.get('to')
          const status = url.searchParams.get('status')
          let query = `
            SELECT a.*, p.full_name AS patient_name, p.whatsapp AS patient_whatsapp,
                   p.email AS patient_email, p.preferred_modality
            FROM appointments a
            JOIN patients p ON p.id = a.patient_id
            WHERE a.professional_id = ?
          `
          const params = [professionalId]
          if (from) { query += ' AND a.appointment_date >= ?'; params.push(from) }
          if (to) { query += ' AND a.appointment_date <= ?'; params.push(to) }
          if (status) { query += ' AND a.status = ?'; params.push(status) }
          query += ' ORDER BY a.appointment_date, a.start_time'
          const result = await env.DB.prepare(query).bind(...params).all()
          return json(result.results || [])
        }

        if (request.method === 'POST') {
          const data = await bodyJson(request)
          const professional = await env.DB.prepare('SELECT * FROM professionals WHERE id = ?').bind(professionalId).first()
          const patient = await env.DB.prepare('SELECT * FROM patients WHERE id = ? AND professional_id = ?').bind(data.patient_id, professionalId).first()
          if (!patient) return error('Paciente inválido para este profissional.')
          if (!data.appointment_date || !data.start_time) return error('Data e horário são obrigatórios.')
          const type = data.appointment_type === 'first' ? 'first' : 'followup'
          const modality = data.modality === 'in_person' ? 'in_person' : 'online'
          const duration = Number(data.duration_minutes) || professionalDuration(professional, type)
          const endTime = data.end_time || minutesToTime(timeToMinutes(data.start_time) + duration)
          const price = data.price ?? professionalPrice(professional, type, modality)
          const status = data.status || 'awaiting_confirmation'

          const clash = await env.DB.prepare(`
            SELECT id FROM appointments
            WHERE professional_id = ? AND appointment_date = ? AND status != 'cancelled'
              AND start_time < ? AND end_time > ?
            LIMIT 1
          `).bind(professionalId, data.appointment_date, endTime, data.start_time).first()
          if (clash) return error('Já existe uma consulta ocupando esse horário.', 409)

          const result = await env.DB.prepare(`
            INSERT INTO appointments (
              professional_id, patient_id, appointment_date, start_time, end_time,
              appointment_type, modality, status, duration_minutes, price,
              payment_status, invoice_status, administrative_notes, created_by_user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            professionalId, data.patient_id, data.appointment_date, data.start_time, endTime,
            type, modality, status, duration, price,
            data.payment_status || 'pending', data.invoice_status || 'not_requested',
            data.administrative_notes || '', session?.id || null,
          ).run()
          const id = result.meta?.last_row_id
          await audit(env, session, professionalId, 'appointment', id, 'create', `${patient.full_name} em ${data.appointment_date} ${data.start_time}`)
          const row = await env.DB.prepare(`
            SELECT a.*, p.full_name AS patient_name, p.whatsapp AS patient_whatsapp
            FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?
          `).bind(id).first()
          return json(row, { status: 201 })
        }
      }

      const appointmentMatch = url.pathname.match(/^\/api\/appointments\/(\d+)$/)
      if (appointmentMatch) {
        const appointmentId = Number(appointmentMatch[1])
        const current = await env.DB.prepare(`
          SELECT a.*, p.full_name AS patient_name FROM appointments a
          JOIN patients p ON p.id = a.patient_id WHERE a.id = ? LIMIT 1
        `).bind(appointmentId).first()
        if (!current) return error('Consulta não encontrada.', 404)
        if (!canAccessProfessional(session, current.professional_id)) return error('Sem acesso a esta consulta.', 403)

        if (request.method === 'GET') return json(current)

        if (request.method === 'PATCH') {
          const data = await bodyJson(request)
          const allowed = [
            'appointment_date', 'start_time', 'end_time', 'appointment_type', 'modality',
            'status', 'duration_minutes', 'price', 'payment_status', 'invoice_status', 'administrative_notes',
          ]
          const entries = Object.entries(data).filter(([key]) => allowed.includes(key))
          if (!entries.length) return error('Nenhum campo válido para atualizar.')

          if (data.appointment_date || data.start_time || data.end_time) {
            const newDate = data.appointment_date || current.appointment_date
            const newStart = data.start_time || current.start_time
            const duration = Number(data.duration_minutes || current.duration_minutes || 50)
            const newEnd = data.end_time || (data.start_time ? minutesToTime(timeToMinutes(newStart) + duration) : current.end_time)
            const clash = await env.DB.prepare(`
              SELECT id FROM appointments
              WHERE professional_id = ? AND appointment_date = ? AND status != 'cancelled'
                AND id != ? AND start_time < ? AND end_time > ? LIMIT 1
            `).bind(current.professional_id, newDate, appointmentId, newEnd, newStart).first()
            if (clash) return error('Já existe uma consulta ocupando esse horário.', 409)
            if (!('end_time' in data) && data.start_time) entries.push(['end_time', newEnd])
          }

          const set = entries.map(([key]) => `${key} = ?`).join(', ')
          await env.DB.prepare(`UPDATE appointments SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .bind(...entries.map(([, value]) => value ?? null), appointmentId).run()

          const changedSchedule = data.appointment_date || data.start_time || data.end_time
          const description = changedSchedule
            ? `Reagendado de ${current.appointment_date} ${current.start_time}`
            : `Consulta de ${current.patient_name} atualizada`
          await audit(env, session, current.professional_id, 'appointment', appointmentId, changedSchedule ? 'rebook' : 'update', description)

          return json(await env.DB.prepare(`
            SELECT a.*, p.full_name AS patient_name, p.whatsapp AS patient_whatsapp
            FROM appointments a JOIN patients p ON p.id = a.patient_id WHERE a.id = ?
          `).bind(appointmentId).first())
        }
      }

      const invoiceMatch = url.pathname.match(/^\/api\/appointments\/(\d+)\/invoice$/)
      if (invoiceMatch) {
        const appointmentId = Number(invoiceMatch[1])
        const appointment = await env.DB.prepare('SELECT * FROM appointments WHERE id = ?').bind(appointmentId).first()
        if (!appointment) return error('Consulta não encontrada.', 404)
        if (!canAccessProfessional(session, appointment.professional_id)) return error('Sem acesso a esta consulta.', 403)

        if (request.method === 'GET') {
          return json(await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first() || { appointment_id: appointmentId })
        }
        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          await env.DB.prepare(`
            INSERT INTO invoices (appointment_id, invoice_number, issued_at, file_name, file_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
              invoice_number = excluded.invoice_number,
              issued_at = excluded.issued_at,
              file_name = excluded.file_name,
              file_url = excluded.file_url
          `).bind(
            appointmentId, data.invoice_number || '', data.issued_at || null,
            data.file_name || '', data.file_url || '',
          ).run()
          if (data.mark_issued) {
            await env.DB.prepare("UPDATE appointments SET invoice_status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .bind(appointmentId).run()
          }
          await audit(env, session, appointment.professional_id, 'invoice', appointmentId, 'update', 'Nota fiscal atualizada')
          return json(await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first())
        }
      }

      // BLOCKS --------------------------------------------------------------
      const blocksCollection = url.pathname.match(/^\/api\/professionals\/(\d+)\/blocks$/)
      if (blocksCollection) {
        const professionalId = Number(blocksCollection[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        if (request.method === 'GET') {
          const from = url.searchParams.get('from')
          const to = url.searchParams.get('to')
          let query = 'SELECT * FROM schedule_blocks WHERE professional_id = ?'
          const params = [professionalId]
          if (from && to) {
            query += ' AND (recurring = 1 OR block_date BETWEEN ? AND ?)'
            params.push(from, to)
          }
          query += ' ORDER BY block_date, start_time'
          return json((await env.DB.prepare(query).bind(...params).all()).results || [])
        }
        if (request.method === 'POST') {
          const data = await bodyJson(request)
          if (!data.title || !data.block_date) return error('Título e data são obrigatórios.')
          const result = await env.DB.prepare(`
            INSERT INTO schedule_blocks (
              professional_id, title, block_date, start_time, end_time,
              all_day, recurring, recurrence_weekday
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            professionalId, data.title, data.block_date, data.start_time || null,
            data.end_time || null, data.all_day ? 1 : 0, data.recurring ? 1 : 0,
            data.recurrence_weekday ?? null,
          ).run()
          const id = result.meta?.last_row_id
          await audit(env, session, professionalId, 'schedule_block', id, 'create', data.title)
          return json(await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(id).first(), { status: 201 })
        }
      }

      const blockMatch = url.pathname.match(/^\/api\/blocks\/(\d+)$/)
      if (blockMatch && request.method === 'DELETE') {
        const blockId = Number(blockMatch[1])
        const block = await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(blockId).first()
        if (!block) return error('Bloqueio não encontrado.', 404)
        if (!canAccessProfessional(session, block.professional_id)) return error('Sem acesso a este bloqueio.', 403)
        await env.DB.prepare('DELETE FROM schedule_blocks WHERE id = ?').bind(blockId).run()
        await audit(env, session, block.professional_id, 'schedule_block', blockId, 'delete', block.title)
        return json({ ok: true })
      }

      // SCHEDULE RULES ------------------------------------------------------
      const rulesCollection = url.pathname.match(/^\/api\/professionals\/(\d+)\/schedule-rules$/)
      if (rulesCollection) {
        const professionalId = Number(rulesCollection[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        if (request.method === 'GET') {
          return json((await env.DB.prepare(`
            SELECT * FROM schedule_rules WHERE professional_id = ? ORDER BY weekday, start_time
          `).bind(professionalId).all()).results || [])
        }
        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          const rules = Array.isArray(data.rules) ? data.rules : []
          await env.DB.prepare('DELETE FROM schedule_rules WHERE professional_id = ?').bind(professionalId).run()
          for (const rule of rules) {
            if (!rule.start_time || !rule.end_time) continue
            await env.DB.prepare(`
              INSERT INTO schedule_rules (professional_id, weekday, start_time, end_time, modality, active)
              VALUES (?, ?, ?, ?, ?, 1)
            `).bind(
              professionalId, Number(rule.weekday), rule.start_time, rule.end_time,
              ['online', 'in_person', 'both'].includes(rule.modality) ? rule.modality : 'both',
            ).run()
          }
          await audit(env, session, professionalId, 'schedule_rules', professionalId, 'replace', 'Disponibilidade semanal atualizada')
          return json((await env.DB.prepare(`
            SELECT * FROM schedule_rules WHERE professional_id = ? ORDER BY weekday, start_time
          `).bind(professionalId).all()).results || [])
        }
      }

      // MESSAGES ------------------------------------------------------------
      const messagesCollection = url.pathname.match(/^\/api\/professionals\/(\d+)\/messages$/)
      if (messagesCollection) {
        const professionalId = Number(messagesCollection[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        if (request.method === 'GET') {
          return json((await env.DB.prepare(`
            SELECT id, template_key, title, content, active
            FROM message_templates WHERE professional_id = ? ORDER BY id
          `).bind(professionalId).all()).results || [])
        }
        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          if (!data.template_key || !data.title) return error('Chave e título são obrigatórios.')
          await env.DB.prepare(`
            INSERT INTO message_templates (professional_id, template_key, title, content, active, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(professional_id, template_key) DO UPDATE SET
              title = excluded.title,
              content = excluded.content,
              active = excluded.active,
              updated_at = CURRENT_TIMESTAMP
          `).bind(professionalId, data.template_key, data.title, data.content || '', data.active === false ? 0 : 1).run()
          await audit(env, session, professionalId, 'message_template', null, 'update', data.title)
          return json(await env.DB.prepare(`
            SELECT id, template_key, title, content, active FROM message_templates
            WHERE professional_id = ? AND template_key = ?
          `).bind(professionalId, data.template_key).first())
        }
      }

      // AVAILABILITY --------------------------------------------------------
      const availabilityMatch = url.pathname.match(/^\/api\/professionals\/(\d+)\/availability$/)
      if (availabilityMatch && request.method === 'GET') {
        const professionalId = Number(availabilityMatch[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        return json(await listAvailability(env, professionalId, url))
      }

      // AUDIT ---------------------------------------------------------------
      const auditMatch = url.pathname.match(/^\/api\/professionals\/(\d+)\/audit$/)
      if (auditMatch && request.method === 'GET') {
        const professionalId = Number(auditMatch[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        return json((await env.DB.prepare(`
          SELECT a.*, u.name AS user_name
          FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.professional_id = ? ORDER BY a.created_at DESC LIMIT 100
        `).bind(professionalId).all()).results || [])
      }

      return error('Rota não encontrada.', 404)
    } catch (e) {
      console.error(e)
      return error(e?.message || 'Erro interno.', 500)
    }
  },
}
