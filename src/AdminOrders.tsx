import { useState } from 'react'
import { Search, ShoppingBag } from 'lucide-react'
import { supabase } from './lib/supabase'
import { mapCatalogProduct, type CatalogProduct } from './catalog'
import './AdminOrders.css'

type AdminOrder = {
  id: number | string
  public_id?: string | null
  customer_name?: string | null
  customer_email?: string | null
  amount?: string | number | null
  status?: string | null
  created_at?: string | null
}

type Props = {
  orders: AdminOrder[]
  setOrders: (updater: (previous: AdminOrder[]) => AdminOrder[]) => void
  setInventory: (items: CatalogProduct[]) => void
  setMessage: (value: string) => void
}

const statuses = ['Pending', 'Processing', 'Out for delivery', 'Completed', 'Cancelled']

export function AdminOrders({ orders, setOrders, setInventory, setMessage }: Props) {
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null)
  const [orderDetail, setOrderDetail] = useState<any>(null)
  const [timeline, setTimeline] = useState<any[]>([])
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadOrder = async (order: AdminOrder) => {
    setSelectedOrder(order)
    setOrderDetail(null)
    setTimeline([])
    setStatus(order.status || 'Pending')
    setNote('')
    setError('')
    if (!supabase || !order.public_id) return
    setLoading(true)
    const { data, error: detailError } = await supabase.from('customer_orders')
      .select('*,customer_order_items(*)').eq('public_id', order.public_id).maybeSingle()
    if (detailError) { setError(detailError.message); setLoading(false); return }
    setOrderDetail(data)
    if (data) {
      const { data: history, error: historyError } = await supabase.from('customer_order_status_history')
        .select('status,note,created_at').eq('order_id', data.id).order('created_at', { ascending: true })
      if (historyError) setError(historyError.message)
      else setTimeline(history || [])
    }
    setLoading(false)
  }

  const updateStatus = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedOrder || !supabase) return
    if (orderDetail?.payment_method === 'Paystack' && orderDetail.payment_status !== 'Paid' && status !== 'Cancelled') {
      setError('Do not process this order until Paystack confirms payment. You can cancel it to release the reserved stock.')
      return
    }
    if (note.length > 500) { setError('Tracking note must be 500 characters or fewer.'); return }
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.rpc('admin_update_customer_order_status_with_note', {
      p_public_id: selectedOrder.public_id || String(selectedOrder.id),
      p_status: status,
      p_note: note.trim(),
    })
    if (updateError) { setError(updateError.message); setSaving(false); return }
    setOrders(previous => previous.map(row => row.id === selectedOrder.id ? { ...row, status } : row))
    setMessage('Order status updated')
    setNote('')
    const { data: stockRows, error: stockError } = await supabase.from('catalog_products').select('*').order('created_at', { ascending: false })
    if (stockError) setError(`Status saved, but inventory refresh failed: ${stockError.message}`)
    else setInventory((stockRows || []).map(mapCatalogProduct))
    await loadOrder({ ...selectedOrder, status })
    setSaving(false)
  }

  const visibleOrders = orders.filter(order => {
    const searchable = `${order.public_id || ''} ${order.customer_name || ''} ${order.customer_email || ''}`.toLowerCase()
    return searchable.includes(search.trim().toLowerCase()) && (filter === 'All' || order.status === filter)
  })
  const statusForm = selectedOrder && <form className="admin-order-update" onSubmit={updateStatus}>
    <h3>Update fulfillment</h3>
    <label>Status<select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Customer tracking note <span>Optional · {note.length}/500</span>
      <textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Add a delivery update or helpful detail" />
    </label>
    <button disabled={saving || status === (orderDetail?.status || selectedOrder.status)}>{saving ? 'Saving update…' : 'Save status update'}</button>
  </form>

  return <section className="admin-orders-workspace">
    <div className="admin-orders-list">
      <div className="admin-orders-heading"><div><h2>Orders</h2><p>{orders.length} total</p></div>
        <select aria-label="Filter orders by status" value={filter} onChange={event => setFilter(event.target.value)}><option>All</option>{statuses.map(item => <option key={item}>{item}</option>)}</select>
      </div>
      <label className="admin-orders-search"><Search size={16} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order or customer" /></label>
      <div className="admin-order-cards">{visibleOrders.map(order => <button key={order.id} className={`admin-order-card ${selectedOrder?.id === order.id ? 'active' : ''}`} onClick={() => loadOrder(order)}>
        <span><strong>{order.public_id || `Order ${order.id}`}</strong><time>{order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}</time></span>
        <span><b>{order.customer_name || order.customer_email || 'Customer'}</b><em className={`admin-order-status ${String(order.status || 'Pending').toLowerCase().replaceAll(' ', '-')}`}>{order.status || 'Pending'}</em></span>
        <span className="admin-order-amount">{order.amount || '—'}</span>
      </button>)}{!visibleOrders.length && <p className="admin-empty">No matching orders.</p>}</div>
    </div>
    <div className="admin-order-detail">{!selectedOrder ? <div className="admin-order-placeholder"><ShoppingBag size={28} /><h2>Select an order</h2><p>Customer details, items, and tracking updates will appear here.</p></div> : <>
      <div className="admin-order-detail-head"><div><p>ORDER DETAILS</p><h2>{selectedOrder.public_id || `Order ${selectedOrder.id}`}</h2></div><button type="button" onClick={() => { setSelectedOrder(null); setOrderDetail(null) }}>Close</button></div>
      {error && <p className="admin-message" role="alert">{error}</p>}
      {loading ? <p className="admin-empty">Loading order details…</p> : <>
        {orderDetail ? <>
          <div className="admin-order-customer">
            <div><span>Customer</span><strong>{orderDetail.customer_name}</strong><a href={`mailto:${orderDetail.customer_email}`}>{orderDetail.customer_email}</a></div>
            <div><span>Phone</span><strong>{orderDetail.phone || 'Not provided'}</strong></div>
            <div><span>Delivery address</span><strong>{orderDetail.shipping_address}</strong></div>
            <div><span>Payment</span><strong>{orderDetail.payment_method}{orderDetail.payment_method === 'Paystack' ? ` · ${orderDetail.payment_status}` : ''}</strong></div>
          </div>
          <section className="admin-order-items"><h3>Items</h3>{(orderDetail.customer_order_items || []).map((item: any) => <div key={item.id}>
            <img src={item.image || '/hair/hd-lace.jpg'} alt="" /><span><strong>{item.product_name}</strong><small>{item.product_type || 'Piece View product'} · Qty {item.quantity}</small></span>
            <b>₦{(Number(item.price) * Number(item.quantity)).toLocaleString('en-NG')}</b>
          </div>)}<p><span>Order total</span><strong>₦{Number(orderDetail.total || 0).toLocaleString('en-NG')}</strong></p></section>
        </> : <p className="admin-empty">Detailed customer and item records are unavailable for this order, but its fulfillment status can still be updated.</p>}
        {statusForm}
        {orderDetail && <section className="admin-order-timeline"><h3>Customer tracking timeline</h3>{timeline.length ? <ol>{timeline.map((item, index) => <li key={`${item.created_at}-${index}`}>
          <i /><div><strong>{item.status}</strong><p>{item.note}</p><time>{new Date(item.created_at).toLocaleString()}</time></div>
        </li>)}</ol> : <p className="admin-empty">No tracking updates are available.</p>}</section>}
      </>}
    </>}</div>
  </section>
}
