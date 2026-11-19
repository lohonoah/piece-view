import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const keySet = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const serviceKey = keySet.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('NEWSLETTER_FROM')
  if (!supabaseUrl || !serviceKey || !resendKey || !from) return response({ error: 'Newsletter sending is not configured yet.' }, 503)

  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return response({ error: 'Sign in as an administrator to send a campaign.' }, 401)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userResult, error: authError } = await admin.auth.getUser(token)
  if (authError || !userResult.user) return response({ error: 'Your session could not be verified.' }, 401)
  const { data: profile } = await admin.from('profiles').select('role').eq('id', userResult.user.id).maybeSingle()
  if (profile?.role !== 'admin') return response({ error: 'Administrator access required.' }, 403)

  let body: { subject?: unknown; content?: unknown; campaignId?: unknown }
  try { body = await request.json() } catch { return response({ error: 'Invalid campaign request.' }, 400) }
  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId : ''
  if (!subject || subject.length > 120 || /[\r\n]/.test(subject)) return response({ error: 'Subject must be 1 to 120 characters.' }, 400)
  if (!content || content.length > 8000) return response({ error: 'Message must be 1 to 8,000 characters.' }, 400)
  if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return response({ error: 'Invalid campaign identifier.' }, 400)

  const subscribers: { email: string; unsubscribe_token: string }[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from('newsletter_subscribers')
      .select('email,unsubscribe_token').is('unsubscribed_at', null).order('id').range(offset, offset + 499)
    if (error) return response({ error: 'Could not load the opted-in subscriber list.' }, 500)
    subscribers.push(...(data || []))
    if (!data || data.length < 500) break
  }
  if (!subscribers.length) return response({ sent: 0, message: 'There are no active subscribers yet.' })

  const escapedSubject = escapeHtml(subject)
  const escapedContent = escapeHtml(content).replaceAll('\n', '<br>')
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://piece-view.vercel.app').replace(/\/$/, '')
  for (let offset = 0; offset < subscribers.length; offset += 100) {
    const batch = subscribers.slice(offset, offset + 100).map(subscriber => {
      const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?token=${encodeURIComponent(subscriber.unsubscribe_token)}`
      return {
        from,
        to: [subscriber.email],
        subject,
        text: `${content}\n\nUnsubscribe: ${unsubscribeUrl}`,
        html: `<main style="font:16px/1.6 Arial,sans-serif;color:#20231f;max-width:620px;margin:32px auto;padding:24px"><h1 style="font:500 28px Georgia,serif">${escapedSubject}</h1><p>${escapedContent}</p><hr style="border:0;border-top:1px solid #e8e6df;margin:28px 0"><p style="font-size:12px;color:#777">You receive this because you subscribed to Piece View updates. <a href="${unsubscribeUrl}">Unsubscribe</a>.</p><a href="${siteUrl}" style="font-size:12px;color:#9a654f">Visit Piece View</a></main>`,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }
    })
    const resendResponse = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `pieceview-${campaignId}-${Math.floor(offset / 100)}`,
      },
      body: JSON.stringify(batch),
    })
    if (!resendResponse.ok) return response({ sent: offset, total: subscribers.length, error: `The email provider rejected batch ${Math.floor(offset / 100) + 1}. Check the sender domain and provider settings.` }, 502)
  }

  return response({ sent: subscribers.length, message: `Campaign sent to ${subscribers.length} opted-in subscribers.` })
})
