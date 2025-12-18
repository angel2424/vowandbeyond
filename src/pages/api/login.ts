export const prerender = false

import type { APIRoute } from 'astro'
import { getSupabaseAdminClient } from '../../lib/supabase'

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  try {
    const form = await request.formData()
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')

    const supabaseAdmin = getSupabaseAdminClient()

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      // Redirect back to login with an error flag
      return redirect('/login?error=invalid', 303)
    }

    cookies.set('sb-access-token', data.session.access_token, {
      httpOnly: true,
      secure: import.meta.env.PROD, // secure only in prod
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60,
    })

    cookies.set('sb-refresh-token', data.session.refresh_token, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })

    // IMPORTANT: 303 after POST (prevents resubmission issues)
    return redirect('/admin', 303)
  } catch (e) {
    console.error('Login error:', e)
    return redirect('/login?error=server', 303)
  }
}
