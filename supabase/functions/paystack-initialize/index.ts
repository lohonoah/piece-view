import { serviceClient } from '../_shared/paystack.ts'

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
  if (!token) return response(request, { error: 'Sign in before starting checkout.' }, 401)

  let body: { orderId?: unknown }
  try { body = await request.json() } catch { return response(request, { error: 'Invalid checkout request.' }, 400) }
  const publicId = typeof body.orderId === 'string' ? body.orderId : ''
  if (!/^PV-[0-9]{2}-[0-9]{6}$/.test(publicId)) return response(request, { error: 'Invalid order reference.' }, 400)

  const paystackKey = Deno.env.get('PAYSTACK_SECRET_KEY')
  const siteUrl = (Deno.env.get('SITE_URL') || 'https://piece-view.vercel.app').replace(/\/$/, '')
  let pendingReference = ''

  try {
    const admin = serviceClient()
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return response(request, { error: 'Your session could not be verified.' }, 401)
    const { data: order, error: orderError } = await admin.from('customer_orders').select('id,public_id,user_id,customer_email,total,status,payment_status,paystack_reference')
      .eq('public_id', publicId).eq('user_id', user.id).maybeSingle()
    if (orderError || !order) return response(request, { error: 'Order could not be found.' }, 404)
    if (order.status === 'Cancelled' || order.payment_status === 'Paid') return response(request, { error: 'This order is no longer payable.' }, 409)
    if (order.paystack_reference) return response(request, { error: 'A payment attempt already exists for this order.' }, 409)

    const reference = `PV${crypto.randomUUID().replaceAll('-', '')}`
    const { error: updateError } = await admin.from('customer_orders').update({
      payment_method: 'Paystack', payment_status: 'Pending', paystack_reference: reference,
    }).eq('id', order.id)
    if (updateError) throw new Error(updateError.message)
    pendingReference = reference

    if (!paystackKey) {
      await admin.rpc('settle_paystack_order', { p_reference: reference, p_succeeded: false, p_amount_kobo: 0, p_currency: 'NGN' })
      return response(request, { error: 'Online payments are not configured yet. Your reserved stock has been released.' }, 503)
    }

    const paymentResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({
        email: order.customer_email,
        amount: String(Math.round(Number(order.total) * 100)),
        currency: 'NGN',
        reference,
        callback_url: `${siteUrl.replace(/\/$/, '')}/#/payment/verify`,
        metadata: { order_id: order.public_id, customer_id: user.id },
      }),
    })
    const result = await paymentResponse.json()
    if (!paymentResponse.ok || !result.status || !result.data?.authorization_url) {
      await admin.rpc('settle_paystack_order', { p_reference: reference, p_succeeded: false, p_amount_kobo: 0, p_currency: 'NGN' })
      return response(request, { error: 'Paystack could not start the payment. Your reserved stock has been released.' }, 502)
    }
    return response(request, { authorization_url: result.data.authorization_url, reference })
  } catch (error) {
    console.error('Paystack initialization error:', error)
    if (pendingReference) {
      try { await serviceClient().rpc('settle_paystack_order', { p_reference: pendingReference, p_succeeded: false, p_amount_kobo: 0, p_currency: 'NGN' }) }
      catch (settlementError) { console.error('Could not release stock after payment initialization error:', settlementError) }
    }
    return response(request, { error: error instanceof Error ? error.message : 'Could not start payment.' }, 500)
  }
})
