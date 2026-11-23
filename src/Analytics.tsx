import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type AdminAnalyticsOrder = {
  amount?: string | number | null
  created_at?: string | null
  customer_email?: string | null
  status?: string | null
}

type RevenuePoint = { label: string; revenue: number }
type StatusPoint = { name: string; value: number }

function buildAdminAnalytics(orders: AdminAnalyticsOrder[], period: string) {
  const now = new Date()
  const quarterStartMonth = now.getMonth() - now.getMonth() % 3
  const periodStart = period === 'Year'
    ? new Date(now.getFullYear(), 0, 1)
    : period === 'Quarter'
      ? new Date(now.getFullYear(), quarterStartMonth, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1)
  const points: RevenuePoint[] = []
  const pointKeys = new Map<string, RevenuePoint>()

  if (period === 'Month') {
    for (let day = 1; day <= now.getDate(); day += 1) {
      const point = { label: String(day), revenue: 0 }
      points.push(point)
      pointKeys.set(`${now.getFullYear()}-${now.getMonth()}-${day}`, point)
    }
  } else {
    const monthsToShow = period === 'Quarter' ? 3 : now.getMonth() + 1
    for (let offset = 0; offset < monthsToShow; offset += 1) {
      const date = new Date(periodStart.getFullYear(), periodStart.getMonth() + offset, 1)
      const key = `${date.getFullYear()}-${date.getMonth()}`
      const point = { label: date.toLocaleDateString('en-US', { month: 'short' }), revenue: 0 }
      points.push(point)
      pointKeys.set(key, point)
    }
  }

  const periodOrders = orders.filter(order => {
    if (!order.created_at) return false
    const createdAt = new Date(order.created_at)
    return !Number.isNaN(createdAt.getTime()) && createdAt >= periodStart && createdAt <= now
  })
  const statusCounts = new Map<string, number>()
  const revenueOrders = periodOrders.filter(order => order.status?.trim().toLowerCase() === 'completed')
  for (const order of periodOrders) {
    const createdAt = new Date(order.created_at!)
    const key = period === 'Month'
      ? `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`
      : `${createdAt.getFullYear()}-${createdAt.getMonth()}`
    const point = pointKeys.get(key)
    const amount = Number(String(order.amount ?? '').replace(/[^0-9.-]/g, ''))
    if (point && Number.isFinite(amount) && order.status?.trim().toLowerCase() === 'completed') point.revenue += amount
    const status = order.status?.trim() || 'Unknown'
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1)
  }

  const customerOrderCounts = new Map<string, number>()
  for (const order of orders) {
    if (order.status?.trim().toLowerCase() === 'cancelled') continue
    const email = order.customer_email?.trim().toLowerCase()
    if (email) customerOrderCounts.set(email, (customerOrderCounts.get(email) || 0) + 1)
  }
  const revenueTotal = revenueOrders.reduce((total, order) => {
    const amount = Number(String(order.amount ?? '').replace(/[^0-9.-]/g, ''))
    return total + (Number.isFinite(amount) ? amount : 0)
  }, 0)
  const repeatCustomers = [...customerOrderCounts.values()].filter(count => count > 1).length

  return {
    points,
    periodOrders,
    revenueTotal,
    completedOrderCount: revenueOrders.length,
    avgOrderValue: revenueOrders.length ? Math.round(revenueTotal / revenueOrders.length) : null,
    repeatCustomerRate: customerOrderCounts.size ? Math.round((repeatCustomers / customerOrderCounts.size) * 100) : null,
    statuses: [...statusCounts].map(([name, value]) => ({ name, value })),
  }
}

function RevenueChart({ data, hasOrders }: { data: RevenuePoint[]; hasOrders: boolean }) {
  return <article className="chart-card revenue-card"><div className="card-heading"><div><h2>Completed sales</h2><p>Completed order value</p></div></div>
    {hasOrders ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
      <defs><linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--brand-mauve)" stopOpacity={.18}/><stop offset="95%" stopColor="var(--brand-mauve)" stopOpacity={0}/></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#ebe9e4"/><XAxis dataKey="label" axisLine={false} tickLine={false}/><YAxis axisLine={false} tickLine={false} tickFormatter={value => String.fromCharCode(8358) + Math.round(Number(value) / 1000) + 'k'}/>
      <Tooltip formatter={value => String.fromCharCode(8358) + Number(value).toLocaleString('en-NG')}/><Area type="monotone" dataKey="revenue" stroke="var(--brand-mauve)" fill="url(#revenueFill)" strokeWidth={3}/>
    </AreaChart></ResponsiveContainer></div> : <p className="admin-empty">No orders recorded for this period yet.</p>}
  </article>
}

function OrdersByStatusChart({ data }: { data: StatusPoint[] }) {
  return <article className="chart-card channels-card"><div className="card-heading"><div><h2>Orders by status</h2><p>Recorded orders in the selected period</p></div></div>
    {data.length ? <div className="channel-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical"><XAxis type="number" hide/><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={90}/><Tooltip/><Bar dataKey="value" fill="var(--brand-mauve)" radius={[0, 6, 6, 0]} barSize={12}/></BarChart></ResponsiveContainer></div> : <p className="admin-empty">No orders recorded for this period yet.</p>}
  </article>
}

export function Analytics({ orders, period, setPeriod }: { orders: AdminAnalyticsOrder[]; period: string; setPeriod: (period: string) => void }) {
  const analytics = buildAdminAnalytics(orders, period)
  return <><section className="analytics-toolbar"><div>{['Year', 'Quarter', 'Month'].map(item => <button className={period === item ? 'active' : ''} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></section>
    <section className="charts"><RevenueChart data={analytics.points} hasOrders={analytics.completedOrderCount > 0}/><OrdersByStatusChart data={analytics.statuses}/></section>
    <section className="insight-grid">
      <article><span>Completed sales this period</span><strong>{String.fromCharCode(8358)}{analytics.revenueTotal.toLocaleString('en-NG')}</strong><p>Completed orders only</p></article>
      <article><span>Orders this period</span><strong>{analytics.periodOrders.length}</strong><p>Current {period.toLowerCase()}</p></article>
      <article><span>Avg order value</span><strong>{analytics.avgOrderValue === null ? 'N/A' : `${String.fromCharCode(8358)}${analytics.avgOrderValue.toLocaleString('en-NG')}`}</strong><p>Completed orders only</p></article>
      <article><span>Repeat customers</span><strong>{analytics.repeatCustomerRate === null ? 'N/A' : `${analytics.repeatCustomerRate}%`}</strong><p>Customers with more than one order</p></article>
    </section>
  </>
}
