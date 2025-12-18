export const prerender = false

import type { APIRoute } from 'astro'
import { getSupabaseAdminClient } from '../../../lib/supabase'

export const POST: APIRoute = async ({ request }) => {
  const token = request.headers.get('x-admin-token')
  if (token !== import.meta.env.ADMIN_BOOTSTRAP_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const email = body?.email
  const password = body?.password

  if (!email || !password) {
    return new Response('Missing email/password', { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdminClient()

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    return new Response(error.message, { status: 400 })
  }

  return new Response(JSON.stringify({ userId: data.user.id }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
