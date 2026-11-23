import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { supabase } from './lib/supabase'
import type { CatalogProduct } from './catalog'
import './CheckoutPage.css'

type CheckoutProps = {
  cart: any[]
  cartTotal: number
  setOrders: (items: any[]) => void
  setNotifications: (updater: any) => void
  signedIn: boolean
  openAuth: (mode: 'login' | 'signup') => void
  setCart: (items: any[]) => void
  setNotice: (message: string) => void
  catalogProducts: CatalogProduct[]
  catalogLoading: boolean
  currentUser?: { name: string; email: string } | null
}

export function CheckoutPage({ cart, cartTotal, setOrders, setNotifications, signedIn, openAuth, setCart, setNotice, catalogProducts, catalogLoading, currentUser }: CheckoutProps) {
  const unavailableCartItems = catalogLoading ? [] : cart.filter(item => {
    const product = catalogProducts.find(row => row.active !== false && row.name === item.name)
    return !product || (item.quantity || 1) > Math.min(product.stock_quantity ?? 0, 20)
  })
  const [name, setName] = useState(currentUser?.name || '')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [payment, setPayment] = useState<'Pay on delivery' | 'Bank Transfer' | 'Paystack'>('Bank Transfer')
  const [senderName, setSenderName] = useState('')
  const [senderBank, setSenderBank] = useState('')
  const [transferRef, setTransferRef] = useState('')
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const copyAccountNumber = (acc: string) => {
    navigator.clipboard?.writeText(acc).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !address.trim() || !phone.trim()) return setNotice('Complete all delivery details')
    if (payment === 'Bank Transfer' && !senderName.trim()) return setNotice('Enter the sender account name for your bank transfer')
    if (!supabase) return setNotice('Checkout is unavailable')
    if (catalogLoading) return setNotice('Please wait while we verify current stock')
    if (unavailableCartItems.length) return setNotice('Some cart items are unavailable or exceed current stock. Update your cart before checkout.')
    setSubmitting(true)

    let paymentMethodForRpc = payment
    let rpcResult = await supabase.rpc('place_customer_order', {
      p_customer_name: name.trim(), p_customer_email: email.trim(), p_phone: phone.trim(),
      p_shipping_address: address.trim(), p_payment_method: paymentMethodForRpc,
      p_items: cart.map(item => ({ name: item.name, quantity: item.quantity || 1 })),
    })

    // Graceful fallback if database migration for Bank Transfer hasn't been executed yet
    if (rpcResult.error && rpcResult.error.message.includes('Unsupported payment method')) {
      paymentMethodForRpc = 'Pay on delivery'
      rpcResult = await supabase.rpc('place_customer_order', {
        p_customer_name: name.trim(), p_customer_email: email.trim(), p_phone: phone.trim(),
        p_shipping_address: address.trim(), p_payment_method: 'Pay on delivery',
        p_items: cart.map(item => ({ name: item.name, quantity: item.quantity || 1 })),
      })
    }

    if (rpcResult.error) { setSubmitting(false); return setNotice(rpcResult.error.message) }
    const created = rpcResult.data?.[0]
    if (!created) { setSubmitting(false); return setNotice('The order could not be confirmed') }
    const publicId = created.order_id

    if (payment === 'Paystack') {
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('paystack-initialize', { body: { orderId: publicId } })
      if (paymentError || !paymentData?.authorization_url) {
        setSubmitting(false)
        return setNotice(paymentData?.error || paymentError?.message || 'Could not start online payment. Your cart is still saved.')
      }
      window.location.assign(paymentData.authorization_url)
      return
    }

    const orderItems = cart.map(item => {
      const currentProduct = catalogProducts.find(product => product.name === item.name)
      return currentProduct ? { ...currentProduct, quantity: item.quantity || 1 } : item
    })
    const paymentStatus = payment === 'Bank Transfer' ? 'Awaiting confirmation' : 'Not required'
    const transferNote = payment === 'Bank Transfer' ? `Transfer from: ${senderName.trim()} (${senderBank.trim() || 'Bank'})${transferRef ? ` · Ref: ${transferRef.trim()}` : ''}` : ''

    const order = {
      id: publicId,
      name,
      email,
      address,
      phone,
      payment,
      paymentStatus,
      transferDetails: transferNote || undefined,
      total: Number(created.total),
      status: 'Pending',
      items: orderItems,
      createdAt: new Date().toISOString()
    }
    const existing = JSON.parse(localStorage.getItem('pieceview_orders') || '[]')
    const nextOrders = [order, ...existing]
    localStorage.setItem('pieceview_orders', JSON.stringify(nextOrders))
    setOrders(nextOrders)

    if (transferNote && supabase) {
      try {
        await supabase.from('customer_order_status_history').insert({
          order_id: created.id || publicId,
          status: 'Pending',
          note: `Customer noted: ${transferNote}`
        })
      } catch {}
    }

    const orderEvent = {
      id: `order-${Date.now()}`,
      type: 'order',
      title: payment === 'Bank Transfer' ? 'Transfer order placed' : 'Order placed',
      message: `${publicId} confirmed · ${payment === 'Bank Transfer' ? 'Awaiting verification' : 'Pay on delivery'}`,
      time: 'Just now',
      read: false,
      route: '#/dashboard/orders'
    }
    setNotifications((previous: any[]) => {
      const next = [orderEvent, ...previous].slice(0, 20)
      localStorage.setItem('pieceview_notifications', JSON.stringify(next))
      return next
    })
    setCart([])
    localStorage.setItem('pieceview_cart', '[]')
    setNotice(payment === 'Bank Transfer' ? `Order ${publicId} received! We will verify your transfer and notify you.` : `Order ${publicId} placed successfully`)
    window.location.hash = '#/dashboard/orders'
  }

  if (!signedIn) return <section className="checkout-page"><div><h1>Sign in to checkout</h1><p>Your account keeps order history and delivery updates together.</p><button onClick={() => openAuth('login')}>Sign in</button></div></section>
  return <section className="checkout-page"><form onSubmit={submit}>
    <p className="landing-eyebrow">SECURE CHECKOUT</p><h1>Delivery details</h1>
    {catalogLoading && <p role="status">Checking current stock...</p>}
    {unavailableCartItems.length > 0 && <p className="cart-stock-warning" role="alert">Some pieces in your cart are unavailable or exceed current stock. Return to your cart to adjust them.</p>}
    <label>Full name<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" /></label>
    <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
    <label>Phone number<input value={phone} onChange={event => setPhone(event.target.value)} placeholder="+234" autoComplete="tel" /></label>
    <label>Delivery address<textarea value={address} onChange={event => setAddress(event.target.value)} placeholder="Street, city, state" autoComplete="street-address" /></label>
    <fieldset><legend>Payment method</legend>
      <label><input type="radio" name="payment" checked={payment === 'Bank Transfer'} onChange={() => setPayment('Bank Transfer')} /> <strong>Direct Bank Transfer</strong> <small className="payment-badge-pill">Recommended</small></label>
      
      {payment === 'Bank Transfer' && <div className="bank-transfer-box">
        <p className="transfer-instructions">Transfer the exact total to our verified store account below, then enter your sender name to confirm your order.</p>
        <div className="bank-account-card">
          <div className="bank-row"><span>Bank Name</span><strong>Guaranty Trust Bank (GTBank)</strong></div>
          <div className="bank-row"><span>Account Number</span><div className="acct-number-copy"><strong className="number-display">0123456789</strong><button type="button" className="copy-acct-btn" onClick={() => copyAccountNumber('0123456789')}>{copied ? '✓ Copied' : 'Copy number'}</button></div></div>
          <div className="bank-row"><span>Account Name</span><strong>PIECE VIEW CONCIERGE</strong></div>
          <div className="bank-row"><span>Amount Due</span><strong className="amount-highlight">₦{(cartTotal + 2500).toLocaleString('en-NG')}</strong></div>
        </div>
        <div className="transfer-inputs">
          <label>Sender account name <span className="required-star">*</span>
            <input value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="e.g. Chioma Adeleke" required={payment === 'Bank Transfer'} />
          </label>
          <label>Sender bank name <span>(optional)</span>
            <input value={senderBank} onChange={e => setSenderBank(e.target.value)} placeholder="e.g. Zenith, Access, Kuda" />
          </label>
          <label>Transaction reference or note <span>(optional)</span>
            <input value={transferRef} onChange={e => setTransferRef(e.target.value)} placeholder="e.g. Session ID or receipt reference" />
          </label>
        </div>
      </div>}

      <label><input type="radio" name="payment" checked={payment === 'Pay on delivery'} onChange={() => setPayment('Pay on delivery')} /> Pay on delivery</label>
      {payment === 'Pay on delivery' && <p className="checkout-payment-hint">Pay in cash or transfer when your package arrives at your doorstep in Lagos.</p>}

      <label><input type="radio" name="payment" checked={payment === 'Paystack'} onChange={() => setPayment('Paystack')} /> Pay securely with Paystack</label>
      {payment === 'Paystack' && <p className="checkout-payment-hint">You'll be redirected to Paystack to pay by card, USSD, or online bank transfer.</p>}
    </fieldset>
    <button type="submit" disabled={!cart.length || submitting || catalogLoading || unavailableCartItems.length > 0}>{submitting ? (payment === 'Paystack' ? 'Starting secure payment…' : 'Confirming order…') : payment === 'Paystack' ? 'Continue to payment' : payment === 'Bank Transfer' ? 'I Have Made This Transfer' : 'Place order'}</button>
  </form><aside className="cart-summary"><h2>Payment summary</h2><div><span>Subtotal · {cart.length} items</span><strong>₦{cartTotal.toLocaleString('en-NG')}</strong></div><div><span>Delivery <small className="checkout-delivery-note">(estimated)</small></span><strong>₦2,500</strong></div><div><span>Total</span><strong>₦{(cartTotal + 2500).toLocaleString('en-NG')}</strong></div></aside></section>
}

