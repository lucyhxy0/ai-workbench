import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { todayStr } from '../lib/date.js'

// 超时保护：预览环境可能连不上 Supabase，防止永远卡「加载中」
function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms))
  ])
}

// 8 温度计（§一）；带 sym 的可由实时行情自动填入
const THERMO = [
  { k: 'vix', n: 'VIX 恐慌指数', en: 'VIX', h: '>20 紧张，>30 恐慌', sym: '^VIX' },
  { k: 'dxy', n: '美元指数', en: 'DXY', h: '强=资金回流美国=新兴市场承压', sym: 'DX-Y.NYB' },
  { k: 'us10y', n: '美十债收益率', en: 'US 10Y', h: '升=紧缩/增长强；降=降息预期', sym: '^TNX' },
  { k: 'usdjpy', n: '美元兑日元', en: 'USDJPY', h: '日元急升=套息平仓信号' },
  { k: 'xau', n: '黄金', en: 'XAU', h: '避险与真实利率的镜子', sym: 'GC=F' },
  { k: 'wti', n: '原油', en: 'WTI', h: '地缘冲突/需求预期体温计' },
  { k: 'us', n: '美股三大指数', en: 'S&P/Nasdaq/Dow', h: '全球风险资产定价锚' },
  { k: 'asia', n: '亚太 日经/恒生/A50', en: 'Nikkei/HSI/CSI300', h: '你开盘前已发生的故事' }
]

const LOCAL = { user_id: null, date: todayStr(), risk_on: '', driver: '', flow: '', conclusion: '', checklist: {}, thermo_readings: {}, expectations: [], cross_signals: {}, weekly_review: '', sunday_base: '' }
const READINGS = ['off', 'flat', 'on']

