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

const CHECK_KEYS = ['thermo', 'headlines', 'selftest', 'eventlog', 'weekend']
const CHECK_LABELS = {
  thermo: '扫 8 温度计，定 risk-on / off',
  headlines: '抓当日 1–3 条头条，定位驱动',
  selftest: '跑 3 问自测，写一句结论',
  eventlog: '记入事件日志（30 秒）',
  weekend: '周末回看本周日志，找模式'
}

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

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const uid = user.id
    // 操盘记录
    let { data: d } = await supabase.from('trading').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!d) { const { data: nd } = await supabase.from('trading').insert({ user_id: uid, date: today }).select().single(); d = nd }
    setRec(d)
    const { data: h } = await supabase.from('trading').select('date,operations,review').eq('user_id', uid).order('date', { ascending: false }).limit(10)
    setHistory(h || [])

    // 宏观每日
    let { data: m } = await supabase.from('macro_daily').select('*').eq('user_id', uid).eq('date', today).maybeSingle()
    if (!m) { const { data: nm } = await supabase.from('macro_daily').insert({ user_id: uid, date: today }).select().single(); m = nm }
    setMacro(m)
    const { data: ev } = await supabase.from('macro_events').select('*').eq('user_id', uid).order('date', { ascending: false }).limit(50)
    setEvents(ev || [])
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
    await supabase.from('macro_daily').update({ [field]: value }).eq('id', macro.id)
  }
  function toggleCheck(key) {
    const cur = (macro.checklist && typeof macro.checklist === 'object') ? macro.checklist : {}
    saveMacro('checklist', { ...cur, [key]: !cur[key] })
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

  return (
    <>
      <TopBar title="操盘" right={<span className="tag">{weekOfMonth()}周</span>} />
      <div className="page theme-trade">

        {/* ============ 宏观速读手册 ============ */}
        <div className="card washi tint">
          <h3>🌐 宏观速读手册</h3>
          <p className="sub" style={{ marginTop: -4 }}>盘前 30 秒定性风险情绪 → 定位驱动 → 跑 3 问</p>
        </div>

        {/* 8 温度计（静态参考） */}
        <details className="card tint">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>🌡️ 一、每日必扫：8 个全球温度计</summary>
          <p className="sub" style={{ marginTop: 6 }}>看盘面不是看涨跌，是看风险情绪坐标。</p>
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
        </details>

        {/* 事件→资产传导表（静态参考） */}
        <details className="card tint">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>🔗 二、事件 → 资产传导表</summary>
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
        </details>

        {/* 3 问自测（可保存） */}
        <div className="card tint">
          <h3>🧭 三、3 问自测（每天）</h3>
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

        {/* 事件日志（可保存 + 回看） */}
        <div className="card tint">
          <h3>📓 四、事件日志</h3>
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

        {/* 案例 + 信息源（静态参考） */}
        <details className="card tint">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>📚 五、案例拆解 / 信息源分层</summary>
          <p className="sub" style={{ marginTop: 6, fontWeight: 700 }}>案例：美日股市急速下跌的三种剧本</p>
          <p className="sub">1. <b>套息交易平仓</b>（2024/8/5）：BOJ 加息→日元急升→全球借日元买股资金平仓→VIX 飙 38→风险资产跟跌。看到「日经 -12%」，3 秒跑出「日元→套息→系统性」链。</p>
          <p className="sub">2. <b>衰退交易</b>：非农爆冷、PMI 破荣枯线→押注美联储落后曲线→成长股杀估值。</p>
          <p className="sub">3. <b>关税冲击</b>（2025/4）：全球 risk-off，出口链与周期股最惨。</p>
          <p className="sub" style={{ marginTop: 8, fontWeight: 700 }}>信息源分层</p>
          <p className="sub">快讯：金十数据、华尔街见闻、财联社、选股宝</p>
          <p className="sub">深度：财新、21 世纪经济报道、FT 中文、Bloomberg、Reuters</p>
          <p className="sub">数据：FRED、TradingEconomics、腾讯自选股/Tushare/Wind</p>
          <p className="sub">观点：The Kobeissi Letter、Macro Compass、付鹏、管清友</p>
        </details>

        {/* 每日清单打卡（可勾选保存） */}
        <div className="card tint">
          <h3>✅ 六、每日动作清单</h3>
          {CHECK_KEYS.map(k => (
            <div className="check-row" key={k}>
              <input type="checkbox" checked={!!(macro.checklist && macro.checklist[k])} onChange={() => toggleCheck(k)} />
              <span className="label">{CHECK_LABELS[k]}</span>
            </div>
          ))}
        </div>

        {/* ============ 原有操盘功能 ============ */}
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
