import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { supabase } from './lib/supabase'
import type { CatalogProduct } from './catalog'
import { bankTransferConfig, bankTransferIsConfigured } from './lib/paymentConfig'
import type { PaymentMethod } from './types'
import type { CartItem } from './types'
import { clearCheckoutAttemptToken, createCheckoutFingerprint, getCheckoutAttemptToken, getUnavailableCartItems } from './commerce'
import './CheckoutPage.css'

const paystackEnabled = import.meta.env.VITE_PAYSTACK_ENABLED === 'true'

type CheckoutProps = {
  cart: CartItem[]
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
  const unavailableCartItems = catalogLoading
    ? []
    : getUnavailableCartItems(cart, catalogProducts)
  const [name, setName] = useState(currentUser?.name || '')
  const [email, setEmail] = useState(currentUser?.email || '')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [payment, setPayment] = useState<PaymentMethod>(bankTransferIsConfigured ? 'Bank Transfer' : 'Pay on delivery')
  const [senderName, setSenderName] = useState('')
  const [senderBank, setSenderBank] = useState('')
  const [transferRef, setTransferRef] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
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
    if (payment === 'Bank Transfer' && !bankTransferIsConfigured) return setNotice('Bank Transfer is temporarily unavailable. Choose another payment method.')
    if (payment === 'Paystack' && !paystackEnabled) return setNotice('Paystack checkout is temporarily unavailable.')
    if (receiptFile && !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(receiptFile.type)) return setNotice('Receipt must be a JPG, PNG, WebP, or PDF file.')
    if (receiptFile && receiptFile.size > 5 * 1024 * 1024) return setNotice('Receipt must be 5 MB or smaller.')
    if (!supabase) return setNotice('Checkout is unavailable')
    if (catalogLoading) return setNotice('Please wait while we verify current stock')
    if (unavailableCartItems.length) return setNotice('Some cart items are unavailable or exceed current stock. Update your cart before checkout.')

    let clientOrderToken: string
    try {
      const fingerprint = await createCheckoutFingerprint({
        customerName: name,
        customerEmail: email,
        phone,
        shippingAddress: address,
        paymentMethod: payment,
        items: cart.map(item => ({ name: item.name, quantity: item.quantity || 1 })),
        transferDetails: payment === 'Bank Transfer' ? {
          senderName,
          senderBank,
          transactionReference: transferRef,
        } : null,
      })
      clientOrderToken = getCheckoutAttemptToken(sessionStorage, fingerprint)
    } catch (attemptError) {
      const message = attemptError instanceof Error ? attemptError.message : 'Unknown storage error'
      return setNotice(`Could not safely prepare checkout: ${message}`)
    }

    setSubmitting(true)

    const rpcResult = await supabase.rpc('place_customer_order', {
      p_customer_name: name.trim(), p_customer_email: email.trim(), p_phone: phone.trim(),
      p_shipping_address: address.trim(), p_payment_method: payment,
      p_items: cart.map(item => ({ name: item.name, quantity: item.quantity || 1 })),
      p_transfer_details: payment === 'Bank Transfer' ? {
        senderName: senderName.trim(),
        senderBank: senderBank.trim(),
        transactionReference: transferRef.trim(),
      } : null,
      p_client_order_token: clientOrderToken,
    })

    if (rpcResult.error) { setSubmitting(false); return setNotice(rpcResult.error.message) }
    const created = rpcResult.data?.[0]
    if (!created) { setSubmitting(false); return setNotice('The order could not be confirmed') }
    const publicId = created.order_id

    if (payment === 'Bank Transfer' && receiptFile) {
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData.user?.id
      if (userId) {
        const extension = receiptFile.type === 'application/pdf'
          ? 'pdf'
          : receiptFile.type === 'image/png' ? 'png' : receiptFile.type === 'image/webp' ? 'webp' : 'jpg'
        const receiptPath = `${userId}/${clientOrderToken}/receipt.${extension}`
        const { error: uploadError } = await supabase.storage
          .from('bank-transfer-receipts')
          .upload(receiptPath, receiptFile, {
            cacheControl: '3600',
            contentType: receiptFile.type,
            upsert: true,
          })
        if (uploadError) {
          setSubmitting(false)
          return setNotice(`Order ${publicId} was created, but its receipt could not be uploaded: ${uploadError.message}`)
        }
        const { error: attachError } = await supabase.rpc('attach_bank_transfer_receipt', {
          p_public_id: publicId,
          p_receipt_path: receiptPath,
        })
        if (attachError) {
          setSubmitting(false)
          return setNotice(`Order ${publicId} was created, but receipt attachment failed: ${attachError.message}`)
        }
      }
    }

    if (payment === 'Paystack') {
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('paystack-initialize', { body: { orderId: publicId } })
      if (paymentError || !paymentData?.authorization_url) {
        setSubmitting(false)
        return setNotice(paymentData?.error || paymentError?.message || 'Could not start online payment. Your cart is still saved.')
      }
      clearCheckoutAttemptToken(sessionStorage, clientOrderToken)
      window.location.assign(paymentData.authorization_url)
      return
    }

    const orderItems = cart.map(item => {
      const currentProduct = catalogProducts.find(product => product.name === item.name)
      return currentProduct ? { ...currentProduct, quantity: item.quantity || 1 } : item
    })
    const paymentStatus = payment === 'Bank Transfer' ? 'Awaiting confirmation' : 'Not required'
    const order = {
      id: publicId,
      name,
      email,
      address,
      phone,
      payment,
      paymentStatus,
      transferDetails: payment === 'Bank Transfer' ? {
        senderName: senderName.trim(),
        senderBank: senderBank.trim(),
        transactionReference: transferRef.trim(),
      } : undefined,
      total: Number(created.total),
      status: 'Pending',
      items: orderItems,
      createdAt: new Date().toISOString()
    }
    const existing = JSON.parse(localStorage.getItem('pieceview_orders') || '[]')
    const nextOrders = [order, ...existing]
    localStorage.setItem('pieceview_orders', JSON.stringify(nextOrders))
    setOrders(nextOrders)

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
    clearCheckoutAttemptToken(sessionStorage, clientOrderToken)
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
      <label><input type="radio" name="payment" checked={payment === 'Bank Transfer'} disabled={!bankTransferIsConfigured} onChange={() => setPayment('Bank Transfer')} /> <strong>Direct Bank Transfer</strong> <small className="payment-badge-pill">{bankTransferIsConfigured ? 'Recommended' : 'Unavailable'}</small></label>
      
      {payment === 'Bank Transfer' && <div className="bank-transfer-box">
        {!bankTransferIsConfigured && <p className="cart-stock-warning" role="alert">Bank Transfer is temporarily unavailable because verified account details have not been configured.</p>}
        <p className="transfer-instructions">Transfer the exact total to our verified store account below, then enter your sender name to confirm your order.</p>
        <div className="bank-account-card">
          <div className="bank-row"><span>Bank Name</span><strong>{bankTransferConfig.bankName}</strong></div>
          <div className="bank-row"><span>Account Number</span><div className="acct-number-copy"><strong className="number-display">{bankTransferConfig.accountNumber}</strong><button type="button" className="copy-acct-btn" onClick={() => copyAccountNumber(bankTransferConfig.accountNumber)}>{copied ? '✓ Copied' : 'Copy number'}</button></div></div>
          <div className="bank-row"><span>Account Name</span><strong>{bankTransferConfig.accountName}</strong></div>
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
          <label>Payment receipt <span>(optional)</span>
            <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={event => setReceiptFile(event.target.files?.[0] || null)} />
          </label>
        </div>
      </div>}

      <label><input type="radio" name="payment" checked={payment === 'Pay on delivery'} onChange={() => setPayment('Pay on delivery')} /> Pay on delivery</label>
      {payment === 'Pay on delivery' && <p className="checkout-payment-hint">Pay in cash or transfer when your package arrives at your doorstep in Lagos.</p>}

      <label><input type="radio" name="payment" checked={payment === 'Paystack'} disabled={!paystackEnabled} onChange={() => setPayment('Paystack')} /> Pay securely with Paystack {!paystackEnabled && <small>(temporarily unavailable)</small>}</label>
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
