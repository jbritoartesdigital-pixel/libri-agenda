const json = (data, init = {}) => Response.json(data, init)

function error(message, status = 400) {
  return json({ error: message }, { status })
}

function safeFilename(value = 'nota-fiscal.pdf') {
  const cleaned = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned || 'nota-fiscal'}.pdf`
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

function blockMatchesDate(block, date, weekday, exceptionDates = new Set()) {
  if (exceptionDates.has(`${block.id}:${date}`)) return false

  if (Number(block.recurring) === 1) {
    if (block.block_date && date < block.block_date) return false
    return Number(block.recurrence_weekday) === Number(weekday)
  }

  const endDate = block.end_date || block.block_date
  return date >= block.block_date && date <= endDate
}

function normalizeBlockData(data) {
  const recurring = Boolean(data.recurring)
  const blockDate = String(data.block_date || '')
  const endDate = recurring ? blockDate : String(data.end_date || blockDate)
  return {
    title: String(data.title || '').trim(),
    block_date: blockDate,
    end_date: endDate,
    start_time: data.all_day ? null : (data.start_time || null),
    end_time: data.all_day ? null : (data.end_time || null),
    all_day: data.all_day ? 1 : 0,
    recurring: recurring ? 1 : 0,
    recurrence_weekday: recurring ? Number(data.recurrence_weekday) : null,
  }
}

const SESSION_COOKIE = 'libri_session'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30
const SESSION_SHORT_AGE = 60 * 60 * 12
const PASSKEY_CHALLENGE_AGE = 60 * 5
const PBKDF2_ITERATIONS = 100000

function bytesToBase64(bytes) {
  let binary = ''
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function cookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || ''
  const parts = cookie.split(';').map((item) => item.trim())
  for (const part of parts) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index) === name) return decodeURIComponent(part.slice(index + 1))
  }
  return ''
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToBase64(digest)
}

async function passwordHash(password, saltBase64 = '') {
  const salt = saltBase64 ? base64ToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return { salt: bytesToBase64(salt), hash: bytesToBase64(bits) }
}

async function passwordMatches(password, salt, expectedHash) {
  const result = await passwordHash(password, salt)
  return result.hash === expectedHash
}

function sessionCookie(token, maxAge = SESSION_MAX_AGE, persistent = true) {
  if (!token) {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  }
  const persistence = persistent ? `; Max-Age=${maxAge}` : ''
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax${persistence}`
}

function authJson(data, token = null, init = {}, cookieOptions = {}) {
  const headers = new Headers(init.headers || {})
  if (token !== null) {
    headers.append('Set-Cookie', sessionCookie(
      token,
      cookieOptions.maxAge ?? SESSION_MAX_AGE,
      cookieOptions.persistent ?? true,
    ))
  }
  return json(data, { ...init, headers })
}

async function createSession(env, account, remember = true) {
  const rawToken = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
  const tokenHash = await sha256(rawToken)
  const maxAge = remember ? SESSION_MAX_AGE : SESSION_SHORT_AGE
  const expiresAt = Math.floor(Date.now() / 1000) + maxAge
  await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(Math.floor(Date.now() / 1000)).run()
  await env.DB.prepare(`
    INSERT INTO auth_sessions (account_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).bind(account.id, tokenHash, expiresAt).run()
  return { token: rawToken, maxAge, persistent: remember }
}


function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  return base64ToBytes(padded)
}

function randomBase64Url(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)))
}

function equalBytes(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a)
  const right = b instanceof Uint8Array ? b : new Uint8Array(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i]
  return diff === 0
}

function concatBytes(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a)
  const right = b instanceof Uint8Array ? b : new Uint8Array(b)
  const out = new Uint8Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}

function readDerLength(bytes, state) {
  let length = bytes[state.offset++]
  if ((length & 0x80) === 0) return length
  const count = length & 0x7f
  if (count < 1 || count > 2) throw new Error('Assinatura biométrica inválida.')
  length = 0
  for (let i = 0; i < count; i += 1) length = (length << 8) | bytes[state.offset++]
  return length
}

function derEcdsaToRaw(signature) {
  const bytes = signature instanceof Uint8Array ? signature : new Uint8Array(signature)
  if (bytes.length === 64) return bytes
  const state = { offset: 0 }
  if (bytes[state.offset++] !== 0x30) throw new Error('Assinatura biométrica inválida.')
  readDerLength(bytes, state)
  if (bytes[state.offset++] !== 0x02) throw new Error('Assinatura biométrica inválida.')
  const rLength = readDerLength(bytes, state)
  let r = bytes.slice(state.offset, state.offset + rLength)
  state.offset += rLength
  if (bytes[state.offset++] !== 0x02) throw new Error('Assinatura biométrica inválida.')
  const sLength = readDerLength(bytes, state)
  let s = bytes.slice(state.offset, state.offset + sLength)

  while (r.length > 32 && r[0] === 0) r = r.slice(1)
  while (s.length > 32 && s[0] === 0) s = s.slice(1)
  if (r.length > 32 || s.length > 32) throw new Error('Assinatura biométrica inválida.')

  const raw = new Uint8Array(64)
  raw.set(r, 32 - r.length)
  raw.set(s, 64 - s.length)
  return raw
}

function clientDataFromBase64Url(value) {
  const bytes = base64UrlToBytes(value)
  const text = new TextDecoder().decode(bytes)
  return { bytes, data: JSON.parse(text) }
}

async function createPasskeyChallenge(env, accountId, purpose, request) {
  const now = Math.floor(Date.now() / 1000)
  const url = new URL(request.url)
  const challenge = randomBase64Url(32)
  await env.DB.prepare('DELETE FROM passkey_challenges WHERE expires_at <= ?').bind(now).run()
  await env.DB.prepare(`
    INSERT INTO passkey_challenges (account_id, challenge, purpose, rp_id, origin, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(accountId, challenge, purpose, url.hostname, url.origin, now + PASSKEY_CHALLENGE_AGE).run()
  return { challenge, rpId: url.hostname, origin: url.origin }
}

async function verifyPasskeyClientData(env, accountId, purpose, encodedClientData, expectedType) {
  let parsed
  try {
    parsed = clientDataFromBase64Url(encodedClientData)
  } catch {
    throw new Error('Dados de autenticação inválidos.')
  }

  const challenge = String(parsed.data?.challenge || '')
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(`
    SELECT *
    FROM passkey_challenges
    WHERE account_id = ?
      AND purpose = ?
      AND challenge = ?
      AND expires_at > ?
    LIMIT 1
  `).bind(accountId, purpose, challenge, now).first()

  if (!row) throw new Error('A solicitação de biometria expirou. Tente novamente.')
  if (parsed.data?.type !== expectedType) throw new Error('Tipo de autenticação inválido.')
  if (parsed.data?.origin !== row.origin) throw new Error('Origem da autenticação inválida.')

  return { ...parsed, challengeRow: row }
}

async function verifyAuthenticatorData(authenticatorData, rpId) {
  const bytes = base64UrlToBytes(authenticatorData)
  if (bytes.length < 37) throw new Error('Dados do autenticador inválidos.')

  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)),
  )
  if (!equalBytes(bytes.slice(0, 32), expectedRpIdHash)) {
    throw new Error('Esta biometria não pertence a este endereço.')
  }

  const flags = bytes[32]
  if ((flags & 0x01) === 0) throw new Error('Confirmação do usuário ausente.')
  if ((flags & 0x04) === 0) throw new Error('A biometria ou bloqueio seguro do aparelho não foi confirmado.')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const signCount = view.getUint32(33, false)
  return { bytes, signCount }
}

