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

// 8 温度计（§一）
const THERMO = [
  { k: 'vix', n: 'VIX 恐慌指数', en: 'VIX', h: '>20 紧张，>30 恐慌' },
  { k: 'dxy', n: '美元指数', en: 'DXY', h: '强=资金回流美国=新兴市场承压' },
  { k: 'us10y', n: '美十债收益率', en: 'US 10Y', h: '升=紧缩/增长强；降=降息预期' },
  { k: 'usdjpy', n: '美元兑日元', en: 'USDJPY', h: '日元急升=套息平仓信号' },
  { k: 'xau', n: '黄金', en: 'XAU', h: '避险与真实利率的镜子' },
  { k: 'wti', n: '原油', en: 'WTI', h: '地缘冲突/需求预期体温计' },
  { k: 'us', n: '美股三大指数', en: 'S&P/Nasdaq/Dow', h: '全球风险资产定价锚' },
  { k: 'asia', n: '亚太 日经/恒生/A50', en: 'Nikkei/HSI/CSI300', h: '你开盘前已发生的故事' }
]

const LOCAL = { user_id: null, date: todayStr(), risk_on: '', driver: '', flow: '', conclusion: '', checklist: {}, thermo_readings: {}, expectations: [], cross_signals: {}, weekly_review: '', sunday_base: '' }

export default function MacroThermo() {
  const today = todayStr()
  const [macro, setMacro] = useState(null)

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

  if (!macro) return <div className="card tint"><p className="sub">加载中…</p></div>

  const v = verdict()

  return (
    <div className="card tint">
      <h3>🧭 今日盘面定性器</h3>
      <p className="sub" style={{ marginTop: -4 }}>对 8 个温度计各判「避险 / 中性 / 偏好」，自动算出今天的风险坐标。</p>
      {THERMO.map(t => (
        <div className="thermo-row" key={t.k}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="nm">{t.n} <span className="en">{t.en}</span></span>
            <span className="en">{t.h}</span>
          </div>
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
