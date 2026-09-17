export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // -----------------------------------------------------
    // HEALTH
    // -----------------------------------------------------

    if (url.pathname === '/api/health') {
      return Response.json({
        ok: true,
        app: 'libri-agenda',
      })
    }

    // -----------------------------------------------------
    // LISTAR PROFISSIONAIS ATIVOS
    // -----------------------------------------------------

    if (
      url.pathname === '/api/professionals' &&
      request.method === 'GET'
    ) {
      if (!env.DB) {
        return Response.json(
          { error: 'D1 binding DB não configurado.' },
          { status: 503 },
        )
      }

      const result = await env.DB.prepare(`
        SELECT
          id,
          name,
          specialty,
          professional_registry,

          photo_url,
          logo_url,

          primary_color,
          secondary_color,
          accent_color,
          theme_mode,

          active,

          online_enabled,
          in_person_enabled,

          online_platform,
          online_link,

          clinic_name,
          clinic_address,

          first_online_price,
          first_in_person_price,
          followup_online_price,
          followup_in_person_price,

          first_appointment_duration,
          followup_appointment_duration,
          interval_minutes,

          pix_key,
          pix_holder,
          payment_instructions,

          invoice_mode

        FROM professionals

        WHERE active = 1

        ORDER BY name ASC
      `).all()

      return Response.json(result.results)
    }

    // -----------------------------------------------------
    // BUSCAR UM PROFISSIONAL
    // /api/professionals/1
    // -----------------------------------------------------

    const professionalMatch =
      url.pathname.match(/^\/api\/professionals\/(\d+)$/)

    if (
      professionalMatch &&
      request.method === 'GET'
    ) {
      const professionalId = Number(professionalMatch[1])

      const professional = await env.DB.prepare(`
        SELECT *
        FROM professionals
        WHERE id = ?
        LIMIT 1
      `)
        .bind(professionalId)
        .first()

      if (!professional) {
        return Response.json(
          { error: 'Profissional não encontrado.' },
          { status: 404 },
        )
      }

      return Response.json(professional)
    }

    // -----------------------------------------------------
    // BLOQUEIOS DO PROFISSIONAL
    // /api/professionals/1/blocks
    // -----------------------------------------------------

    const blocksMatch =
      url.pathname.match(
        /^\/api\/professionals\/(\d+)\/blocks$/,
      )

    if (
      blocksMatch &&
      request.method === 'GET'
    ) {
      const professionalId = Number(blocksMatch[1])

      const result = await env.DB.prepare(`
        SELECT
          id,
          title,
          block_date,
          start_time,
          end_time,
          all_day,
          recurring,
          recurrence_weekday
        FROM schedule_blocks
        WHERE professional_id = ?
        ORDER BY block_date ASC, start_time ASC
      `)
        .bind(professionalId)
        .all()

      return Response.json(result.results)
    }

    // -----------------------------------------------------
    // MENSAGENS DO PROFISSIONAL
    // /api/professionals/1/messages
    // -----------------------------------------------------

    const messagesMatch =
      url.pathname.match(
        /^\/api\/professionals\/(\d+)\/messages$/,
      )

    if (
      messagesMatch &&
      request.method === 'GET'
    ) {
      const professionalId = Number(messagesMatch[1])

      const result = await env.DB.prepare(`
        SELECT
          id,
          template_key,
          title,
          content
        FROM message_templates
        WHERE professional_id = ?
          AND active = 1
        ORDER BY id ASC
      `)
        .bind(professionalId)
        .all()

      return Response.json(result.results)
    }

    // -----------------------------------------------------
    // CONSULTAS
    // Pode receber ?date=2026-09-17
    // -----------------------------------------------------

    const appointmentsMatch =
      url.pathname.match(
        /^\/api\/professionals\/(\d+)\/appointments$/,
      )

    if (
      appointmentsMatch &&
      request.method === 'GET'
    ) {
      const professionalId = Number(
        appointmentsMatch[1],
      )

      const date = url.searchParams.get('date')

      let query = `
        SELECT
          a.*,
          p.full_name AS patient_name,
          p.whatsapp AS patient_whatsapp
        FROM appointments a
        INNER JOIN patients p
          ON p.id = a.patient_id
        WHERE a.professional_id = ?
      `

      const params = [professionalId]

      if (date) {
        query += ` AND a.appointment_date = ?`
        params.push(date)
      }

      query += `
        ORDER BY
          a.appointment_date ASC,
          a.start_time ASC
      `

      const statement = env.DB.prepare(query).bind(...params)

      const result = await statement.all()

      return Response.json(result.results)
    }

    // -----------------------------------------------------
    // PACIENTES
    // -----------------------------------------------------

    const patientsMatch =
      url.pathname.match(
        /^\/api\/professionals\/(\d+)\/patients$/,
      )

    if (
      patientsMatch &&
      request.method === 'GET'
    ) {
      const professionalId = Number(patientsMatch[1])

      const result = await env.DB.prepare(`
        SELECT
          id,
          full_name,
          whatsapp,
          email,
          preferred_modality,
          birth_date,
          administrative_notes,
          archived,
          created_at
        FROM patients
        WHERE professional_id = ?
          AND archived = 0
        ORDER BY full_name ASC
      `)
        .bind(professionalId)
        .all()

      return Response.json(result.results)
    }

    // -----------------------------------------------------

    return Response.json(
      { error: 'Rota não encontrada.' },
      { status: 404 },
    )
  },
}
