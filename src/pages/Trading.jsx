import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import TopBar from '../components/TopBar.jsx'
import { todayStr, weekOfMonth } from '../lib/date.js'
import { api } from '../lib/api.js'

function mondayOf(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  return todayStr(d)
}

// 超时保护：预览环境可能连不上 Supabase，防止页面永远卡在「加载中」
function withTimeout(promise, ms = 4000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms))
  ])
}

// ---------- 每日动作清单（§六 / §九） ----------
const CHECK_KEYS = ['thermo', 'headlines', 'selftest', 'eventlog', 'cross', 'expect', 'weekend']
const CHECK_LABELS = {
  thermo: '扫 8 温度计，定 risk-on / off',
  headlines: '抓当日 1–3 条头条，定位驱动',
  selftest: '跑 3 问自测，写一句结论',
  eventlog: '记入事件日志（30 秒）',
  cross: '头条事件做跨资产 ≥3 项验证',
  expect: '数据发布日先写预期再对照',
  weekend: '周末回看本周日志，找模式'
}

// ---------- 跨资产验证（§8.2） ----------
const CROSS = [
  { k: 'usd_up', l: '美元↑' },
  { k: 'yield_down', l: '美债收益率↓' },
  { k: 'gold_up', l: '黄金↑' },
  { k: 'copper_down', l: '铜↓' },
  { k: 'cycl_down', l: '周期股↓' }
]

// ---------- 历史剧本库（§8.4） ----------
const PLAYBOOK = [
  { t: '2008 次贷', c: '房价→次贷→投行倒闭→全球信贷冻结', a: '股债齐跌、黄金先跌后涨（补保证金）' },
  { t: '2013 缩减恐慌', c: '伯南克提退出 QE→美债收益率暴力上行', a: '新兴市场血崩（依赖外部融资者最惨）' },
  { t: '2015 中国贬值+股灾', c: 'RMB 意外贬值→全球担心中国硬着陆', a: '8 月全球抛售' },
  { t: '2018 volmageddon', c: '做空 VIX 的 ETF 拥挤→VIX 单日翻倍', a: '量化平仓连锁' },
  { t: '2020 新冠', c: '流动性危机→股债金油同跌→美联储无限 QE', a: '风险资产 V 型反转' },
  { t: '2022 通胀冲击', c: 'CPI 失控→美联储激进加息', a: '股债双杀、美元独强、成长股腰斩' },
  { t: '2024/8/5 套息平仓', c: 'BOJ 意外加息→日元 160→142 急升→借日元买股被迫平仓', a: 'VIX 飙 38→一切风险资产跟跌' },
  { t: '2025/4 关税（解放日）', c: '全球 risk-off', a: '出口链与周期股最惨' }
]