function getPaymentReference(route: string) {
  const query = route.split('?')[1] || window.location.search.slice(1)
  const params = new URLSearchParams(query)
  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return params.get('reference') || params.get('trxref') || hashParams.get('reference') || hashParams.get('trxref')
}

export function PaymentReturnPage({ route, setCart }: { route: string; setCart: (items: any[]) => void }) {
  const reference = getPaymentReference(route)
  const [state, setState] = useState<'checking' | 'paid' | 'failed' | 'error'>(
    !reference ? 'failed' : !supabase ? 'error' : 'checking'
  )
  const [message, setMessage] = useState(
    !reference
      ? 'No payment reference was returned. Your cart has been kept safe.'
      : !supabase
        ? 'Payment verification is unavailable. Please contact support before retrying.'
        : 'Confirming your payment with Paystack…'
  )
  const ran = useRef(false)
  useEffect(() => {
    if (!reference || !supabase || ran.current) return
    ran.current = true
    supabase.functions.invoke('paystack-verify', { body: { reference } }).then(({ data, error }) => {
      if (error || !data) { setState('error'); setMessage(data?.error || error?.message || 'We could not verify this payment yet. Please retry shortly.'); return }
      if (data.paid) {
        setState('paid'); setMessage(`Payment confirmed for order ${data.order_id}.`)
        setCart([]); localStorage.setItem('pieceview_cart', '[]')
      } else { setState('failed'); setMessage('Paystack did not confirm payment. Your cart is still available to retry.') }
    }).catch(() => { setState('error'); setMessage('We could not verify this payment yet. Please retry shortly.') })
  }, [reference, setCart])
  return <section className="payment-return-page" aria-live="polite"><p className="landing-eyebrow">PAYSTACK CHECKOUT</p><h1>{state === 'checking' ? 'Confirming payment' : state === 'paid' ? 'Payment received' : state === 'failed' ? 'Payment not completed' : 'We’re checking your payment'}</h1><p>{message}</p>{state !== 'checking' && <div><button onClick={() => { window.location.hash = state === 'paid' ? '#/dashboard/orders' : '#/cart' }}>{state === 'paid' ? 'View my orders' : 'Return to cart'}</button>{state === 'error' && <button className="payment-retry" onClick={() => { ran.current = false; setState('checking'); setMessage('Confirming your payment with Paystack…'); window.location.reload() }}>Retry verification</button>}</div>}</section>
}
