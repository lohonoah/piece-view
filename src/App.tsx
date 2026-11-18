import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShoppingBag,
  Users,
  WalletCards,
  X,
  ArrowRight,
} from 'lucide-react'
import './App.css'

const revenueData = [
  { month: 'Jan', revenue: 35, target: 29 }, { month: 'Feb', revenue: 42, target: 34 },
  { month: 'Mar', revenue: 38, target: 39 }, { month: 'Apr', revenue: 55, target: 43 },
  { month: 'May', revenue: 48, target: 47 }, { month: 'Jun', revenue: 62, target: 51 },
  { month: 'Jul', revenue: 58, target: 55 }, { month: 'Aug', revenue: 72, target: 59 },
  { month: 'Sep', revenue: 68, target: 63 }, { month: 'Oct', revenue: 81, target: 67 },
  { month: 'Nov', revenue: 76, target: 71 }, { month: 'Dec', revenue: 94, target: 76 },
]

const channelData = [
  { name: 'Direct', value: 84 }, { name: 'Social', value: 67 },
  { name: 'Search', value: 58 }, { name: 'Referral', value: 43 },
]

const transactions = [
  { name: 'Olivia Martin', email: 'olivia@pieceview.com', amount: '₦1,299,000', status: 'Completed', initials: 'OM', color: 'peach' },
  { name: 'Jackson Lee', email: 'jackson@pieceview.com', amount: '₦850,000', status: 'Pending', initials: 'JL', color: 'blue' },
  { name: 'Sophia Brown', email: 'sophia@pieceview.com', amount: '₦2,420,000', status: 'Completed', initials: 'SB', color: 'mint' },
  { name: 'Noah Wilson', email: 'noah@pieceview.com', amount: '₦620,000', status: 'Refunded', initials: 'NW', color: 'lavender' },
  { name: 'Mia Johnson', email: 'mia@pieceview.com', amount: '₦740,000', status: 'Completed', initials: 'MJ', color: 'peach' },
  { name: 'Liam Davis', email: 'liam@pieceview.com', amount: '₦1,080,000', status: 'Pending', initials: 'LD', color: 'blue' },
]

const hairCollection = [
  { name: 'Silk Press Bob', type: 'Premium straight wig', price: 48500, oldPrice: 56000, image: '/hair/silk-bob.jpg', tag: 'Bestseller' },
  { name: 'HD Lace Melt', type: '13×4 human hair frontal', price: 185000, oldPrice: 210000, image: '/hair/hd-lace.jpg', tag: 'Premium' },
  { name: 'Soft Glow Layers', type: '22-inch body wave', price: 95000, oldPrice: 112000, image: '/hair/soft-layers.jpg', tag: 'New arrival' },
  { name: 'Velvet Kinks', type: 'Kinky curly closure wig', price: 72500, oldPrice: 85000, image: '/hair/velvet-kinks.jpg', tag: 'Limited' },
]

