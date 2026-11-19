import { createClient } from 'npm:@supabase/supabase-js@2'

function page(title: string, message: string) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Piece View</title><style>body{font:16px/1.6 Arial,sans-serif;background:#f7f7f2;color:#20231f;margin:0;display:grid;min-height:100vh;place-items:center}main{max-width:520px;margin:24px;background:#fff;padding:32px;border:1px solid #e8e6df;border-radius:12px}h1{font:500 32px Georgia,serif}</style></head><body><main><h1>${title}</h1><p>${message}</p><a href="https://piece-view.vercel.app">Return to Piece View</a></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async request => {
  if (request.method !== 'GET' && request.method !== 'POST') return page('Request not supported', 'Please use the unsubscribe link from your email.')
  const token = new URL(request.url).searchParams.get('token')
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return page('Link not valid', 'This unsubscribe link is invalid or expired.')

  if (request.method === 'GET') {
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe · Piece View</title><style>body{font:16px/1.6 Arial,sans-serif;background:#f7f7f2;color:#20231f;margin:0;display:grid;min-height:100vh;place-items:center}main{max-width:520px;margin:24px;background:#fff;padding:32px;border:1px solid #e8e6df;border-radius:12px}h1{font:500 32px Georgia,serif}button{border:0;border-radius:6px;background:#20231f;color:white;padding:12px 18px;cursor:pointer}</style></head><body><main><h1>Unsubscribe from Piece View?</h1><p>Confirm below to stop receiving marketing updates.</p><form method="post" action="?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const keySet = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const serviceKey = keySet.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return page('Temporarily unavailable', 'Please try again later or contact Piece View support.')

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await admin.from('newsletter_subscribers').update({ unsubscribed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', token).is('unsubscribed_at', null)
  if (error) return page('Temporarily unavailable', 'Please try again later or contact Piece View support.')
  return page('You are unsubscribed', 'You will no longer receive Piece View marketing updates at this address.')
})
