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
  const [subject, setSubject] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMessage, setSendMessage] = useState('')

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

  const sendCampaign = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase || !subscribers.length) return
    if (!window.confirm(`Send this campaign to all ${subscribers.length} active subscribers?`)) return
    setSending(true)
    setSendMessage('')
    const { data, error: sendError } = await supabase.functions.invoke('send-newsletter', {
      body: { subject, content, campaignId: crypto.randomUUID() },
    })
    setSending(false)
    if (sendError) {
      const responseError = typeof sendError.context?.json === 'function' ? await sendError.context.json().catch(() => null) : null
      return setSendMessage(responseError?.error || sendError.message || 'Campaign could not be sent.')
    }
    setSendMessage(data?.message || 'Campaign sent.')
    setSubject('')
    setContent('')
  }

  return <section className="admin-table marketing-admin">
    <header className="marketing-admin-header"><div><h2>Newsletter subscribers</h2><p>People who opted in to Piece View email updates.</p></div><button type="button" onClick={exportCsv} disabled={!subscribers.length}>Export CSV</button></header>
    {error && <p className="admin-message" role="alert">{error}</p>}
    <form className="marketing-campaign" onSubmit={sendCampaign}>
      <h3>Write an email update</h3>
      <label>Subject<input maxLength={120} value={subject} onChange={event => setSubject(event.target.value)} required/></label>
      <label>Message<textarea maxLength={8000} value={content} onChange={event => setContent(event.target.value)} rows={7} required/></label>
      <button type="submit" disabled={sending || loading || !subscribers.length}>{sending ? 'Sending...' : `Send to ${subscribers.length} subscribers`}</button>
      <p>This sends to opted-in subscribers and includes an unsubscribe link. You need a verified Resend sender domain and configured API key.</p>
      {sendMessage && <span role="status">{sendMessage}</span>}
    </form>
    {loading ? <p className="admin-empty">Loading subscribers...</p> : subscribers.length ? <>
      <p className="marketing-count">{subscribers.length} active {subscribers.length === 1 ? 'subscriber' : 'subscribers'}</p>
      <div className="marketing-list">{subscribers.map(subscriber => <article key={subscriber.email}><strong>{subscriber.email}</strong><time>{new Date(subscriber.subscribed_at).toLocaleDateString()}</time></article>)}</div>
    </> : !error && <p className="admin-empty">No newsletter subscribers yet.</p>}
    <p className="marketing-note">Campaigns are sent through Resend. Unsubscribed contacts are excluded from future sends.</p>
  </section>
}
