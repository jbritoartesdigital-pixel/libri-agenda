const jsonHeaders = { 'Content-Type': 'application/json' }

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const err = new Error(data?.error || data?.message || `Erro ${response.status}`)
      err.status = response.status
      throw err
    }
    return data
  }

  const text = await response.text()
  if (!response.ok) {
    const err = new Error(text || `Erro ${response.status}`)
    err.status = response.status
    throw err
  }
  return text
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...jsonHeaders,
      ...(options.headers || {}),
    },
  })
  return parseResponse(response)
}

async function upload(path, file) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  return parseResponse(response)
}

async function fetchBlob(path) {
  const response = await fetch(path, { credentials: 'include' })
  if (!response.ok) {
    let message = `Erro ${response.status}`
    try {
      const data = await response.json()
      message = data?.error || data?.message || message
    } catch {}
    const err = new Error(message)
    err.status = response.status
    throw err
  }
  return response.blob()
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  upload,
  blob: fetchBlob,
}