function App() {
  const [period, setPeriod] = useState('Year')
  const [rangeOpen, setRangeOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [slide, setSlide] = useState(0)
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [notice, setNotice] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<(typeof transactions)[number] | null>(null)
  const [cartCount, setCartCount] = useState(0)

  const chartData = useMemo(() => {
    if (period === 'Quarter') return revenueData.slice(-6)
    if (period === 'Month') return revenueData.slice(-3)
    return revenueData
  }, [period])

  const filteredTransactions = transactions.filter(item =>
    `${item.name} ${item.email} ${item.status}`.toLowerCase().includes(query.toLowerCase())
  )

  const visibleTransactions = showAll ? filteredTransactions : filteredTransactions.slice(0, 4)

  const submitAuth = (event: React.FormEvent) => {
    event.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setError('')
    setSignedIn(true)
    setAuthOpen(false)
  }

  const runSearch = () => {
    document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const addToCart = () => {
    setCartCount(count => count + 1)
    setNotice(`${hairCollection[slide].name} added to cart`)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const closeMenuAndGo = (id: string) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Primary navigation">
        <div className="brand"><span className="brand-mark"><span /></span><strong>PIECE VIEW</strong></div>
        <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button>
        <nav>
          <p className="nav-label">Workspace</p>
          <a className="nav-item active" href="#overview" onClick={() => closeMenuAndGo('overview')}><LayoutDashboard size={18} />Overview</a>
          <a className="nav-item" href="#analytics" onClick={() => closeMenuAndGo('analytics')}><WalletCards size={18} />Analytics</a>
          <a className="nav-item" href="#customers" onClick={() => closeMenuAndGo('customers')}><Users size={18} />Customers</a>
          <a className="nav-item" href="#transactions" onClick={() => closeMenuAndGo('transactions')}><ShoppingBag size={18} />Transactions</a>
          <p className="nav-label">Manage</p>
          <a className="nav-item" href="#settings" onClick={() => { closeMenuAndGo('settings'); setNotice('Settings are ready for configuration') }}><Settings size={18} />Settings</a>
          <a className="nav-item" href="#help" onClick={() => { closeMenuAndGo('help'); setNotice('Help center opened') }}><CircleHelp size={18} />Help center</a>
        </nav>
        <div className="sidebar-footer">
          <div className="profile-avatar">AK</div>
          <div><strong>{signedIn ? 'Alex Kim' : 'Guest user'}</strong><span>{signedIn ? 'alex@pieceview.com' : 'Not signed in'}</span></div>
          <button aria-label={signedIn ? 'Sign out' : 'Sign in'} onClick={() => signedIn ? setSignedIn(false) : setAuthOpen(true)}>
            {signedIn ? <LogOut size={17} /> : <ChevronRight size={17} />}
          </button>
        </div>
      </aside>

      {menuOpen && <button className="menu-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <main>
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
          <form className="search" onSubmit={event => { event.preventDefault(); runSearch() }}><Search size={17} /><span className="sr-only">Search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search customers or status..." /></form>
          <div className="top-actions">
            <div className="notification-wrap">
              <button className="icon-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen(open => !open)}><Bell size={19} /><span className="notification-dot" /></button>
              {notificationsOpen && <div className="notification-popover"><strong>Notifications</strong><p>New payout of ₦1.299m was completed.</p><p>3 customers joined this week.</p></div>}
            </div>
            {cartCount > 0 && <button className="cart-button" onClick={() => setNotice(`${cartCount} item${cartCount > 1 ? 's' : ''} in your cart`)}>Cart <span>{cartCount}</span></button>}
            <button className="signin-button" onClick={() => signedIn ? setNotice('Account menu opened') : setAuthOpen(true)}>{signedIn ? 'My account' : 'Sign in'}</button>
          </div>
        </header>

        <div className="dashboard" id="overview">
          <section className="page-heading">
            <div><p className="eyebrow">PIECE VIEW COLLECTION</p><h1>Good morning, Alex</h1></div>
            <div className="range-wrap">
              <button className="range-button" onClick={() => setRangeOpen(!rangeOpen)} aria-expanded={rangeOpen}>Last {period.toLowerCase()} <ChevronDown size={15} /></button>
              {rangeOpen && <div className="range-menu" role="menu">
                {['Year', 'Quarter', 'Month'].map(item => <button role="menuitem" key={item} onClick={() => { setPeriod(item); setRangeOpen(false) }}>{item}</button>)}
              </div>}
            </div>
          </section>

          <section className="metrics" id="customers" aria-label="Key metrics">
            <article className="metric-card"><div><span>Total revenue</span><strong>₦124,580,000</strong><small><b>+12.5%</b> vs last period</small></div><div className="metric-icon coral">↗</div></article>
            <article className="metric-card"><div><span>New customers</span><strong>1,429</strong><small><b>+8.2%</b> vs last period</small></div><div className="metric-icon blue">+</div></article>
            <article className="metric-card"><div><span>Conversion</span><strong>3.68%</strong><small><b>+1.1%</b> vs last period</small></div><div className="metric-icon mint">↗</div></article>
            <article className="metric-card"><div><span>Avg. order</span><strong>₦87,240</strong><small><b className="negative">−2.4%</b> vs last period</small></div><div className="metric-icon purple">₦</div></article>
          </section>

          <section className="charts" id="analytics">
            <article className="chart-card revenue-card">
              <div className="card-heading"><div><h2>Revenue overview</h2><p>Performance across all channels</p></div><div className="legend"><span><i className="dot coral-dot" />Revenue</span><span><i className="dot muted-dot" />Target</span></div></div>
              <div className="chart-area">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 8, bottom: 0, left: -18 }}>
                    <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef7356" stopOpacity={0.18}/><stop offset="95%" stopColor="#ef7356" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid vertical={false} stroke="#ebe9e4" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill:'#8d9188', fontSize:12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill:'#8d9188', fontSize:12 }} tickFormatter={v => `₦${v}k`} />
                    <Tooltip formatter={(value) => [`₦${value}k`, '']} />
                    <Area type="monotone" dataKey="target" stroke="#b9bbb4" strokeDasharray="5 5" fill="none" strokeWidth={2} />
                    <Area type="monotone" dataKey="revenue" stroke="#e56f54" fill="url(#colorRevenue)" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="chart-card channels-card">
              <div className="card-heading"><div><h2>Sales by channel</h2><p>Top acquisition sources</p></div></div>
              <div className="channel-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData} layout="vertical" margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={58} tick={{ fill:'#62675f', fontSize:12 }} />
                    <Tooltip cursor={{ fill:'transparent' }} />
                    <Bar dataKey="value" fill="#ef7356" radius={[0, 6, 6, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="transactions-card" id="transactions">
            <div className="card-heading"><div><h2>Recent transactions</h2><p>{query ? `${filteredTransactions.length} matching results` : 'Latest customer activity'}</p></div><button className="text-button" onClick={() => setShowAll(all => !all)}>{showAll ? 'Show less' : 'View all'} <ChevronRight size={15} /></button></div>
            <div className="table-wrap">
              <table><thead><tr><th>Customer</th><th>Amount</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead>
                <tbody>{visibleTransactions.length ? visibleTransactions.map(item => <tr key={item.email}><td><div className="customer"><div className={`customer-avatar ${item.color}`}>{item.initials}</div><div><strong>{item.name}</strong><span>{item.email}</span></div></div></td><td><strong>{item.amount}</strong></td><td><span className={`status ${item.status.toLowerCase()}`}>{item.status}</span></td><td><button className="row-button" aria-label={`Open ${item.name} transaction`} onClick={() => setSelectedTransaction(item)}><ChevronRight size={16} /></button></td></tr>) : <tr><td colSpan={4}><div className="empty-state">No transactions match “{query}”</div></td></tr>}</tbody>
              </table>
            </div>
          </section>

          <section className="hair-showcase" aria-roledescription="carousel" aria-label="Featured Piece View hair collection">
            <div className="showcase-image-wrap">
              <img src={hairCollection[slide].image} alt={`${hairCollection[slide].name} hairstyle`} />
              <span className="showcase-tag">{hairCollection[slide].tag}</span>
              <div className="showcase-dots" aria-label="Choose product">
                {hairCollection.map((item, index) => (
                  <button key={item.name} className={slide === index ? 'active' : ''} onClick={() => setSlide(index)} aria-label={`Show ${item.name}`} aria-current={slide === index ? 'true' : undefined} />
                ))}
              </div>
            </div>
            <div className="showcase-copy">
              <p className="eyebrow">FEATURED THIS WEEK</p>
              <h2>{hairCollection[slide].name}</h2>
              <p>{hairCollection[slide].type}</p>
              <div className="showcase-price"><strong>₦{hairCollection[slide].price.toLocaleString('en-NG')}</strong><del>₦{hairCollection[slide].oldPrice.toLocaleString('en-NG')}</del></div>
              <button className="shop-button" onClick={addToCart}>Add to cart <ArrowRight size={16} /></button>
            </div>
            <div className="showcase-controls">
              <button aria-label="Previous piece" onClick={() => setSlide(index => (index - 1 + hairCollection.length) % hairCollection.length)}>‹</button>
              <span>{String(slide + 1).padStart(2, '0')} / {String(hairCollection.length).padStart(2, '0')}</span>
              <button aria-label="Next piece" onClick={() => setSlide(index => (index + 1) % hairCollection.length)}>›</button>
            </div>
          </section>
        </div>
      </main>

      {authOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setAuthOpen(false)}>
        <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={e => e.stopPropagation()}>
          <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close"><X size={19} /></button>
          <div className="auth-brand"><span className="brand-mark"><span /></span><strong>PIECE VIEW</strong></div>
          <h2 id="auth-title">Welcome back</h2><p>Sign in to continue to your dashboard.</p>
          <form onSubmit={submitAuth} noValidate>
            <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
            <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ characters" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="submit-button" type="submit">Sign in</button>
          </form>
          <button className="forgot-button" type="button" onClick={() => setNotice('Password reset instructions have been sent')}>Forgot your password?</button>
        </section>
      </div>}

      {selectedTransaction && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedTransaction(null)}>
        <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-title" onMouseDown={event => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setSelectedTransaction(null)} aria-label="Close"><X size={19} /></button>
          <p className="eyebrow">TRANSACTION DETAILS</p>
          <h2 id="transaction-title">{selectedTransaction.name}</h2>
          <p>{selectedTransaction.email}</p>
          <div className="detail-amount"><strong>{selectedTransaction.amount}</strong><span className={`status ${selectedTransaction.status.toLowerCase()}`}>{selectedTransaction.status}</span></div>
          <button className="submit-button" onClick={() => setSelectedTransaction(null)}>Done</button>
        </section>
      </div>}

      {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X size={14} /></button></div>}
      <span id="settings" className="anchor-target" aria-hidden="true" />
      <span id="help" className="anchor-target" aria-hidden="true" />
    </div>
  )
}

export default App
