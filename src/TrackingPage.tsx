import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './TrackingPage.css'

type Order = { id: string; status?: string; createdAt?: string }
type TrackingEvent = { status: string; note: string; created_at: string }

const checkpoints = ['Pending', 'Processing', 'Out for delivery', 'Completed']

function normalizeStatus(status?: string) {
  return status?.trim().toLowerCase() || 'pending'
}

export function TrackingPage({ orders = [] }: { orders?: Order[] }) {
  const [orderNumber, setOrderNumber] = useState(orders[0]?.id || '')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<TrackingEvent[]>([])
  const order = orders.find(item => item.id.toUpperCase() === orderNumber.trim().toUpperCase())

  useEffect(() => {
    if (!orderNumber && orders.length) setOrderNumber(orders[0].id)
  }, [orders, orderNumber])

  const track = async (event: React.FormEvent) => {
    event.preventDefault()
    setSearched(true)
    setHistory([])
    setError('')
    if (!order) return
    if (!supabase) return setError('Order tracking is unavailable right now.')
    setLoading(true)
    const { data, error: queryError } = await supabase.rpc('get_customer_order_tracking', { p_public_id: order.id })
    setLoading(false)
    if (queryError) return setError('We could not load the latest tracking updates. Please try again.')
    setHistory((data || []) as TrackingEvent[])
  }

  const currentStatus = normalizeStatus(order?.status)
  const currentIndex = checkpoints.findIndex(status => normalizeStatus(status) === currentStatus)
  const statusEvents = new Map<string, TrackingEvent>()
  history.forEach(item => statusEvents.set(normalizeStatus(item.status), item))

  return <section className="tracking-page">
    <form onSubmit={track}>
      <h2>Track your order</h2>
      <p>Enter an order number from your account to view its latest status history.</p>
      <label>Order number<input value={orderNumber} onChange={event => setOrderNumber(event.target.value)} placeholder="PV-26-123456"/></label>
      <button type="submit" disabled={loading || !orderNumber.trim()}>{loading ? 'Checking updates...' : 'Track order'}</button>
    </form>
    {searched && <div className="tracking-result" aria-live="polite">
      {!order ? <p className="admin-empty">No order with that number was found in your account.</p> : <>
        <span>Order {order.id}</span>
        {currentStatus === 'cancelled' ? <p className="tracking-cancelled">This order was cancelled.</p> : <ol className="tracking-timeline">
          {checkpoints.map((status, index) => {
            const event = statusEvents.get(normalizeStatus(status))
            const complete = currentIndex >= index
            return <li className={complete ? 'complete' : ''} key={status}>
              <span className="tracking-marker" aria-hidden="true"/>
              <div><b>{status === 'Completed' ? 'Delivered' : status}</b><small>{event ? new Date(event.created_at).toLocaleString() : complete && index === 0 ? new Date(order.createdAt || '').toLocaleDateString() : complete ? 'Completed' : 'Awaiting update'}</small>{event?.note && status !== 'Pending' && <small>{event.note}</small>}</div>
            </li>
          })}
        </ol>}
        {error && <p className="tracking-error" role="alert">{error}</p>}
        {!error && !loading && history.length > 0 && <details className="tracking-history"><summary>View update history</summary>{history.map((item, index) => <article key={`${item.status}-${item.created_at}-${index}`}><strong>{item.status}</strong><span>{item.note}</span><time>{new Date(item.created_at).toLocaleString()}</time></article>)}</details>}
      </>}
    </div>}
  </section>
}
