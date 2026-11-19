import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import './MarketingAdmin.css'

type Subscriber = { email: string; subscribed_at: string; source: string }

function csvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safeValue.replaceAll('"', '""')}"`
}

export function MarketingAdmin() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase) {
        setError('Marketing contacts are unavailable.')
        setLoading(false)
        return
      }
      const { data, error: queryError } = await supabase.rpc('admin_list_newsletter_subscribers')
      if (!active) return
      setError(queryError?.message || '')
      if (!queryError) setSubscribers((data || []) as Subscriber[])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  const exportCsv = () => {
    const rows = [['Email', 'Subscribed at', 'Source'], ...subscribers.map(row => [row.email, row.subscribed_at, row.source])]
    const contents = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `piece-view-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="admin-table marketing-admin">
    <header className="marketing-admin-header"><div><h2>Newsletter subscribers</h2><p>People who opted in to Piece View email updates.</p></div><button type="button" onClick={exportCsv} disabled={!subscribers.length}>Export CSV</button></header>
    {error && <p className="admin-message" role="alert">{error}</p>}
    {loading ? <p className="admin-empty">Loading subscribers...</p> : subscribers.length ? <>
      <p className="marketing-count">{subscribers.length} active {subscribers.length === 1 ? 'subscriber' : 'subscribers'}</p>
      <div className="marketing-list">{subscribers.map(subscriber => <article key={subscriber.email}><strong>{subscriber.email}</strong><time>{new Date(subscriber.subscribed_at).toLocaleDateString()}</time></article>)}</div>
    </> : !error && <p className="admin-empty">No newsletter subscribers yet.</p>}
    <p className="marketing-note">Email campaigns are not connected yet. Connect an email provider before sending marketing messages.</p>
  </section>
}
