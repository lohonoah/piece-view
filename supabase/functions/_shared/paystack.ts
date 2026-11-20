import { createClient } from 'npm:@supabase/supabase-js@2'

export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
  const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service credentials are not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function verifyPaystackTransaction(reference: string) {
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY')
  if (!secret) throw new Error('Paystack is not configured.')
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}`, 'Cache-Control': 'no-cache' },
  })
  const result = await response.json()
  if (!response.ok || !result.status) throw new Error('Paystack could not verify this transaction.')
  return result.data as { status: string; amount: number; currency: string; reference: string }
}

export async function settleTransaction(reference: string, transaction: { status: string; amount: number; currency: string }) {
  const admin = serviceClient()
  const succeeded = transaction.status === 'success'
  const { error } = await admin.rpc('settle_paystack_order', {
    p_reference: reference,
    p_succeeded: succeeded,
    p_amount_kobo: transaction.amount,
    p_currency: transaction.currency,
  })
  if (error) throw new Error(error.message)
  return succeeded
}

export async function isValidWebhookSignature(rawBody: string, headers: Headers) {
  const signingSecret = Deno.env.get('PAYSTACK_WEBHOOK_SECRET')
  const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY')
  const paystackSignature = headers.get('Paystack-Signature')
  const legacySignature = headers.get('x-paystack-signature')

  if (paystackSignature && signingSecret) {
    const fields = paystackSignature.split(',').map(part => part.trim())
    const timestampText = fields.find(part => part.startsWith('t='))?.slice(2)
    const timestamp = Number(timestampText)
    if (!timestampText || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false
    const signatures = fields.filter(part => part.startsWith('v1=')).map(part => part.slice(3).split(':').at(-1) || '')
    return await signaturesMatch(signatures, `${timestampText}.${rawBody}`, signingSecret)
  }

  if (legacySignature && secretKey) return await signaturesMatch([legacySignature], rawBody, secretKey)
  return false
}

async function signaturesMatch(signatures: string[], payload: string, secret: string) {
  if (!signatures.length) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'])
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  const expected = [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return signatures.some(signature => {
    if (signature.length !== expected.length) return false
    let difference = 0
    for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ signature.toLowerCase().charCodeAt(index)
    return difference === 0
  })
}
