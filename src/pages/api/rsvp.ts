export const prerender = false

import type { APIRoute } from 'astro'
import { supabase } from '../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await parseBody(request)
    const fullName = pickString(payload, ['full_name', 'fullName', 'name'])
    const attending = parseAttending(payload.attending)
    const guestsCount = Number.parseInt(payload.guests_count as string, 10)
    const phone = payload.phone?.toString().trim() || null
    const notes = payload.notes?.toString().trim() || null
    console.log({ fullName, attending, guestsCount, phone, notes })

    if (!fullName) {
      return jsonError('El nombre es obligatorio.', 400)
    }

    if (!Number.isFinite(guestsCount) || guestsCount < 0 || guestsCount > 10) {
      return jsonError('La cantidad de invitados debe ser un número entre 0 y 10.', 400)
    }

    const { error } = await supabase.from('rsvps').insert({
      full_name: fullName,
      attending,
      guests_count: guestsCount,
      phone,
      notes,
    })

    if (error) {
      console.error('Supabase insert error:', error)
      return jsonError('No pudimos guardar tu confirmación. Intenta de nuevo.', 500)
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof TypeError) {
      return jsonError(error.message, 400)
    }

    console.error('Unexpected RSVP error:', error)
    return jsonError('Algo salió mal al procesar tu solicitud.', 500)
  }
}

async function parseBody(request: Request) {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return (await request.json()) as Record<string, unknown>
    } catch {
      throw new TypeError('Cuerpo JSON inválido.')
    }
  }

  if (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  ) {
    const formData = await request.formData()
    return Object.fromEntries(formData.entries()) as Record<string, unknown>
  }

  // Fallback: try to parse text as JSON when content-type is missing/unknown
  const raw = await request.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new TypeError(`Unsupported Content-Type "${contentType}". Expected JSON or form-data.`)
  }
}

function parseAttending(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  return ['true', 'yes', 'on', '1'].includes(value.toLowerCase())
}

function pickString(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = obj[key]
    if (value === undefined || value === null) continue
    const str = value.toString().trim()
    if (str) return str
  }
  return ''
}

function jsonError(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
