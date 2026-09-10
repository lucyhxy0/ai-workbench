// api/econ-calendar.js — 经济日历（Finnhub /calendar/economic）
const FINNHUB = 'https://finnhub.io/api/v1'

function fmt(d) { return d.toISOString().slice(0, 10) }

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://localhost')
  const days = Math.min(Number(u.searchParams.get('days')) || 14, 30)
  const from = u.searchParams.get('from') || fmt(new Date())
  const to = u.searchParams.get('to') || fmt(new Date(Date.now() + days * 864e5))
  const token = process.env.FINNHUB_API_KEY
  if (!token || token.includes('your-')) {
    return res.status(500).json({ error: '未配置 FINNHUB_API_KEY' })
  }

  try {
    const fu = new URL(FINNHUB + '/calendar/economic')
    fu.searchParams.set('token', token)
    fu.searchParams.set('from', from)
    fu.searchParams.set('to', to)
    const r = await fetch(fu)
    if (!r.ok) return res.status(502).json({ error: 'Finnhub 请求失败 (' + r.status + ')' })
    const j = await r.json()
    const list = (j.economicCalendar || [])
      .map(e => ({
        country: e.country || '',
        event: e.event || '',
        estimate: e.estimate ?? null,
        previous: e.previous ?? null,
        actual: e.actual ?? null,
        date: e.date || '',
        time: e.time || '',
        impact: (e.impact || '').toLowerCase()
      }))
      .filter(e => e.event)
    const order = { high: 0, medium: 1, low: 2, '': 3 }
    list.sort((a, b) =>
      (order[a.impact] - order[b.impact]) ||
      (a.date + a.time).localeCompare(b.date + b.time)
    )
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate')
    res.json({ from, to, events: list })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
