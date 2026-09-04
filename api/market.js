// api/market.js — 实时行情（雅虎财经，无需 key）
// 返回金价 / 美债收益率 / 美元指数 / 恐慌指数 的现价与今日涨跌幅
const QUOTES = [
  { symbol: 'GC=F',     label: '金价',     unit: ' 美元/oz', decimals: 1 },
  { symbol: '^TNX',     label: '美债10年', unit: '%',        decimals: 3 },
  { symbol: '^FVX',     label: '美债2年',  unit: '%',        decimals: 3 },
  { symbol: 'DX-Y.NYB', label: '美元指数', unit: '',         decimals: 2 },
  { symbol: '^VIX',     label: '恐慌指数', unit: '',         decimals: 2 },
]

async function fetchQuote(q) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(q.symbol)}?interval=1d&range=2d`
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return null
    const j = await r.json()
    const m = j?.chart?.result?.[0]?.meta
    if (!m || m.regularMarketPrice == null) return null
    return {
      symbol: q.symbol,
      label: q.label,
      unit: q.unit,
      decimals: q.decimals,
      value: m.regularMarketPrice,
      changePercent: m.regularMarketChangePercent ?? 0,
      updatedAt: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : new Date().toISOString()
    }
  } catch (e) {
    return null
  }
}

// 热实例内 60s 缓存，减少雅虎调用
let cache = { ts: 0, data: null }

export default async function handler(req, res) {
  try {
    const now = Date.now()
    if (cache.data && now - cache.ts < 60000) {
      return res.json({ cached: true, updatedAt: new Date(cache.ts).toISOString(), quotes: cache.data })
    }
    const quotes = (await Promise.all(QUOTES.map(fetchQuote))).filter(Boolean)
    cache = { ts: now, data: quotes }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate')
    res.json({ cached: false, updatedAt: new Date().toISOString(), quotes })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
