// api/briefing.js — 生成每日晨报
// 美股夜盘(Finnhub) + 经济日历(Finnhub) + AI 摘要(DeepSeek)
const FINNHUB = 'https://finnhub.io/api/v1'
const INDICES = ['^GSPC', '^IXIC', '^DJI']
const STOCKS = ['AAPL', 'NVDA', 'TSLA']

async function fh(path, params = {}) {
  const url = new URL(FINNHUB + path)
  url.searchParams.set('token', process.env.FINNHUB_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const r = await fetch(url)
  if (!r.ok) return null
  return r.json()
}

function fmtPct(n) { return (n >= 0 ? '+' : '') + n.toFixed(2) + '%' }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  if (!req.headers['authorization']) return res.status(401).json({ error: '未授权' })
  const date = (req.body?.date) || new Date().toISOString().slice(0, 10)
  const token = process.env.FINNHUB_API_KEY
  const dk = process.env.DEEPSEEK_API_KEY
  if (!token || token.includes('your-')) return res.status(500).json({ error: '未配置 FINNHUB_API_KEY' })

  // 1. 美股
  let usMarket = ''
  try {
    const parts = []
    for (const sym of [...INDICES, ...STOCKS]) {
      const q = await fh('/quote', { symbol: sym })
      if (q && q.c) parts.push(`${sym} ${q.c} (${fmtPct(q.dp || 0)})`)
    }
    usMarket = parts.join('；')
  } catch (e) { usMarket = '获取失败：' + e.message }

  // 2. 经济日历（未来 7 天）
  let economy = ''
  try {
    const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    const cal = await fh('/calendar/economic', { from: date, to })
    const items = (cal?.economicCalendar || []).slice(0, 8)
      .map(e => `${e.country} ${e.event} (预计 ${e.estimate ?? '—'}, 前值 ${e.previous ?? '—'})`)
    economy = items.join('；') || '近期无重大经济事件'
  } catch (e) { economy = '获取失败：' + e.message }

  // 3. 国内/全球要闻（Finnhub 综合新闻，交给 AI 提取中国相关）
  let news = ''
  try {
    const n = await fh('/news', { category: 'general' })
    news = (n || []).slice(0, 15).map(x => x.headline).join(' | ')
  } catch (e) { news = '' }

  // 4. DeepSeek 综合摘要
  let summary = ''
  let usMarketFinal = usMarket, economyFinal = economy, domesticFinal = '（暂无来源）'
  if (dk && !dk.includes('your-')) {
    try {
      const sys = '你是财经晨报编辑。根据以下原始数据，输出 JSON：{us_market(美股简述), economy(经济事件简述), domestic(从新闻中提取与中国/国内相关的重大事项，若无则说明), summary(100字以内三段式晨报)}。只输出 JSON。'
      const user = `美股原始: ${usMarket}\n经济日历: ${economy}\n新闻: ${news}`
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dk}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
          response_format: { type: 'json_object' }, temperature: 0.3
        })
      })
      const j = await r.json()
      const c = j.choices?.[0]?.message?.content || '{}'
      const o = JSON.parse(c)
      usMarketFinal = o.us_market || usMarket
      economyFinal = o.economy || economy
      domesticFinal = o.domestic || '（暂无来源）'
      summary = o.summary || ''
    } catch (e) { summary = 'AI 摘要生成失败，请查看明细。' }
  } else {
    summary = '（未配置 DeepSeek，仅显示原始数据）'
  }

  res.json({
    date,
    us_market: usMarketFinal,
    economy: economyFinal,
    domestic: domesticFinal,
    summary
  })
}
