import { useEffect, useState } from 'react'

// 实时行情条：调用 /api/market，展示金价/美债/美元/VIX 的现价与今日涨跌
export default function MarketQuotes() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/market')
      .then(r => r.json())
      .then(j => {
        if (!alive) return
        if (j.error) setErr(j.error)
        else setData(j)
      })
      .catch(() => { if (alive) setErr('行情加载失败，稍后重试') })
    return () => { alive = false }
  }, [])

  return (
    <section className="card">
      <div className="top">
        <span className="lbl">📡 实时行情</span>
        {data && (
          <span className="prog">
            {new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新
          </span>
        )}
      </div>

      {err && <div className="note">{err}</div>}
      {!data && !err && <div className="note">加载中…</div>}

      {data && (
        <div className="quotes">
          {data.quotes.map(q => {
            const up = q.changePercent >= 0
            const v = Number(q.value)
            const txt = isNaN(v) ? '—' : v.toFixed(q.decimals ?? 2)
            return (
              <div key={q.symbol} className="quote">
                <span className="ql">{q.label}</span>
                <span className="qv">{txt}{q.unit}</span>
                <span className={up ? 'qch up' : 'qch down'}>
                  {up ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="note">数据来自雅虎财经，仅供盘面参考，非投资建议</div>
    </section>
  )
}
