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
  const [payment, setPayment] = useState('Pay on delivery')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || !address.trim() || !phone.trim()) return setNotice('Complete all delivery details')
    if (!supabase) return setNotice('Checkout is unavailable')
    if (catalogLoading) return setNotice('Please wait while we verify current stock')
    if (unavailableCartItems.length) return setNotice('Some cart items are unavailable or exceed current stock. Update your cart before checkout.')
    setSubmitting(true)
    const { data, error } = await supabase.rpc('place_customer_order', {
      p_customer_name: name.trim(), p_customer_email: email.trim(), p_phone: phone.trim(),
      p_shipping_address: address.trim(), p_payment_method: 'Pay on delivery',
      p_items: cart.map(item => ({ name: item.name, quantity: item.quantity || 1 })),
    })
    if (error) { setSubmitting(false); return setNotice(error.message) }
    const created = data?.[0]
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
    const order = { id: publicId, name, email, address, phone, payment, total: Number(created.total), status: 'Pending', items: orderItems, createdAt: new Date().toISOString() }
    const existing = JSON.parse(localStorage.getItem('pieceview_orders') || '[]')
    const nextOrders = [order, ...existing]
    localStorage.setItem('pieceview_orders', JSON.stringify(nextOrders))
    setOrders(nextOrders)
    const orderEvent = { id: `order-${Date.now()}`, type: 'order', title: 'Order placed', message: `${publicId} was confirmed`, time: 'Just now', read: false, route: '#/dashboard/orders' }
    setNotifications((previous: any[]) => {
      const next = [orderEvent, ...previous].slice(0, 20)
      localStorage.setItem('pieceview_notifications', JSON.stringify(next))
      return next
    })
    setCart([])
    localStorage.setItem('pieceview_cart', '[]')
    setNotice(`Order ${publicId} placed successfully`)
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
      <label><input type="radio" name="payment" checked={payment === 'Pay on delivery'} onChange={() => setPayment('Pay on delivery')} /> Pay on delivery</label>
      <label><input type="radio" name="payment" checked={payment === 'Paystack'} onChange={() => setPayment('Paystack')} /> Pay securely with Paystack</label>
      {payment === 'Paystack' && <p className="checkout-payment-hint">You'll be redirected to Paystack to pay by card or another available method.</p>}
    </fieldset>
    <button type="submit" disabled={!cart.length || submitting || catalogLoading || unavailableCartItems.length > 0}>{submitting ? (payment === 'Paystack' ? 'Starting secure payment…' : 'Placing order…') : payment === 'Paystack' ? 'Continue to payment' : 'Place order'}</button>
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
