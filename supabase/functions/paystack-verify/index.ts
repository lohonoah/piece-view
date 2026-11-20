import { serviceClient, settleTransaction, verifyPaystackTransaction } from '../_shared/paystack.ts'

function corsHeaders(request: Request) {
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://piece-view.vercel.app').replace(/\/$/, '')
  const origin = request.headers.get('Origin') || ''
  const allowedOrigins = [siteUrl, 'http://localhost:5173']
  return {
  'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : siteUrl,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function response(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed' }, 405)
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return response(request, { error: 'Sign in to verify this payment.' }, 401)

  let body: { reference?: unknown }
  try { body = await request.json() } catch { return response(request, { error: 'Invalid verification request.' }, 400) }
  const reference = typeof body.reference === 'string' ? body.reference : ''
  if (!/^PV[0-9a-f]{32}$/i.test(reference)) return response(request, { error: 'Invalid payment reference.' }, 400)

  try {
    const admin = serviceClient()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return response(request, { error: 'Your session could not be verified.' }, 401)
    const { data: order, error: orderError } = await admin.from('customer_orders').select('public_id,payment_status')
      .eq('paystack_reference', reference).eq('user_id', user.id).maybeSingle()
    if (orderError || !order) return response(request, { error: 'Payment does not match an order on this account.' }, 404)
    const transaction = await verifyPaystackTransaction(reference)
    const paid = await settleTransaction(reference, transaction)
    return response(request, { paid, order_id: order.public_id, payment_status: paid ? 'Paid' : 'Failed' })
  } catch (error) {
    console.error('Paystack verification error:', error)
    return response(request, { error: error instanceof Error ? error.message : 'Could not verify payment.' }, 502)
  }
})
