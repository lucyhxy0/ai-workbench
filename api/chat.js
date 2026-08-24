// api/chat.js — DeepSeek 对话代理（流式）
// 前端以 fetch 读取流式 text 响应
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })

  const { messages, model = 'deepseek-chat' } = req.body || {}
  if (!messages?.length) return res.status(400).json({ error: 'messages 不能为空' })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey.includes('your-')) return res.status(500).json({ error: '未配置 DEEPSEEK_API_KEY' })

  try {
    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 })
    })
    if (!upstream.ok) {
      const t = await upstream.text()
      return res.status(502).json({ error: 'DeepSeek 错误: ' + t })
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    const reader = upstream.body.getReader()
    const dec = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = dec.decode(value)
      for (const line of chunk.split('\n')) {
        const s = line.trim()
        if (!s.startsWith('data:') || s.includes('[DONE]')) continue
        try {
          const json = JSON.parse(s.slice(5).trim())
          const c = json.choices?.[0]?.delta?.content
          if (c) res.write(c)
        } catch {}
      }
    }
    res.end()
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
