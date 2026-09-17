export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, app: 'libri-agenda' })
    }

    if (url.pathname === '/api/professionals' && request.method === 'GET') {
      if (!env.DB) {
        return Response.json({ error: 'D1 binding DB ainda não configurado.' }, { status: 503 })
      }

      const result = await env.DB.prepare(
        `SELECT id, name, specialty, active, primary_color, secondary_color, accent_color
         FROM professionals
         WHERE active = 1
         ORDER BY name ASC`,
      ).all()

      return Response.json(result.results)
    }

    return Response.json({ error: 'Rota não encontrada.' }, { status: 404 })
  },
}