export default function Trading() {
  const today = todayStr()
  const [rec, setRec] = useState(null)
  const [history, setHistory] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [aiText, setAiText] = useState('')
  const [msg, setMsg] = useState('')

  // 宏观速读
  const [macro, setMacro] = useState(null)
  const [events, setEvents] = useState([])
  const [eventForm, setEventForm] = useState({ date: today, event: '', reaction: '', assets: '', verify: '' })
  const [expDraft, setExpDraft] = useState({ name: '', expect: '', actual: '', note: '' })

  async function load() {
    const localMacro = { user_id: null, date: today, risk_on: '', driver: '', flow: '', conclusion: '', checklist: {}, thermo_readings: {}, expectations: [], cross_signals: {}, weekly_review: '', sunday_base: '' }
    const localRec = { operations: '', review: '', ai_analysis: '' }
    try {
      const authRes = await withTimeout(supabase.auth.getUser(), 4000)
      const user = (authRes && !authRes.__timeout && authRes.data) ? authRes.data.user : null
      if (user) {
        const uid = user.id
        // 操盘记录
        const td = await withTimeout(supabase.from('trading').select('*').eq('user_id', uid).eq('date', today).maybeSingle(), 4000)
        let d = (td && !td.__timeout && td.data) ? td.data : null
        if (!d) { const ins = await withTimeout(supabase.from('trading').insert({ user_id: uid, date: today }).select().single(), 4000); d = (ins && !ins.__timeout && ins.data) ? ins.data : null }
        setRec(d || localRec)
        const { data: h } = await withTimeout(supabase.from('trading').select('date,operations,review').eq('user_id', uid).order('date', { ascending: false }).limit(10), 4000)
        setHistory((h && !h.__timeout && h.data) ? h.data : [])
        // 宏观每日（表不存在时降级为本地预览）
        const md = await withTimeout(supabase.from('macro_daily').select('*').eq('user_id', uid).eq('date', today).maybeSingle(), 4000)
        let m = (md && !md.__timeout && md.data) ? md.data : null
        if (!m) { const ins2 = await withTimeout(supabase.from('macro_daily').insert({ user_id: uid, date: today }).select().single(), 4000); m = (ins2 && !ins2.__timeout && ins2.data) ? ins2.data : null }
        setMacro(m || localMacro)
        const ev = await withTimeout(supabase.from('macro_events').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(50), 4000)
        setEvents((ev && !ev.__timeout && ev.data) ? ev.data : [])
      } else {
        setRec(localRec)
        setMacro(localMacro)
        setMsg(user === null ? '未登录，当前为本地预览（登录后可自动保存）' : '⚠️ 数据库响应超时，当前为本地预览')
      }
    } catch (e) {
      console.error(e)
      setRec(localRec)
      setMacro(localMacro)
      setMsg('⚠️ 无法连接数据库，当前为本地预览')
    }
  }
  useEffect(() => { load() }, [])

  async function save(field, value) {
    if (!rec) return
    setRec({ ...rec, [field]: value })
    await supabase.from('trading').update({ [field]: value }).eq('id', rec.id)
  }

  async function saveMacro(field, value) {
    if (!macro) return
    setMacro({ ...macro, [field]: value })
    if (macro.id) await supabase.from('macro_daily').update({ [field]: value }).eq('id', macro.id)
  }
  function toggleCheck(key) {
    const cur = (macro.checklist && typeof macro.checklist === 'object') ? macro.checklist : {}
    saveMacro('checklist', { ...cur, [key]: !cur[key] })
  }

  function setCross(k) {
    const cur = (macro.cross_signals && typeof macro.cross_signals === 'object') ? macro.cross_signals : {}
    saveMacro('cross_signals', { ...cur, [k]: !cur[k] })
  }

  async function addEvent() {
    if (!eventForm.event.trim()) { setMsg('先填触发事件～'); setTimeout(() => setMsg(''), 2000); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('macro_events').insert({
      user_id: user.id, date: eventForm.date,
      event: eventForm.event.trim(), reaction: eventForm.reaction.trim(),
      assets: eventForm.assets.trim(), verify: eventForm.verify.trim()
    })
    setEventForm({ date: today, event: '', reaction: '', assets: '', verify: '' })
    setMsg('事件已记录 ✓')
    setTimeout(() => setMsg(''), 2000)
    await load()
  }

  function addExpect() {
    if (!expDraft.name.trim()) { setMsg('先填数据名称'); setTimeout(() => setMsg(''), 2000); return }
    const arr = [...(macro.expectations || []), { ...expDraft }]
    saveMacro('expectations', arr)
    setExpDraft({ name: '', expect: '', actual: '', note: '' })
  }
  function delExpect(i) {
    const arr = (macro.expectations || []).filter((_, x) => x !== i)
    saveMacro('expectations', arr)
  }

  async function analyze() {
    if (!rec?.operations && !rec?.review) { setMsg('请先填写操作或复盘'); return }
    setAnalyzing(true); setAiText('')
    try {
      const res = await api.chatStream([
        { role: 'system', content: '你是一位严谨的操盘教练。请根据用户的当日操作和复盘，给出简短、可执行的改进建议（不超过150字），聚焦纪律与风险。' },
        { role: 'user', content: `操作记录：${rec.operations || '无'}\n复盘笔记：${rec.review || '无'}` }
      ])
      if (!res.ok) throw new Error('分析失败')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setAiText(t => t + dec.decode(value))
      }
      await supabase.from('trading').update({ ai_analysis: aiText }).eq('id', rec.id)
    } catch (e) {
      setMsg(e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  if (!rec || !macro) return <div className="empty">加载中…</div>

  const crossCount = CROSS.filter(c => macro.cross_signals && macro.cross_signals[c.k]).length

  return (
    <>
      <TopBar title="操盘" right={<span className="tag">{weekOfMonth()}周</span>} />
      <div className="page theme-trade">

        {/* ===== 手册总览 ===== */}
        <div className="card washi tint">
          <h3>🌐 宏观速读手册</h3>
          <p className="sub" style={{ marginTop: -4 }}>每天看一眼行情，30 秒定性风险情绪，快速解读宏观局面。</p>
          <p className="sub" style={{ marginTop: 4 }}>用法：盘前扫「8 温度计」→ 用「事件→资产表」定位驱动 → 跑「3 问自测」。</p>
        </div>

        {/* ===== 3 问自测（§三） ===== */}
        <div className="card tint">
          <h3>🧭 3 问自测</h3>
          <label>1. 今天 risk-on 还是 off？</label>
          <select value={macro.risk_on} onChange={e => saveMacro('risk_on', e.target.value)}>
            <option value="">— 选一个 —</option>
            <option value="on">risk-on（风险偏好）</option>
            <option value="off">risk-off（避险）</option>
            <option value="未定">未定</option>
          </select>
          <label style={{ marginTop: 10 }}>2. 驱动是哪一类？</label>
          <input value={macro.driver} onChange={e => saveMacro('driver', e.target.value)} placeholder="如：央行政策 / 增长数据 / 地缘冲突" />
          <label style={{ marginTop: 10 }}>3. 钱从哪流向哪？</label>
          <input value={macro.flow} onChange={e => saveMacro('flow', e.target.value)} placeholder="如：股→债→金；美元强弱定方向" />
          <label style={{ marginTop: 10 }}>一句盘面结论</label>
          <textarea value={macro.conclusion} onChange={e => saveMacro('conclusion', e.target.value)} placeholder="用一句话定性今天" />
        </div>

        {/* ===== 进阶训练（§8） ===== */}
        <div className="card washi tint">
          <h3>🎯 进阶训练：从看新闻到读宏观</h3>
          <p className="sub" style={{ marginTop: -4 }}>逐项叠加，不必一次全上。每条都给了做法 + 例子。</p>
        </div>

        {/* §8.1 预期框架 */}
        <div className="card tint">
          <h3>📐 预期框架</h3>
          <p className="sub" style={{ marginTop: -4 }}>市场交易的不是数字，是「惊喜」（实际 vs 一致预期）。数据公布前先写预期。</p>
          <label>数据名称</label>
          <input value={expDraft.name} onChange={e => setExpDraft({ ...expDraft, name: e.target.value })} placeholder="如：美国非农" />
          <div className="row">
            <div><label>我的预期 X</label><input value={expDraft.expect} onChange={e => setExpDraft({ ...expDraft, expect: e.target.value })} placeholder="如：+20 万" /></div>
            <div><label>实际值</label><input value={expDraft.actual} onChange={e => setExpDraft({ ...expDraft, actual: e.target.value })} placeholder="如：+5 万" /></div>
          </div>
          <label>一句话解读（对/错/差多少）</label>
          <input value={expDraft.note} onChange={e => setExpDraft({ ...expDraft, note: e.target.value })} placeholder="如：远低于预期→衰退交易升温" />
          <button className="btn sm" style={{ marginTop: 8 }} onClick={addExpect}>＋ 添加一条预期</button>
          {(macro.expectations || []).map((x, i) => (
            <div className="exp-item" key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{x.name}</b>
                <span className="sub" style={{ cursor: 'pointer', color: 'var(--coral)' }} onClick={() => delExpect(i)}>删除</span>
              </div>
              <div className="sub">预期 {x.expect || '—'} ｜ 实际 {x.actual || '—'}</div>
              {x.note && <div className="sub">{x.note}</div>}
            </div>
          ))}
        </div>

        {/* §8.2 跨资产交叉验证 */}
        <div className="card tint">
          <h3>🔗 跨资产交叉验证</h3>
          <p className="sub" style={{ marginTop: -4 }}>单资产异动多是噪声；真宏观行情一定跨资产共振。≥3 项同向才算信号。</p>
          <div style={{ marginTop: 6 }}>
            {CROSS.map(c => (
              <span key={c.k} className={`chip ${(macro.cross_signals && macro.cross_signals[c.k]) ? 'on' : ''}`} onClick={() => setCross(c.k)}>{c.l}</span>
            ))}
          </div>
          <p className="sub" style={{ marginTop: 8 }}>
            今日同向信号：<b>{crossCount}/5</b> {crossCount >= 3 ? '→ 真信号，可信任' : '→ 还不到，先观望'}
          </p>
          <p className="sub">进阶：盯「相关性破裂」——黄金与美元同涨、股债同跌、日元升但日股不跌，都是 regime 切换前兆。</p>
        </div>

        {/* §8.6 写 + 复盘 */}
        <div className="card tint">
          <h3>✍️ 写 + 复盘（闭环）</h3>
          <p className="sub" style={{ marginTop: -4 }}>被动读 10 篇，不如自己写 1 篇。解释会逼出综合，这是长盘感最快的路。</p>
          <label>每周复盘：我判对 / 判错在哪、为什么</label>
          <textarea value={macro.weekly_review} onChange={e => saveMacro('weekly_review', e.target.value)} placeholder="周末回看本周事件日志，校准比覆盖量重要" />
          <label style={{ marginTop: 10 }}>周日「下周宏观基准情形」</label>
          <textarea value={macro.sunday_base} onChange={e => saveMacro('sunday_base', e.target.value)} placeholder="列出 1–2 个核心假设，下周对账（错得越具体进步越快）" />
        </div>

        {/* ===== 事件日志（§四） ===== */}
        <div className="card tint">
          <h3>📓 事件日志</h3>
          <p className="sub" style={{ marginTop: -4 }}>坚持记录 + 复盘，3 个月出盘感</p>
          <label>日期</label>
          <input type="date" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} />
          <label style={{ marginTop: 8 }}>触发事件</label>
          <input value={eventForm.event} onChange={e => setEventForm({ ...eventForm, event: e.target.value })} placeholder="如：BOJ 意外加息→日元急升" />
          <label style={{ marginTop: 8 }}>市场反应</label>
          <input value={eventForm.reaction} onChange={e => setEventForm({ ...eventForm, reaction: e.target.value })} placeholder="如：日经 -12%、美股熔断" />
          <label style={{ marginTop: 8 }}>受影响资产</label>
          <input value={eventForm.assets} onChange={e => setEventForm({ ...eventForm, assets: e.target.value })} placeholder="如：日股/美股↓ 黄金先跌后涨" />
          <label style={{ marginTop: 8 }}>一周后验证</label>
          <input value={eventForm.verify} onChange={e => setEventForm({ ...eventForm, verify: e.target.value })} placeholder="事后回看，验证当时判断" />
          <button className="btn" style={{ marginTop: 10 }} onClick={addEvent}>记录事件</button>

          {events.length > 0 && (
            <div style={{ marginTop: 12 }}>
              {events.map(e => (
                <div key={e.id} style={{ borderTop: '1px dashed var(--line)', paddingTop: 8, marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{e.date}</div>
                  <div className="sub"><b>事件：</b>{e.event}</div>
                  {e.reaction && <div className="sub"><b>反应：</b>{e.reaction}</div>}
                  {e.assets && <div className="sub"><b>资产：</b>{e.assets}</div>}
                  {e.verify && <div className="sub"><b>验证：</b>{e.verify}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== 参考手册（纯文字整合，单一折叠） ===== */}
        <details className="card tint">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📚 参考手册（全文整合）</summary>

          <p className="sub" style={{ marginTop: 8, fontWeight: 700 }}>一、8 个全球温度计</p>
          <div className="tbl">
            <table>
              <tbody>
                {[
                  ['VIX 恐慌指数', 'VIX', '>20 紧张，>30 恐慌', '全局风险情绪总开关'],
                  ['美元指数', 'DXY', '强弱', '强美元=资金回流美国=新兴市场承压'],
                  ['美十债收益率', 'US 10Y', '升降', '升=紧缩/增长强；降=衰退/降息预期'],
                  ['美元兑日元', 'USDJPY', '急升=套息平仓', '全球杠杆资金“拆除信号”'],
                  ['黄金', 'XAU', '与美元反向', '避险与真实利率的镜子'],
                  ['原油', 'WTI', '涨跌', '地缘冲突/需求预期体温计'],
                  ['美股三大指数', 'S&P/Nasdaq/Dow', '方向', '全球风险资产定价锚'],
                  ['亚太：日经/恒生/A50', 'Nikkei/HSI/CSI300', '隔夜反应', '你开盘前已发生的故事']
                ].map(r => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}<br /><span className="sub">{r[1]}</span></td>
                    <td className="sub">{r[2]}</td>
                    <td className="sub">{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>📌 口诀：<b>VIX↑ + 美元强 + 黄金涨 + 美股跌 = 避险</b>；反之 = 风险偏好。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>二、事件 → 资产传导表</p>
          <div className="tbl" style={{ marginTop: 6 }}>
            <table>
              <tbody>
                {[
                  ['货币政策·鹰派', '加息、缩表', '美元、银行股', '成长股、黄金(短期)、债券价格'],
                  ['货币政策·鸽派', '降息、放水', '成长股、黄金、长债', '美元、银行净息差'],
                  ['衰退担忧', '非农弱、PMI<50、收益率倒挂', '黄金、长债、美元(避险)', '周期股、原油、风险资产'],
                  ['地缘冲突', '中东/台海升温', '原油、黄金、军工', '航运、风险资产'],
                  ['套息交易平仓', '日元急升(USDJPY 暴跌)', '黄金、日元、日债', '日股、美股、carry 标的'],
                  ['关税/贸易战', '关税生效、脱钩', '本土替代、黄金', '出口链、全球供应链股'],
                  ['中国刺激', '降准/财政加码', 'A股、港股、有色、人民币', '美元(相对)'],
                  ['科技/AI 叙事', '大厂资本开支、财报', '半导体、纳指、电力', '—']
                ].map(r => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}</td>
                    <td className="sub">{r[1]}</td>
                    <td className="sub">涨：{r[2]}</td>
                    <td className="sub">跌：{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>关键判断：暴跌是「流动性/汇率驱动（全面系统性）」还是「盈利/基本面驱动（结构性分化）」？前者该躲，后者藏错杀机会。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>8.3 资产探针（更纯的指标）</p>
          <div className="tbl" style={{ marginTop: 6 }}>
            <table>
              <tbody>
                {[
                  ['铜 Copper', '全球实物增长（中国需求代理）', '铜价↓=中国/全球需求走弱；与 A股周期、有色联动'],
                  ['黄金 XAU', '真实利率 + 恐慌', '与美实际利率反向；避险时独立于美元上涨'],
                  ['USDJPY / AUDJPY', '套息与风险晴雨表', '日元急升=全球去杠杆；AUDJPY 跌=风险 off'],
                  ['2s10s（10年-2年利差）', '衰退领先', '倒挂（2Y>10Y）领先衰退约 12 个月'],
                  ['高收益债利差 HY OAS', '信用/恐慌压力', '走阔=融资环境收紧、risk-off'],
                  ['比特币 BTC', '流动性 + 风险偏好', '与纳指同频，常领先；也是美元流动性代理'],
                  ['美元流动性（Fed 资产负债表/RRP/TGA）', '全球水位', '扩表/逆回购降=水位升=风险资产涨']
                ].map(r => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}</td>
                    <td className="sub">{r[1]}</td>
                    <td className="sub">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>📌 AH 交易者重点看：<b>铜（中国需求代理）+ 美元流动性（新兴/港股命门）</b>，这俩基本定了你仓位的宏观脸色。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>8.4 历史剧本库（盘感=模式匹配）</p>
          {PLAYBOOK.map(p => (
            <div className="playbook" key={p.t}>
              <h4>{p.t}</h4>
              <p><b>触发 → 传导：</b>{p.c}</p>
              <p><b>资产反应：</b>{p.a}</p>
            </div>
          ))}
          <p className="sub">用法：行情异动时自问「这像哪段历史？差在哪？」——强制模式匹配，比记住结论有用。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>8.5 领先 vs 滞后指标</p>
          <div className="tbl" style={{ marginTop: 6 }}>
            <table>
              <tbody>
                {[
                  ['领先', '收益率曲线(10Y-2Y)、PMI、首申失业金、信用利差、美元流动性、铜价、消费者信心', '提前数月预告方向'],
                  ['同步', '工业增加值、零售销售、非农就业', '反映当下'],
                  ['滞后', 'GDP（多次修订）、CPI 同比、失业率', '确认已发生，别用它预判']
                ].map(r => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}</td>
                    <td className="sub">{r[1]}</td>
                    <td className="sub">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub" style={{ marginTop: 6 }}>用领先指标判断「方向」，用滞后数据确认「已经发生」，不本末倒置。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>五、案例拆解 / 信息源分层</p>
          <p className="sub">1. <b>套息交易平仓</b>（2024/8/5）：BOJ 加息→日元急升→全球借日元买股资金平仓→VIX 飙 38→风险资产跟跌。看到「日经 -12%」，3 秒跑出「日元→套息→系统性」链。</p>
          <p className="sub">2. <b>衰退交易</b>：非农爆冷、PMI 破荣枯线→押注美联储落后曲线→成长股杀估值。</p>
          <p className="sub">3. <b>关税冲击</b>（2025/4）：全球 risk-off，出口链与周期股最惨。</p>
          <p className="sub" style={{ marginTop: 8, fontWeight: 700 }}>信息源分层</p>
          <p className="sub">快讯：金十数据、华尔街见闻、财联社、选股宝</p>
          <p className="sub">深度：财新、21 世纪经济报道、FT 中文、Bloomberg、Reuters</p>
          <p className="sub">数据：FRED、TradingEconomics、腾讯自选股/Tushare/Wind</p>
          <p className="sub">观点：The Kobeissi Letter、Macro Compass、付鹏、管清友</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>8.7 一手政策语言 / 8.8 微观反推宏观</p>
          <p className="sub">一手源：FOMC 声明/纪要、点阵图、ECB 账户、PBOC 货币政策执行报告、BIS 季度报告、各国财政部发文。</p>
          <p className="sub">读什么：不是结论，是措辞变化——删了「数据依赖」、加了「更久维持高位」、点阵图中枢上移、PBOC 提「逆周期调节」，都是定价信号。</p>
          <p className="sub" style={{ marginTop: 8, fontWeight: 700 }}>8.8 微观反推宏观（bottom-up → top-down）</p>
          <p className="sub">航运/货运（马士基、ZIM）下调指引→全球贸易需求走弱。</p>
          <p className="sub">半导体资本开支（英伟达、台积电）↑→AI 周期向上，拉动电力/铜。</p>
          <p className="sub">零售商（沃尔玛、Target）库存↑+降价→消费降温。</p>
          <p className="sub">中国地产/建材链数据→内需与政策力度信号。</p>

          <p className="sub" style={{ marginTop: 10, fontWeight: 700 }}>九、训练频率表</p>
          <div className="tbl" style={{ marginTop: 6 }}>
            <table>
              <tbody>
                {[
                  ['每个交易日晨', '扫 8 温度计 + 3 问自测 + 写 1 句结论', '定性（§一/三）'],
                  ['每个交易日', '记事件日志（30 秒）', '模式积累（§四）'],
                  ['数据发布日', '先写预期再对照结果', '预期锚（§8.1）'],
                  ['每个交易日', '头条事件做跨资产 ≥3 项验证', '信号鉴别（§8.2）'],
                  ['每周', '事件日志复盘：判对/判错在哪', '校准（§8.6）'],
                  ['每周日', '写「下周宏观基准情形」并留痕', '预判闭环（§8.6）'],
                  ['每月', '更新历史剧本库 + 读 1 份央行原文', 'regime / 一手源（§8.4/8.7）'],
                  ['随时', '异动时问「像哪段历史？相关资产同意吗？」', '模式匹配+验证（§8.2/8.4）']
                ].map(r => (
                  <tr key={r[0]}>
                    <td style={{ fontWeight: 700 }}>{r[0]}</td>
                    <td className="sub">{r[1]}</td>
                    <td className="sub">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {/* ===== 每日动作清单（§六） ===== */}
        <div className="card tint">
          <h3>✅ 每日动作清单</h3>
          {CHECK_KEYS.map(k => (
            <div className="check-row" key={k}>
              <input type="checkbox" checked={!!(macro.checklist && macro.checklist[k])} onChange={() => toggleCheck(k)} />
              <span className="label">{CHECK_LABELS[k]}</span>
            </div>
          ))}
        </div>

        {/* ===== 原有操盘功能 ===== */}
        <div className="card washi tint">
          <h3>📈 {today} 操作记录</h3>
          <textarea value={rec.operations} onChange={e => save('operations', e.target.value)} placeholder="今日买卖、持仓变动、触发原因…" />
        </div>
        <div className="card tint">
          <h3>📝 今日复盘</h3>
          <textarea value={rec.review} onChange={e => save('review', e.target.value)} placeholder="执行了哪些计划？哪里没做好？情绪如何？" />
          <button className="btn" style={{ marginTop: 10 }} disabled={analyzing} onClick={analyze}>
            {analyzing ? 'AI 分析中…' : '✨ AI 辅助分析'}
          </button>
          {aiText && <div className="bubble ai" style={{ marginTop: 10, maxWidth: '100%' }}>{aiText}</div>}
        </div>
        <div className="card tint">
          <h3>📜 近期记录</h3>
          {history.map(h => (
            <div key={h.date} className="check-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="label" style={{ fontSize: 13 }}>{h.date}</span>
              <span className="sub" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.operations || h.review || '—'}</span>
            </div>
          ))}
        </div>

        {msg && <p className="muted center" style={{ fontSize: 13 }}>{msg}</p>}
      </div>
    </>
  )
}