export default function MacroThermo() {
  const today = todayStr()
  const [macro, setMacro] = useState(null)
  const [market, setMarket] = useState(null)

  async function load() {
    const local = { ...LOCAL, date: today }
    try {
      const authRes = await withTimeout(supabase.auth.getUser(), 4000)
      const user = (authRes && !authRes.__timeout && authRes.data) ? authRes.data.user : null
      if (user) {
        const md = await withTimeout(supabase.from('macro_daily').select('*').eq('user_id', user.id).eq('date', today).maybeSingle(), 4000)
        let m = (md && !md.__timeout && md.data) ? md.data : null
        if (!m) { const ins = await withTimeout(supabase.from('macro_daily').insert({ user_id: user.id, date: today }).select().single(), 4000); m = (ins && !ins.__timeout && ins.data) ? ins.data : null }
        setMacro(m || local)
      } else {
        setMacro(local)
      }
    } catch {
      setMacro(local)
    }
  }
  useEffect(() => { load() }, [])

  // 实时行情（与行情条同源）
  useEffect(() => {
    let alive = true
    fetch('/api/market')
      .then(r => r.json())
      .then(j => {
        if (!alive || !j || !j.quotes) return
        const map = Object.fromEntries(j.quotes.map(q => [q.symbol, q]))
        setMarket(map)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 行情到后自动填满 8 温度计；缺数据的按联动规则补上
  useEffect(() => {
    if (!market || !macro) return
    autoFill(market, macro.thermo_readings)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, macro?.id])

  async function saveMacro(field, value) {
    if (!macro) return
    setMacro({ ...macro, [field]: value })
    if (macro.id) await supabase.from('macro_daily').update({ [field]: value }).eq('id', macro.id)
  }
  function setThermo(k, v) {
    const cur = (macro.thermo_readings && typeof macro.thermo_readings === 'object') ? macro.thermo_readings : {}
    saveMacro('thermo_readings', { ...cur, [k]: v })
  }
  function verdict() {
    const tr = macro.thermo_readings || {}
    let off = 0, on = 0
    Object.values(tr).forEach(v => { if (v === 'off') off++; else if (v === 'on') on++ })
    if (off >= on + 2) return { cls: 'off', big: '避险 · risk-off', sub: `四大件中 ${off} 项指向避险、${on} 项指向偏好 → 今天该防御` }
    if (on >= off + 2) return { cls: 'on', big: '风险偏好 · risk-on', sub: `${on} 项指向偏好、${off} 项指向避险 → 可适度积极` }
    return { cls: 'mid', big: '中性 / 分化', sub: `避险 ${off} · 偏好 ${on} → 信号不清晰，等确认` }
  }

  // 按实时行情 + 联动规则自动填 8 温度计（粗判，可手动覆盖）
  function autoFill(mkt = market, base = macro?.thermo_readings || {}) {
    if (!mkt || !macro) return
    const next = { ...base }
    const get = (sym) => mkt[sym]
    const vix = get('^VIX'), dxy = get('DX-Y.NYB'), tnx = get('^TNX'), xau = get('GC=F')

    // 有直接行情的四项
    if (vix && Number(vix.value) != null) {
      const v = Number(vix.value)
      next.vix = v > 22 ? 'off' : v < 15 ? 'on' : 'flat'
    }
    if (dxy) next.dxy = dxy.changePercent > 0 ? 'off' : dxy.changePercent < 0 ? 'on' : 'flat'
    if (tnx) next.us10y = tnx.changePercent > 0 ? 'flat' : tnx.changePercent < 0 ? 'on' : 'flat'
    if (xau) next.xau = xau.changePercent > 0 ? 'off' : xau.changePercent < 0 ? 'on' : 'flat'

    // 无直接行情的四项：按联动规则自动补上（仅在尚未手动填过时写入）
    if (!next.usdjpy) {
      if (next.dxy === 'off') next.usdjpy = 'on'          // 美元强 → 日元弱 → 套息未平
      else if (next.dxy === 'on') next.usdjpy = 'off'     // 美元弱 → 日元强
      else next.usdjpy = 'flat'
    }
    if (!next.wti) {
      if (next.vix === 'off' || next.xau === 'off') next.wti = 'off' // 避险/通胀升温
      else next.wti = 'flat'
    }
    if (!next.us) {
      if (next.vix === 'on') next.us = 'on'        // 恐慌低 → 风险偏好
      else if (next.vix === 'off') next.us = 'off' // 恐慌高 → 风险规避
      else next.us = 'flat'
    }
    if (!next.asia) {
      if (next.us !== 'flat') next.asia = next.us  // 亚太跟随美股隔夜情绪
      else next.asia = 'flat'
    }

    saveMacro('thermo_readings', next)
  }

  if (!macro) return <div className="card tint"><p className="sub">加载中…</p></div>

  const v = verdict()

  return (
    <div className="card tint">
      <h3>🧭 今日盘面定性器</h3>
      <p className="sub" style={{ marginTop: -4 }}>对 8 个温度计各判「避险 / 中性 / 偏好」，行情到后自动填；可手动调整。</p>

      {market && (
        <div className="mkt-autofill">
          <button className="btn ghost sm" onClick={() => autoFill()}>📡 按实时行情重新填入</button>
          <span className="note" style={{ marginLeft: 6 }}>粗判仅供参考</span>
        </div>
      )}

      {THERMO.map(t => (
        <div className="thermo-row" key={t.k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="nm">{t.n} <span className="en">{t.en}</span></span>
            <span className="en">{t.h}</span>
          </div>
          {market && market[t.sym] && (
            <div className="mkt-live">
              <span className="ml-v">{Number(market[t.sym].value).toFixed(market[t.sym].decimals ?? 2)}{market[t.sym].unit}</span>
              <span className={market[t.sym].changePercent >= 0 ? 'qch up' : 'qch down'}>
                {market[t.sym].changePercent >= 0 ? '▲' : '▼'} {Math.abs(market[t.sym].changePercent).toFixed(2)}%
              </span>
            </div>
          )}
          {!t.sym && (
            <div className="mkt-live">
              <span className="note">联动推断：{READINGS.includes(macro.thermo_readings?.[t.k]) ? (macro.thermo_readings[t.k] === 'off' ? '避险' : macro.thermo_readings[t.k] === 'on' ? '偏好' : '中性') : '—'}</span>
            </div>
          )}
          <div className="seg">
            <button className={(macro.thermo_readings?.[t.k] === 'off') ? 'off' : ''} onClick={() => setThermo(t.k, 'off')}>避险</button>
            <button className={(macro.thermo_readings?.[t.k] === 'flat') ? 'flat' : ''} onClick={() => setThermo(t.k, 'flat')}>中性</button>
            <button className={(macro.thermo_readings?.[t.k] === 'on') ? 'on' : ''} onClick={() => setThermo(t.k, 'on')}>偏好</button>
          </div>
        </div>
      ))}

      <div className={`verdict ${v.cls}`}>
        <span className="big">{v.big}</span>
        <span className="sub">{v.sub}</span>
      </div>
      <button className="btn ghost sm" onClick={() => saveMacro('risk_on', v.cls === 'off' ? 'off' : v.cls === 'on' ? 'on' : '未定')}>→ 结果填入三问自测</button>
    </div>
  )
}
