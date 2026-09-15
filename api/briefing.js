// api/briefing.js — 生成每日晨报
// 美股夜盘(Finnhub) + 经济日历(内置中美重大日程，保证有内容) + 国内要闻(Finnhub news) + AI 摘要(DeepSeek)
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

function fmt(d) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function inRange(d, from, to) { const t = d.getTime(); return t >= parse(from).getTime() && t <= parse(to).getTime() }
function nthWeekday(year, month, wd, n) {
  const d = new Date(year, month, 1)
  const off = (wd - d.getDay() + 7) % 7
  return new Date(year, month, 1 + off + (n - 1) * 7)
}
function lastDayOfMonth(year, month) { return new Date(year, month + 1, 0) }
function nextBiz(d) { const x = new Date(d); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x }

const FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16']
const GDP_US = [['2026-01-28', 'Q4 GDP 初值'], ['2026-04-28', 'Q1 GDP 初值'], ['2026-07-28', 'Q2 GDP 初值'], ['2026-10-28', 'Q3 GDP 初值']]
const GDP_CN = [['2026-01-17', 'Q4 GDP'], ['2026-04-16', 'Q1 GDP'], ['2026-07-15', 'Q2 GDP'], ['2026-10-18', 'Q3 GDP']]
const COUNTRY_LABEL = { US: '🇺🇸 美国', CN: '🇨🇳 中国' }

function pushIf(d, country, event, impact, time, events, from, to) {
  if (inRange(d, from, to)) events.push({ country, event, time, date: fmt(d), impact, major: true })
}
function buildCurated(from, to) {
  const start = parse(from), end = parse(to)
  const events = []
  const y0 = start.getFullYear(), y1 = end.getFullYear()
  const m0 = start.getMonth(), m1 = end.getMonth()
  for (let y = y0; y <= y1; y++) {
    const ms = (y === y0) ? m0 : 0
    const me = (y === y1) ? m1 : 11
    for (let m = ms; m <= me; m++) {
      pushIf(new Date(y, m, 13), 'US', '美国 CPI 通胀', 'high', '08:30 ET', events, from, to)
      pushIf(new Date(y, m, 14), 'US', '美国 PPI 生产者物价', 'high', '08:30 ET', events, from, to)
      pushIf(new Date(y, m, 15), 'US', '美国零售销售', 'medium', '08:30 ET', events, from, to)
      pushIf(nthWeekday(y, m, 5, 1), 'US', '美国非农就业 NFP', 'high', '08:30 ET', events, from, to)
      pushIf(nextBiz(new Date(y, m, 1)), 'US', '美国 ISM 制造业 PMI', 'medium', '10:00 ET', events, from, to)
      pushIf(new Date(y, m, 9), 'CN', '中国 CPI / PPI 通胀', 'high', '09:30', events, from, to)
      pushIf(new Date(y, m, 7), 'CN', '中国进出口贸易数据', 'medium', '11:00', events, from, to)
      pushIf(new Date(y, m, 14), 'CN', '中国社融 / 信贷 / M2', 'medium', '约20:00', events, from, to)
      pushIf(new Date(y, m, 15), 'CN', '中国工业增加值 / 零售 / 固投', 'medium', '10:00', events, from, to)
      pushIf(nextBiz(new Date(y, m, 20)), 'CN', '中国 LPR 贷款市场报价利率', 'high', '09:15', events, from, to)
      pushIf(lastDayOfMonth(y, m), 'CN', '中国官方制造业 PMI', 'high', '09:00', events, from, to)
      pushIf(nextBiz(new Date(y, m + 1, 1)), 'CN', '中国财新制造业 PMI', 'medium', '09:45', events, from, to)
    }
  }
  GDP_US.forEach(([d, ev]) => pushIf(parse(d), 'US', '美国 ' + ev, 'high', '08:30 ET', events, from, to))
  GDP_CN.forEach(([d, ev]) => pushIf(parse(d), 'CN', '中国 ' + ev, 'high', '10:00', events, from, to))
  FOMC_2026.forEach(d => pushIf(parse(d), 'US', '美联储 FOMC 利率决议', 'high', '14:00 ET', events, from, to))
  return events
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
    usMarket = parts.join('；') || '今日美股数据获取为空'
  } catch (e) { usMarket = '获取失败：' + e.message }

  // 2. 经济要闻（内置中美重大日程，保证有内容，不依赖 Finnhub 受限接口）
  let economy = ''
  try {
    const to = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)
    const items = buildCurated(date, to).slice(0, 8)
      .map(e => `${COUNTRY_LABEL[e.country] || e.country} ${e.event}（${e.time || '待定'}）`)
    economy = items.join('；') || '近期无重大经济事件'
  } catch (e) { economy = '近期无重大经济事件' }

  // 3. 国内/全球要闻（Finnhub 综合新闻，交给 AI 提取中国相关）
  let news = ''
  try {
    const n = await fh('/news', { category: 'general' })
    news = (n || []).slice(0, 15).map(x => x.headline).join(' | ')
  } catch (e) { news = '' }

  // 4. DeepSeek 综合摘要
  let summary = ''
  let usMarketFinal = usMarket, economyFinal = economy, domesticFinal = news ? '（Finnhub 公开新闻源有返回，正在提取中国相关）' : '（今日 Finnhub 公开新闻源无返回，可关注自选股与宏观速读手册）'
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
      domesticFinal = o.domestic || (news ? '（见上方原始新闻）' : '（今日 Finnhub 公开新闻源无返回，可关注自选股与宏观速读手册）')
      summary = o.summary || ''
    } catch (e) { summary = 'AI 摘要生成失败（DeepSeek 服务暂不可用），已保留原始数据。' }
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
