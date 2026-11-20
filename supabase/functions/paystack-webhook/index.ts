import { isValidWebhookSignature, settleTransaction, verifyPaystackTransaction } from '../_shared/paystack.ts'

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const rawBody = await request.text()
  if (!await isValidWebhookSignature(rawBody, request.headers)) return new Response('Invalid signature', { status: 401 })

  let event: { event?: string; data?: { reference?: string } }
  try { event = JSON.parse(rawBody) } catch { return new Response('Invalid event', { status: 400 }) }
  if (event.event !== 'charge.success' && event.event !== 'charge.failed') return new Response('Event received', { status: 200 })
  const reference = event.data?.reference
  if (!reference) return new Response('Missing reference', { status: 400 })

  try {
    // Verify with Paystack's API before changing order or inventory state.
    const transaction = await verifyPaystackTransaction(reference)
    await settleTransaction(reference, transaction)
    return new Response('Event processed', { status: 200 })
  } catch (error) {
    console.error('Paystack webhook processing error:', error)
    return new Response('Event processing failed', { status: 500 })
  }
})
