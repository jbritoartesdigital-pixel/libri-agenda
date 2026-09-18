import { api } from './api'

function toBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function deviceLabel() {
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'Celular Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone/iPad'
  if (/Windows/i.test(ua)) return 'Computador Windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  return 'Este aparelho'
}

export function passkeySupported() {
  return Boolean(window.PublicKeyCredential && navigator.credentials)
}

export async function registerPasskey() {
  if (!passkeySupported()) throw new Error('Este navegador não oferece suporte à biometria do aparelho.')

  const options = await api.post('/api/auth/passkey/register/options', {})
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: toBytes(options.challenge),
      rp: options.rp,
      user: {
        ...options.user,
        id: toBytes(options.user.id),
      },
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout || 60000,
      authenticatorSelection: options.authenticatorSelection,
      attestation: 'none',
      excludeCredentials: (options.excludeCredentials || []).map((item) => ({
        ...item,
        id: toBytes(item.id),
      })),
    },
  })

  if (!credential) throw new Error('Não foi possível criar a credencial biométrica.')
  const response = credential.response
  if (typeof response.getPublicKey !== 'function') {
    throw new Error('Atualize o navegador para ativar a biometria neste aparelho.')
  }

  const publicKey = response.getPublicKey()
  if (!publicKey) throw new Error('O aparelho não forneceu a chave da credencial.')

  const algorithm = typeof response.getPublicKeyAlgorithm === 'function'
    ? response.getPublicKeyAlgorithm()
    : -7

  return api.post('/api/auth/passkey/register/verify', {
    credential_id: toBase64Url(credential.rawId),
    client_data_json: toBase64Url(response.clientDataJSON),
    public_key_spki: toBase64Url(publicKey),
    algorithm,
    device_label: deviceLabel(),
  })
}

export async function loginWithPasskey(slug, remember = true) {
  if (!passkeySupported()) throw new Error('Este navegador não oferece suporte à biometria do aparelho.')

  const options = await api.post('/api/auth/passkey/login/options', { slug })
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: toBytes(options.challenge),
      rpId: options.rpId,
      allowCredentials: (options.allowCredentials || []).map((item) => ({
        ...item,
        id: toBytes(item.id),
      })),
      timeout: options.timeout || 60000,
      userVerification: 'required',
    },
  })

  if (!credential) throw new Error('A autenticação biométrica não foi concluída.')

  return api.post('/api/auth/passkey/login/verify', {
    slug,
    remember,
    credential_id: toBase64Url(credential.rawId),
    client_data_json: toBase64Url(credential.response.clientDataJSON),
    authenticator_data: toBase64Url(credential.response.authenticatorData),
    signature: toBase64Url(credential.response.signature),
  })
}