async function verifyPasskeySignature(publicKeySpki, signatureValue, authenticatorBytes, clientDataBytes) {
  const key = await crypto.subtle.importKey(
    'spki',
    base64UrlToBytes(publicKeySpki),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )

  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes))
  const signedData = concatBytes(authenticatorBytes, clientHash)
  const signature = base64UrlToBytes(signatureValue)
  const rawSignature = derEcdsaToRaw(signature)

  let valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    rawSignature,
    signedData,
  )

  if (!valid && signature.length !== rawSignature.length) {
    try {
      valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        signature,
        signedData,
      )
    } catch {}
  }

  return valid
}

async function getSession(request, env) {
  const token = cookieValue(request, SESSION_COOKIE)
  if (!token) return null
  const tokenHash = await sha256(token)
  const now = Math.floor(Date.now() / 1000)
  const row = await env.DB.prepare(`
    SELECT
      a.id AS account_id,
      a.user_id,
      a.role,
      a.professional_id,
      a.slug,
      u.name,
      u.email
    FROM auth_sessions s
    JOIN auth_accounts a ON a.id = s.account_id
    LEFT JOIN users u ON u.id = a.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > ?
      AND a.active = 1
    LIMIT 1
  `).bind(tokenHash, now).first()

  if (!row) return null
  return {
    authenticated: true,
    id: row.user_id || null,
    account_id: row.account_id,
    user_id: row.user_id || null,
    role: row.role,
    professional_id: row.professional_id,
    slug: row.slug,
    name: row.name || (row.role === 'admin' ? 'Administradora' : 'Profissional'),
    email: row.email || '',
  }
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
      session?.user_id || session?.id || null,
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
      AND (
        recurring = 1
        OR (block_date <= ? AND COALESCE(end_date, block_date) >= ?)
      )
  `).bind(professionalId, to, from).all()

  const exceptionsResult = await env.DB.prepare(`
    SELECT e.block_id, e.exception_date
    FROM schedule_block_exceptions e
    JOIN schedule_blocks b ON b.id = e.block_id
    WHERE b.professional_id = ?
      AND e.exception_date BETWEEN ? AND ?
  `).bind(professionalId, from, to).all()

  const rules = rulesResult.results || []
  const appointments = appointmentsResult.results || []
  const blocks = blocksResult.results || []
  const exceptionDates = new Set((exceptionsResult.results || []).map((row) => `${row.block_id}:${row.exception_date}`))
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
          if (!blockMatchesDate(block, date, weekday, exceptionDates)) return false
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

      // AUTH ---------------------------------------------------------------
      if (url.pathname === '/api/auth/session' && request.method === 'GET') {
        const session = await getSession(request, env)
        const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM auth_accounts WHERE role = 'admin' AND active = 1").first()
        return json({
          ...(session || { authenticated: false }),
          setup_required: Number(countRow?.total || 0) === 0,
        })
      }

      if (url.pathname === '/api/auth/setup' && request.method === 'POST') {
        const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM auth_accounts WHERE role = 'admin' AND active = 1").first()
        if (Number(countRow?.total || 0) > 0) return error('A administradora já foi configurada.', 409)
        const data = await bodyJson(request)
        const name = String(data.name || 'Julianna').trim() || 'Julianna'
        const password = String(data.password || '')
        if (password.length < 8) return error('A senha precisa ter pelo menos 8 caracteres.')

        // Gera o hash antes de tocar no banco, evitando deixar usuário órfão
        // caso a derivação da senha falhe.
        const encrypted = await passwordHash(password)

        // Setup idempotente: se uma tentativa anterior já criou o usuário,
        // reaproveita o mesmo registro em vez de falhar no UNIQUE(email).
        await env.DB.prepare(`
          INSERT INTO users (name, email, role, professional_id, active)
          VALUES (?, ?, 'admin', NULL, 1)
          ON CONFLICT(email) DO UPDATE SET
            name = excluded.name,
            role = 'admin',
            professional_id = NULL,
            active = 1
        `).bind(name, 'admin@libri.local').run()

        const user = await env.DB.prepare(`
          SELECT id
          FROM users
          WHERE email = ?
          LIMIT 1
        `).bind('admin@libri.local').first()

        if (!user?.id) return error('Não foi possível preparar a conta administradora.', 500)

        // Também reaproveita um auth_accounts incompleto/inativo, se existir.
        await env.DB.prepare(`
          INSERT INTO auth_accounts (
            user_id,
            role,
            professional_id,
            slug,
            password_hash,
            password_salt,
            active
          )
          VALUES (?, 'admin', NULL, 'admin', ?, ?, 1)
          ON CONFLICT(slug) DO UPDATE SET
            user_id = excluded.user_id,
            role = 'admin',
            professional_id = NULL,
            password_hash = excluded.password_hash,
            password_salt = excluded.password_salt,
            active = 1,
            updated_at = CURRENT_TIMESTAMP
        `).bind(user.id, encrypted.hash, encrypted.salt).run()

        const account = await env.DB.prepare(`
          SELECT id
          FROM auth_accounts
          WHERE slug = 'admin'
          LIMIT 1
        `).first()

        if (!account?.id) return error('Não foi possível criar o acesso da administradora.', 500)
        const authSession = await createSession(env, account, true)
        return authJson(
          { authenticated: true, role: 'admin', slug: 'admin', name },
          authSession.token,
          { status: 201 },
          authSession,
        )
      }

      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const data = await bodyJson(request)
        const slug = String(data.slug || '').trim().toLowerCase()
        const password = String(data.password || '')
        if (!slug || !password) return error('Informe a senha.', 400)
        const account = await env.DB.prepare(`
          SELECT a.*, u.name, u.email
          FROM auth_accounts a
          LEFT JOIN users u ON u.id = a.user_id
          WHERE lower(a.slug) = lower(?) AND a.active = 1
          LIMIT 1
        `).bind(slug).first()
        if (!account || !(await passwordMatches(password, account.password_salt, account.password_hash))) {
          return error('Senha incorreta.', 401)
        }
        const remember = data.remember !== false
        const authSession = await createSession(env, account, remember)
        return authJson({
          authenticated: true,
          id: account.user_id || null,
          user_id: account.user_id || null,
          account_id: account.id,
          role: account.role,
          professional_id: account.professional_id,
          slug: account.slug,
          name: account.name || (account.role === 'admin' ? 'Administradora' : 'Profissional'),
          email: account.email || '',
        }, authSession.token, {}, authSession)
      }

      if (url.pathname === '/api/auth/passkey/login/options' && request.method === 'POST') {
        const data = await bodyJson(request)
        const slug = String(data.slug || '').trim().toLowerCase()
        if (!slug) return error('Acesso inválido.')

        const account = await env.DB.prepare(`
          SELECT a.id, a.user_id, a.role, a.professional_id, a.slug, u.name, u.email
          FROM auth_accounts a
          LEFT JOIN users u ON u.id = a.user_id
          WHERE lower(a.slug) = lower(?) AND a.active = 1
          LIMIT 1
        `).bind(slug).first()
        if (!account) return error('Acesso não encontrado.', 404)

        const credentials = await env.DB.prepare(`
          SELECT credential_id
          FROM passkey_credentials
          WHERE account_id = ?
          ORDER BY id
        `).bind(account.id).all()
        if (!(credentials.results || []).length) {
          return error('Ainda não há biometria cadastrada para este acesso.', 404)
        }

        const challenge = await createPasskeyChallenge(env, account.id, 'login', request)
        return json({
          challenge: challenge.challenge,
          rpId: challenge.rpId,
          timeout: 60000,
          allowCredentials: (credentials.results || []).map((item) => ({
            type: 'public-key',
            id: item.credential_id,
          })),
        })
      }

      if (url.pathname === '/api/auth/passkey/login/verify' && request.method === 'POST') {
        const data = await bodyJson(request)
        const slug = String(data.slug || '').trim().toLowerCase()
        const credentialId = String(data.credential_id || '')
        if (!slug || !credentialId) return error('Credencial biométrica inválida.')

        const credential = await env.DB.prepare(`
          SELECT
            c.*,
            a.id AS auth_account_id,
            a.user_id,
            a.role,
            a.professional_id,
            a.slug,
            a.active,
            u.name,
            u.email
          FROM passkey_credentials c
          JOIN auth_accounts a ON a.id = c.account_id
          LEFT JOIN users u ON u.id = a.user_id
          WHERE c.credential_id = ?
            AND lower(a.slug) = lower(?)
            AND a.active = 1
          LIMIT 1
        `).bind(credentialId, slug).first()
        if (!credential) return error('Biometria não reconhecida para este acesso.', 401)

        try {
          const client = await verifyPasskeyClientData(
            env,
            credential.account_id,
            'login',
            data.client_data_json,
            'webauthn.get',
          )
          const authenticator = await verifyAuthenticatorData(
            data.authenticator_data,
            client.challengeRow.rp_id,
          )
          const valid = await verifyPasskeySignature(
            credential.public_key_spki,
            data.signature,
            authenticator.bytes,
            client.bytes,
          )
          if (!valid) return error('Não foi possível validar a biometria.', 401)

          const previousCount = Number(credential.sign_count || 0)
          const nextCount = Number(authenticator.signCount || 0)
          if (previousCount > 0 && nextCount > 0 && nextCount <= previousCount) {
            return error('A credencial biométrica apresentou uma inconsistência de segurança.', 401)
          }

          await env.DB.prepare(`
            UPDATE passkey_credentials
            SET sign_count = ?, last_used_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(nextCount, credential.id).run()
          await env.DB.prepare('DELETE FROM passkey_challenges WHERE id = ?').bind(client.challengeRow.id).run()

          const remember = data.remember !== false
          const account = {
            id: credential.auth_account_id,
            user_id: credential.user_id,
            role: credential.role,
            professional_id: credential.professional_id,
            slug: credential.slug,
          }
          const authSession = await createSession(env, account, remember)
          return authJson({
            authenticated: true,
            id: credential.user_id || null,
            user_id: credential.user_id || null,
            account_id: credential.auth_account_id,
            role: credential.role,
            professional_id: credential.professional_id,
            slug: credential.slug,
            name: credential.name || (credential.role === 'admin' ? 'Administradora' : 'Profissional'),
            email: credential.email || '',
          }, authSession.token, {}, authSession)
        } catch (e) {
          return error(e.message || 'Não foi possível validar a biometria.', 401)
        }
      }

      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = cookieValue(request, SESSION_COOKIE)
        if (token) {
          const tokenHash = await sha256(token)
          await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash).run()
        }
        return authJson({ ok: true }, '')
      }

      const session = await getSession(request, env)
      if (!session) return error('Acesso não autorizado.', 401)

      if (url.pathname === '/api/session' && request.method === 'GET') {
        return json(session)
      }

      if (url.pathname === '/api/auth/passkeys' && request.method === 'GET') {
        const result = await env.DB.prepare(`
          SELECT id, device_label, created_at, last_used_at
          FROM passkey_credentials
          WHERE account_id = ?
          ORDER BY created_at DESC, id DESC
        `).bind(session.account_id).all()
        return json(result.results || [])
      }

      if (url.pathname === '/api/auth/passkey/register/options' && request.method === 'POST') {
        const existing = await env.DB.prepare(`
          SELECT credential_id
          FROM passkey_credentials
          WHERE account_id = ?
        `).bind(session.account_id).all()
        const challenge = await createPasskeyChallenge(env, session.account_id, 'register', request)
        return json({
          challenge: challenge.challenge,
          rp: { name: 'Libri Agenda', id: challenge.rpId },
          user: {
            id: bytesToBase64Url(new TextEncoder().encode(`libri-account:${session.account_id}`)),
            name: session.slug,
            displayName: session.name || session.slug,
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout: 60000,
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
          excludeCredentials: (existing.results || []).map((item) => ({
            type: 'public-key',
            id: item.credential_id,
          })),
        })
      }

      if (url.pathname === '/api/auth/passkey/register/verify' && request.method === 'POST') {
        const data = await bodyJson(request)
        const credentialId = String(data.credential_id || '')
        const publicKeySpki = String(data.public_key_spki || '')
        const algorithm = Number(data.algorithm)
        if (!credentialId || !publicKeySpki) return error('Credencial biométrica incompleta.')
        if (algorithm !== -7) return error('Este tipo de biometria ainda não é compatível.')

        try {
          const client = await verifyPasskeyClientData(
            env,
            session.account_id,
            'register',
            data.client_data_json,
            'webauthn.create',
          )

          await crypto.subtle.importKey(
            'spki',
            base64UrlToBytes(publicKeySpki),
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['verify'],
          )

          const existing = await env.DB.prepare(`
            SELECT id, account_id
            FROM passkey_credentials
            WHERE credential_id = ?
            LIMIT 1
          `).bind(credentialId).first()

          if (existing && Number(existing.account_id) !== Number(session.account_id)) {
            return error('Esta biometria já está vinculada a outro acesso.', 409)
          }

          if (existing) {
            await env.DB.prepare(`
              UPDATE passkey_credentials
              SET public_key_spki = ?, device_label = ?, last_used_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(
              publicKeySpki,
              String(data.device_label || 'Este aparelho').slice(0, 80),
              existing.id,
            ).run()
          } else {
            await env.DB.prepare(`
              INSERT INTO passkey_credentials (
                account_id, credential_id, public_key_spki, algorithm,
                sign_count, device_label
              )
              VALUES (?, ?, ?, -7, 0, ?)
            `).bind(
              session.account_id,
              credentialId,
              publicKeySpki,
              String(data.device_label || 'Este aparelho').slice(0, 80),
            ).run()
          }

          await env.DB.prepare('DELETE FROM passkey_challenges WHERE id = ?').bind(client.challengeRow.id).run()
          return json({ ok: true })
        } catch (e) {
          return error(e.message || 'Não foi possível cadastrar a biometria.', 400)
        }
      }

      const passkeyDeleteMatch = url.pathname.match(/^\/api\/auth\/passkeys\/(\d+)$/)
      if (passkeyDeleteMatch && request.method === 'DELETE') {
        const id = Number(passkeyDeleteMatch[1])
        const credential = await env.DB.prepare(`
          SELECT id
          FROM passkey_credentials
          WHERE id = ? AND account_id = ?
          LIMIT 1
        `).bind(id, session.account_id).first()
        if (!credential) return error('Biometria não encontrada.', 404)
        await env.DB.prepare('DELETE FROM passkey_credentials WHERE id = ?').bind(id).run()
        return json({ ok: true })
      }

      // GLOBAL MESSAGE DEFAULTS --------------------------------------------
      if (url.pathname === '/api/message-defaults') {
        if (request.method === 'GET') {
          const result = await env.DB.prepare(`
            SELECT template_key, title, content, active
            FROM message_defaults
            ORDER BY template_key
          `).all()
          return json(result.results || [])
        }

        if (request.method === 'PUT') {
          if (session?.role !== 'admin') return error('Somente a administradora pode alterar mensagens padrão.', 403)
          const data = await bodyJson(request)
          if (!data.template_key || !data.title) return error('Chave e título são obrigatórios.')
          await env.DB.prepare(`
            INSERT INTO message_defaults (template_key, title, content, active, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(template_key) DO UPDATE SET
              title = excluded.title,
              content = excluded.content,
              active = excluded.active,
              updated_at = CURRENT_TIMESTAMP
          `).bind(data.template_key, data.title, data.content || '', data.active === false ? 0 : 1).run()
          return json(await env.DB.prepare(`
            SELECT template_key, title, content, active
            FROM message_defaults
            WHERE template_key = ?
          `).bind(data.template_key).first())
        }
      }

      // PROFESSIONALS -------------------------------------------------------
      if (url.pathname === '/api/professionals' && request.method === 'GET') {
        const where = session?.role === 'professional' ? 'WHERE p.id = ? AND p.active = 1' : 'WHERE p.active = 1'
        const stmt = env.DB.prepare(`
          SELECT p.id, p.name, p.specialty, p.professional_registry, p.photo_url, p.logo_url,
                 p.primary_color, p.secondary_color, p.accent_color, p.theme_mode, p.active,
                 p.online_enabled, p.in_person_enabled, p.online_platform, p.online_link,
                 p.clinic_name, p.clinic_address, p.first_online_price, p.first_in_person_price,
                 p.followup_online_price, p.followup_in_person_price,
                 p.first_appointment_duration, p.followup_appointment_duration,
                 p.interval_minutes, p.pix_key, p.pix_holder, p.payment_instructions, p.invoice_mode,
                 (SELECT aa.slug FROM auth_accounts aa
                    WHERE aa.professional_id = p.id AND aa.role = 'professional' AND aa.active = 1
                    LIMIT 1) AS access_slug
          FROM professionals p
          ${where}
          ORDER BY p.name
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

      const professionalAccessMatch = url.pathname.match(/^\/api\/professionals\/(\d+)\/access$/)
      if (professionalAccessMatch) {
        const professionalId = Number(professionalAccessMatch[1])
        if (session?.role !== 'admin') return error('Somente a administradora pode alterar o acesso.', 403)
        const professional = await env.DB.prepare('SELECT id, name FROM professionals WHERE id = ?').bind(professionalId).first()
        if (!professional) return error('Profissional não encontrado.', 404)

        if (request.method === 'GET') {
          const account = await env.DB.prepare(`
            SELECT slug, active FROM auth_accounts
            WHERE professional_id = ? AND role = 'professional'
            LIMIT 1
          `).bind(professionalId).first()
          return json(account || { slug: '', active: 0 })
        }

        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          const slug = String(data.slug || '').trim().toLowerCase()
          const password = String(data.password || '')
          if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) {
            return error('O link deve ter de 3 a 40 caracteres, usando letras minúsculas, números ou hífen.')
          }
          if (slug === 'admin') return error('Este link é reservado.')

          const conflict = await env.DB.prepare(`
            SELECT id FROM auth_accounts
            WHERE lower(slug) = lower(?) AND NOT (professional_id = ? AND role = 'professional')
            LIMIT 1
          `).bind(slug, professionalId).first()
          if (conflict) return error('Este link já está em uso.')

          let account = await env.DB.prepare(`
            SELECT * FROM auth_accounts
            WHERE professional_id = ? AND role = 'professional'
            LIMIT 1
          `).bind(professionalId).first()

          if (!account) {
            if (password.length < 8) return error('Defina uma senha com pelo menos 8 caracteres.')
            const userResult = await env.DB.prepare(`
              INSERT INTO users (name, email, role, professional_id, active)
              VALUES (?, ?, 'professional', ?, 1)
            `).bind(professional.name, `${slug}@libri.local`, professionalId).run()
            const encrypted = await passwordHash(password)
            await env.DB.prepare(`
              INSERT INTO auth_accounts (user_id, role, professional_id, slug, password_hash, password_salt, active)
              VALUES (?, 'professional', ?, ?, ?, ?, 1)
            `).bind(userResult.meta?.last_row_id, professionalId, slug, encrypted.hash, encrypted.salt).run()
          } else {
            const fields = ['slug = ?', 'active = 1']
            const values = [slug]
            if (password) {
              if (password.length < 8) return error('A senha precisa ter pelo menos 8 caracteres.')
              const encrypted = await passwordHash(password)
              fields.push('password_hash = ?', 'password_salt = ?')
              values.push(encrypted.hash, encrypted.salt)
            }
            await env.DB.prepare(`UPDATE auth_accounts SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .bind(...values, account.id).run()
            if (account.user_id) {
              await env.DB.prepare('UPDATE users SET name = ?, active = 1 WHERE id = ?')
                .bind(professional.name, account.user_id).run()
            }
          }
          await audit(env, session, professionalId, 'auth_account', professionalId, 'update', 'Acesso do profissional atualizado')
          return json({ slug, url: `/${slug}`, active: 1 })
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
          const fullName = String(data.full_name || '').trim()
          const whatsapp = String(data.whatsapp || '').trim()
          if (!fullName) return error('Nome do paciente é obrigatório.')
          if (!whatsapp) return error('WhatsApp é obrigatório.')

          // Proteção contra cadastro duplicado por clique repetido:
          // compara nome e número normalizado antes de inserir.
          const sameName = await env.DB.prepare(`
            SELECT id, full_name, whatsapp
            FROM patients
            WHERE professional_id = ?
              AND archived = 0
              AND lower(trim(full_name)) = lower(trim(?))
          `).bind(professionalId, fullName).all()

          const phoneKey = whatsapp.replace(/\D/g, '')
          const duplicate = (sameName.results || []).find((item) =>
            String(item.whatsapp || '').replace(/\D/g, '') === phoneKey
          )
          if (duplicate) {
            return error('Este paciente já está cadastrado com o mesmo nome e WhatsApp.', 409)
          }

          const result = await env.DB.prepare(`
            INSERT INTO patients (
              professional_id, full_name, whatsapp, email, preferred_modality,
              birth_date, administrative_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            professionalId, fullName, whatsapp,
            data.email || '', data.preferred_modality || null, data.birth_date || null,
            data.administrative_notes || '',
          ).run()
          const id = result.meta?.last_row_id
          await audit(env, session, professionalId, 'patient', id, 'create', `Paciente ${fullName} cadastrado`)
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

        if (request.method === 'DELETE') {
          const count = await env.DB.prepare(`
            SELECT COUNT(*) AS total
            FROM appointments
            WHERE patient_id = ?
          `).bind(patientId).first()

          if (Number(count?.total || 0) > 0) {
            return error('Este paciente possui consultas vinculadas. Para preservar o histórico, arquive o cadastro em vez de excluir.', 409)
          }

          await env.DB.prepare('DELETE FROM patients WHERE id = ?').bind(patientId).run()
          await audit(env, session, current.professional_id, 'patient', patientId, 'delete', `Cadastro de ${current.full_name} excluído sem consultas vinculadas`)
          return json({ ok: true })
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
        const appointment = await env.DB.prepare(`
          SELECT a.*, p.full_name AS patient_name
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          WHERE a.id = ?
          LIMIT 1
        `).bind(appointmentId).first()
        if (!appointment) return error('Consulta não encontrada.', 404)
        if (!canAccessProfessional(session, appointment.professional_id)) return error('Sem acesso a esta consulta.', 403)

        if (request.method === 'GET') {
          const row = await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first()
          return json(row || { appointment_id: appointmentId, file_name: '', file_url: '' })
        }

        if (request.method === 'PUT') {
          const data = await bodyJson(request)
          const current = await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first()
          await env.DB.prepare(`
            INSERT INTO invoices (appointment_id, invoice_number, issued_at, file_name, file_url)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
              invoice_number = excluded.invoice_number,
              issued_at = excluded.issued_at,
              file_name = excluded.file_name,
              file_url = excluded.file_url
          `).bind(
            appointmentId,
            data.invoice_number ?? current?.invoice_number ?? '',
            data.issued_at ?? current?.issued_at ?? null,
            current?.file_name || '',
            current?.file_url || '',
          ).run()
          if (data.mark_issued) {
            await env.DB.prepare("UPDATE appointments SET invoice_status = 'issued', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
              .bind(appointmentId).run()
          }
          await audit(env, session, appointment.professional_id, 'invoice', appointmentId, 'update', 'Nota fiscal atualizada')
          return json(await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first())
        }
      }

      const invoiceFileMatch = url.pathname.match(/^\/api\/appointments\/(\d+)\/invoice-file$/)
      if (invoiceFileMatch) {
        const appointmentId = Number(invoiceFileMatch[1])
        const appointment = await env.DB.prepare(`
          SELECT a.*, p.full_name AS patient_name
          FROM appointments a
          JOIN patients p ON p.id = a.patient_id
          WHERE a.id = ?
          LIMIT 1
        `).bind(appointmentId).first()
        if (!appointment) return error('Consulta não encontrada.', 404)
        if (!canAccessProfessional(session, appointment.professional_id)) return error('Sem acesso a esta consulta.', 403)
        if (!env.FILES) return error('Armazenamento de PDFs ainda não foi configurado.', 503)

        if (request.method === 'POST') {
          const form = await request.formData()
          const file = form.get('file')
          if (!(file instanceof File)) return error('Selecione um arquivo PDF.')
          if (file.type !== 'application/pdf' && !String(file.name || '').toLowerCase().endsWith('.pdf')) {
            return error('A nota fiscal precisa ser um arquivo PDF.')
          }
          const maxBytes = 10 * 1024 * 1024
          if (file.size > maxBytes) return error('O PDF pode ter no máximo 10 MB.')

          const current = await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first()
          if (current?.file_url) {
            try { await env.FILES.delete(current.file_url) } catch {}
          }

          const fileName = safeFilename(file.name || `nota-fiscal-${appointmentId}.pdf`)
          const key = `professional-${appointment.professional_id}/patient-${appointment.patient_id}/appointment-${appointmentId}/${Date.now()}-${fileName}`
          await env.FILES.put(key, file.stream(), {
            httpMetadata: { contentType: 'application/pdf' },
            customMetadata: {
              professional_id: String(appointment.professional_id),
              patient_id: String(appointment.patient_id),
              appointment_id: String(appointmentId),
            },
          })

          await env.DB.prepare(`
            INSERT INTO invoices (appointment_id, invoice_number, issued_at, file_name, file_url)
            VALUES (?, '', NULL, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
              file_name = excluded.file_name,
              file_url = excluded.file_url
          `).bind(appointmentId, file.name || fileName, key).run()

          await audit(env, session, appointment.professional_id, 'invoice_file', appointmentId, 'upload', `PDF da NF anexado para ${appointment.patient_name}`)
          return json({ ok: true, file_name: file.name || fileName })
        }

        const invoice = await env.DB.prepare('SELECT * FROM invoices WHERE appointment_id = ?').bind(appointmentId).first()
        if (!invoice?.file_url) return error('Esta nota fiscal ainda não possui PDF anexado.', 404)

        if (request.method === 'GET') {
          const object = await env.FILES.get(invoice.file_url)
          if (!object) return error('PDF não encontrado no armazenamento.', 404)
          const headers = new Headers()
          object.writeHttpMetadata(headers)
          headers.set('Content-Type', 'application/pdf')
          headers.set('Cache-Control', 'private, no-store')
          const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline'
          headers.set('Content-Disposition', `${disposition}; filename="${safeFilename(invoice.file_name || 'nota-fiscal.pdf')}"`)
          return new Response(object.body, { headers })
        }

        if (request.method === 'DELETE') {
          await env.FILES.delete(invoice.file_url)
          await env.DB.prepare(`
            UPDATE invoices
            SET file_name = '', file_url = ''
            WHERE appointment_id = ?
          `).bind(appointmentId).run()
          await audit(env, session, appointment.professional_id, 'invoice_file', appointmentId, 'delete', 'PDF da NF removido')
          return json({ ok: true })
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
            query += ' AND (recurring = 1 OR (block_date <= ? AND COALESCE(end_date, block_date) >= ?))'
            params.push(to, from)
          }
          query += ' ORDER BY block_date, start_time'
          const blocks = (await env.DB.prepare(query).bind(...params).all()).results || []

          if (!blocks.length) return json([])
          let exceptionQuery = `
            SELECT e.block_id, e.exception_date
            FROM schedule_block_exceptions e
            JOIN schedule_blocks b ON b.id = e.block_id
            WHERE b.professional_id = ?
          `
          const exceptionParams = [professionalId]
          if (from && to) {
            exceptionQuery += ' AND e.exception_date BETWEEN ? AND ?'
            exceptionParams.push(from, to)
          }
          const exceptions = (await env.DB.prepare(exceptionQuery).bind(...exceptionParams).all()).results || []
          const byBlock = new Map()
          for (const row of exceptions) {
            if (!byBlock.has(Number(row.block_id))) byBlock.set(Number(row.block_id), [])
            byBlock.get(Number(row.block_id)).push(row.exception_date)
          }
          return json(blocks.map((block) => ({ ...block, exceptions: byBlock.get(Number(block.id)) || [] })))
        }

        if (request.method === 'POST') {
          const data = normalizeBlockData(await bodyJson(request))
          if (!data.title || !data.block_date) return error('Motivo e data são obrigatórios.')
          if (data.end_date < data.block_date) return error('A data final não pode ser anterior à data inicial.')
          if (!data.all_day && (!data.start_time || !data.end_time)) return error('Informe o horário inicial e final.')
          if (!data.all_day && data.end_time <= data.start_time) return error('O horário final precisa ser depois do inicial.')
          if (data.recurring && !Number.isInteger(data.recurrence_weekday)) return error('Selecione o dia da recorrência.')

          const result = await env.DB.prepare(`
            INSERT INTO schedule_blocks (
              professional_id, title, block_date, end_date, start_time, end_time,
              all_day, recurring, recurrence_weekday
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            professionalId, data.title, data.block_date, data.end_date,
            data.start_time, data.end_time, data.all_day, data.recurring,
            data.recurrence_weekday,
          ).run()
          const id = result.meta?.last_row_id
          await audit(env, session, professionalId, 'schedule_block', id, 'create', data.title)
          return json({ ...(await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(id).first()), exceptions: [] }, { status: 201 })
        }
      }

      const blockExceptionMatch = url.pathname.match(/^\/api\/blocks\/(\d+)\/exceptions$/)
      if (blockExceptionMatch && request.method === 'POST') {
        const blockId = Number(blockExceptionMatch[1])
        const block = await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(blockId).first()
        if (!block) return error('Bloqueio não encontrado.', 404)
        if (!canAccessProfessional(session, block.professional_id)) return error('Sem acesso a este bloqueio.', 403)
        const data = await bodyJson(request)
        const date = String(data.date || '')
        if (!date) return error('Informe a data que deve ser liberada.')
        const weekday = parseDate(date).getDay()
        if (!blockMatchesDate(block, date, weekday, new Set())) return error('Essa data não pertence ao bloqueio.', 400)
        await env.DB.prepare(`
          INSERT OR IGNORE INTO schedule_block_exceptions (block_id, exception_date)
          VALUES (?, ?)
        `).bind(blockId, date).run()
        await audit(env, session, block.professional_id, 'schedule_block_exception', blockId, 'create', `${block.title}: ${date} liberado`)
        return json({ ok: true, block_id: blockId, exception_date: date })
      }

      const blockMatch = url.pathname.match(/^\/api\/blocks\/(\d+)$/)
      if (blockMatch) {
        const blockId = Number(blockMatch[1])
        const block = await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(blockId).first()
        if (!block) return error('Bloqueio não encontrado.', 404)
        if (!canAccessProfessional(session, block.professional_id)) return error('Sem acesso a este bloqueio.', 403)

        if (request.method === 'PATCH') {
          const data = normalizeBlockData(await bodyJson(request))
          if (!data.title || !data.block_date) return error('Motivo e data são obrigatórios.')
          if (data.end_date < data.block_date) return error('A data final não pode ser anterior à data inicial.')
          if (!data.all_day && (!data.start_time || !data.end_time)) return error('Informe o horário inicial e final.')
          if (!data.all_day && data.end_time <= data.start_time) return error('O horário final precisa ser depois do inicial.')
          if (data.recurring && !Number.isInteger(data.recurrence_weekday)) return error('Selecione o dia da recorrência.')

          await env.DB.prepare(`
            UPDATE schedule_blocks
            SET title = ?, block_date = ?, end_date = ?, start_time = ?, end_time = ?,
                all_day = ?, recurring = ?, recurrence_weekday = ?
            WHERE id = ?
          `).bind(
            data.title, data.block_date, data.end_date, data.start_time, data.end_time,
            data.all_day, data.recurring, data.recurrence_weekday, blockId,
          ).run()
          await env.DB.prepare(`
            DELETE FROM schedule_block_exceptions
            WHERE block_id = ?
              AND (exception_date < ? OR exception_date > ?)
          `).bind(blockId, data.block_date, data.recurring ? '9999-12-31' : data.end_date).run()
          await audit(env, session, block.professional_id, 'schedule_block', blockId, 'update', data.title)
          const exceptions = (await env.DB.prepare('SELECT exception_date FROM schedule_block_exceptions WHERE block_id = ? ORDER BY exception_date').bind(blockId).all()).results || []
          return json({ ...(await env.DB.prepare('SELECT * FROM schedule_blocks WHERE id = ?').bind(blockId).first()), exceptions: exceptions.map((row) => row.exception_date) })
        }

        if (request.method === 'DELETE') {
          await env.DB.prepare('DELETE FROM schedule_block_exceptions WHERE block_id = ?').bind(blockId).run()
          await env.DB.prepare('DELETE FROM schedule_blocks WHERE id = ?').bind(blockId).run()
          await audit(env, session, block.professional_id, 'schedule_block', blockId, 'delete', block.title)
          return json({ ok: true })
        }
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

      const messageItemMatch = url.pathname.match(/^\/api\/professionals\/(\d+)\/messages\/([^/]+)$/)
      if (messageItemMatch && request.method === 'DELETE') {
        const professionalId = Number(messageItemMatch[1])
        if (!canAccessProfessional(session, professionalId)) return error('Sem acesso a este profissional.', 403)
        const templateKey = decodeURIComponent(messageItemMatch[2])
        await env.DB.prepare(`
          DELETE FROM message_templates
          WHERE professional_id = ? AND template_key = ?
        `).bind(professionalId, templateKey).run()
        await audit(env, session, professionalId, 'message_template', null, 'reset', `Mensagem ${templateKey} voltou ao padrão`)
        return json({ ok: true })
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
