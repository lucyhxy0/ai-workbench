// api/econ-calendar.js — 经济日历
// 双数据源：① Finnhub /calendar/economic（若免费档可用，含全球事件+预期/前值）
//           ② 内置「中美重大日程」生成器（按固定规律推算日期，不依赖付费接口，保证永远有内容）
const FINNHUB = 'https://finnhub.io/api/v1'

function fmt(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
function inRange(d, from, to) { const t = d.getTime(); return t >= parse(from).getTime() && t <= parse(to).getTime() }

// 每月第 n 个星期几（wd: 0=日…6=六）
function nthWeekday(year, month, wd, n) {
  const d = new Date(year, month, 1)
  const off = (wd - d.getDay() + 7) % 7
  return new Date(year, month, 1 + off + (n - 1) * 7)
}
function lastDayOfMonth(year, month) { return new Date(year, month + 1, 0) }
// 跳过周末（取之后第一个工作日）
function nextBiz(d) {
  const x = new Date(d)
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1)
  return x
}

// 美联储 FOMC 利率决议日（每年由美联储公布，此处为 2026 年官方日程；跨年需更新）
const FOMC_2026 = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-16']
// 季度 GDP 初值发布日（近似）
const GDP_US = [['2026-01-28', 'Q4 GDP 初值'], ['2026-04-28', 'Q1 GDP 初值'], ['2026-07-28', 'Q2 GDP 初值'], ['2026-10-28', 'Q3 GDP 初值']]
const GDP_CN = [['2026-01-17', 'Q4 GDP'], ['2026-04-16', 'Q1 GDP'], ['2026-07-15', 'Q2 GDP'], ['2026-10-18', 'Q3 GDP']]

function pushIf(d, country, event, impact, time, events, from, to) {
  if (inRange(d, from, to)) {
    events.push({
      country, event, estimate: null, previous: null, actual: null,
      date: fmt(d), time, impact, source: 'curated', major: true
    })
  }
}

// 生成 from~to 范围内的「中美重大日程」
function buildCurated(from, to) {
  const start = parse(from), end = parse(to)
  const events = []
  const y0 = start.getFullYear(), y1 = end.getFullYear()
  const m0 = start.getMonth(), m1 = end.getMonth()
  for (let y = y0; y <= y1; y++) {
    const ms = (y === y0) ? m0 : 0
    const me = (y === y1) ? m1 : 11
    for (let m = ms; m <= me; m++) {
      // —— 美国月度/周度 ——
      pushIf(new Date(y, m, 13), 'US', '美国 CPI 通胀', 'high', '08:30 ET', events, from, to)
      pushIf(new Date(y, m, 14), 'US', '美国 PPI 生产者物价', 'high', '08:30 ET', events, from, to)
      pushIf(new Date(y, m, 15), 'US', '美国零售销售', 'medium', '08:30 ET', events, from, to)
      pushIf(nthWeekday(y, m, 5, 1), 'US', '美国非农就业 NFP', 'high', '08:30 ET', events, from, to) // 每月首个周五
      pushIf(nextBiz(new Date(y, m, 1)), 'US', '美国 ISM 制造业 PMI', 'medium', '10:00 ET', events, from, to) // 每月首个工作日
      // —— 中国月度 ——
      pushIf(new Date(y, m, 9), 'CN', '中国 CPI / PPI 通胀', 'high', '09:30', events, from, to)
      pushIf(new Date(y, m, 7), 'CN', '中国进出口贸易数据', 'medium', '11:00', events, from, to)
      pushIf(new Date(y, m, 14), 'CN', '中国社融 / 信贷 / M2', 'medium', '约20:00', events, from, to)
      pushIf(new Date(y, m, 15), 'CN', '中国工业增加值 / 零售 / 固投', 'medium', '10:00', events, from, to)
      pushIf(nextBiz(new Date(y, m, 20)), 'CN', '中国 LPR 贷款市场报价利率', 'high', '09:15', events, from, to) // 每月20日(工作日)
      pushIf(lastDayOfMonth(y, m), 'CN', '中国官方制造业 PMI', 'high', '09:00', events, from, to) // 月末最后一天
      pushIf(nextBiz(new Date(y, m + 1, 1)), 'CN', '中国财新制造业 PMI', 'medium', '09:45', events, from, to) // 次月首个工作日
    }
  }
  GDP_US.forEach(([d, ev]) => pushIf(parse(d), 'US', '美国 ' + ev, 'high', '08:30 ET', events, from, to))
  GDP_CN.forEach(([d, ev]) => pushIf(parse(d), 'CN', '中国 ' + ev, 'high', '10:00', events, from, to))
  FOMC_2026.forEach(d => pushIf(parse(d), 'US', '美联储 FOMC 利率决议', 'high', '14:00 ET', events, from, to))
  return events
}

const COUNTRY_LABEL = { US: '🇺🇸 美国', CN: '🇨🇳 中国' }
function labelCountry(c) { return COUNTRY_LABEL[c] || c }

export default async function handler(req, res) {
  const u = new URL(req.url, 'http://localhost')
  const days = Math.min(Number(u.searchParams.get('days')) || 14, 60)
  const from = u.searchParams.get('from') || fmt(new Date())
  const to = u.searchParams.get('to') || fmt(new Date(Date.now() + days * 864e5))

  // 始终带上「中美重大日程」（不依赖外部接口）
  const curated = buildCurated(from, to)
  let live = []

  const token = process.env.FINNHUB_API_KEY
  if (token && !token.includes('your-')) {
    try {
      const fu = new URL(FINNHUB + '/calendar/economic')
      fu.searchParams.set('token', token)
      fu.searchParams.set('from', from)
      fu.searchParams.set('to', to)
      const r = await fetch(fu)
      if (r.ok) {
        const j = await r.json()
        live = (j.economicCalendar || [])
          .map(e => ({
            country: (e.country || '').toUpperCase(),
            event: e.event || '',
            estimate: e.estimate ?? null,
            previous: e.previous ?? null,
            actual: e.actual ?? null,
            date: e.date || '',
            time: e.time || '',
            impact: (e.impact || '').toLowerCase(),
            source: 'live', major: false
          }))
          .filter(e => e.event && e.date)
      }
    } catch { /* Finnhub 不可用则用纯中美日程 */ }
  }

  // 合并 + 去重（同日期+同事件名，优先保留有预期/前值的 live 版本）
  const map = new Map()
  const key = e => e.date + '|' + e.event
  curated.forEach(e => map.set(key(e), e))
  live.forEach(e => {
    const k = key(e)
    const exist = map.get(k)
    if (!exist) map.set(k, e)
    else if ((e.estimate != null || e.previous != null) && !exist.estimate && !exist.previous) map.set(k, e)
  })

  const list = [...map.values()].sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time) ||
    ({ high: 0, medium: 1, low: 2, '': 3 }[a.impact] - { high: 0, medium: 1, low: 2, '': 3 }[b.impact])
  )

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate')
  res.json({ from, to, events: list.map(e => ({ ...e, countryLabel: labelCountry(e.country) })) })
}
