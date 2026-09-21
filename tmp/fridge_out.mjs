import { createClient } from "@supabase/supabase-js";
const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const DEEPSEEK = process.env.DEEPSEEK_API_KEY;
function client(token) {
  return createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
}
const CN_NUM = { "\u4E00": 1, "\u4E24": 2, "\u4E8C": 2, "\u4E09": 3, "\u56DB": 4, "\u4E94": 5, "\u516D": 6, "\u4E03": 7, "\u516B": 8, "\u4E5D": 9, "\u5341": 10 };
function parseQtyUnit(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(个|盒|袋|公斤|kg|斤|瓶|罐|包|根|颗|只|块|枚)?/i);
  if (m) return { quantity: parseFloat(m[1]), unit: m[2] || "" };
  const cm = text.match(/(一|两|二|三|四|五|六|七|八|九|十)\s*(个|盒|袋|公斤|kg|斤|瓶|罐|包|根|颗|只|块|枚)?/);
  if (cm) return { quantity: CN_NUM[cm[1]] || 1, unit: cm[2] || "" };
  return { quantity: null, unit: "" };
}
function ruleIntent(message) {
  const t = message;
  const has = (...kw) => kw.some((k) => t.includes(k));
  if (has("\u5403\u4E86", "\u7528\u4E86", "\u6D88\u8017", "\u53BB\u6389", "\u6254", "\u4E22", "\u5220", "\u6CA1\u4E86", "\u6CA1\u6709")) return "remove";
  if (has("\u6539", "\u66F4\u65B0", "\u8BBE\u7F6E", "\u4FDD\u8D28\u671F")) return "update";
  if (has("\u4E70\u4E86", "\u52A0\u4E86", "\u8FDB\u8D27", "\u91C7\u8D2D", "\u6DFB", "\u8865\u8D27", "\u8865")) return "add";
  if (has("\u51B0\u7BB1", "\u5E93\u5B58")) return "query";
  return "chat";
}
function regexExtract(message) {
  const { quantity, unit } = parseQtyUnit(message);
  let name = "";
  const verbs = ["\u4E70\u4E86", "\u52A0\u4E86", "\u8FDB\u8D27", "\u91C7\u8D2D", "\u6DFB", "\u8865", "\u5403\u4E86", "\u7528\u4E86", "\u6D88\u8017", "\u53BB\u6389", "\u6254", "\u4E22", "\u5220"];
  for (const v of verbs) {
    const idx = message.indexOf(v);
    if (idx >= 0) {
      name = message.slice(idx + v.length).trim();
      break;
    }
  }
  if (!name) {
    const idx = message.indexOf("\u51B0\u7BB1");
    if (idx >= 0) {
      name = message.slice(idx + 2);
      for (const p of ["\u91CC", "\u4E2D", "\u5185"]) if (name.startsWith(p)) name = name.slice(p.length);
      for (const p of ["\u8FD8\u6709", "\u6709", "\u5269"]) if (name.startsWith(p)) name = name.slice(p.length);
    }
  }
  name = name.trim();
  const tailUnits = ["\u516C\u65A4", "kg", "\u65A4", "\u4E2A", "\u76D2", "\u888B", "\u74F6", "\u7F50", "\u5305", "\u6839", "\u9897", "\u53EA", "\u5757", "\u679A", "\u5565", "\u4EC0\u4E48", "\u54EA\u4E9B"];
  for (const u of tailUnits) if (name.endsWith(u)) name = name.slice(0, name.length - u.length);
  return { name: name.trim(), quantity, unit, category: "", expiry: "" };
}
async function extractFields(message) {
  const base = regexExtract(message);
  if (!DEEPSEEK || DEEPSEEK.includes("your-")) return base;
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "\u62BD\u53D6\u51B0\u7BB1\u5E93\u5B58\u8BED\u53E5\u7684\u5B57\u6BB5\uFF0C\u53EA\u8FD4\u56DE JSON\uFF1Aname(\u7269\u54C1\u540D),quantity(\u6570\u5B57),unit(\u5355\u4F4D),category(\u5206\u7C7B),expiry(YYYY-MM-DD)\u3002\u4E0D\u542B\u5219\u4E0D\u586B\u3002" },
          { role: "user", content: message }
        ]
      })
    });
    const j = await r.json();
    const o = JSON.parse(j?.choices?.[0]?.message?.content || "{}");
    return {
      name: o.name || base.name,
      quantity: o.quantity != null ? Number(o.quantity) : base.quantity,
      unit: o.unit || base.unit,
      category: o.category || base.category,
      expiry: o.expiry || base.expiry
    };
  } catch {
    return base;
  }
}
async function classifyIntent(message) {
  const intent = ruleIntent(message);
  if (intent === "chat") return { intent: "chat" };
  const f = await extractFields(message);
  return { intent, ...f };
}
function normalizeName(name) {
  return (name || "").trim().replace(/[\s]+/g, "");
}
function today() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
async function listItems(sb, userId, name) {
  let q = sb.from("fridge").select("*").eq("user_id", userId).order("category");
  if (name) q = q.ilike("name", `%${name}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}
async function ensureItem(sb, userId, name) {
  const { data } = await sb.from("fridge").select("*").eq("user_id", userId).ilike("name", name).maybeSingle();
  return data;
}
async function handleAdd(sb, userId, intent) {
  const name = normalizeName(intent.name);
  if (!name) return { handled: true, reply: '\u8BF7\u544A\u8BC9\u6211\u4E70\u4E86\u4EC0\u4E48\uFF0C\u6BD4\u5982"\u4E70\u4E86\u4E24\u76D2\u9E21\u86CB"\u3002' };
  const qty = intent.quantity == null || isNaN(intent.quantity) ? 1 : intent.quantity;
  const unit = intent.unit || "\u4E2A";
  const category = intent.category || "\u5176\u4ED6";
  const existing = await ensureItem(sb, userId, name);
  if (existing) {
    const newQty = Number(existing.quantity) + qty;
    const patch = { quantity: newQty, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
    if (intent.unit) patch.unit = unit;
    if (intent.category) patch.category = category;
    if (intent.expiry) patch.expiry = intent.expiry;
    const { error: error2 } = await sb.from("fridge").update(patch).eq("id", existing.id);
    if (error2) throw error2;
    return { handled: true, reply: `\u2705 ${name} \u5DF2\u66F4\u65B0\uFF1A\u73B0\u6709 ${newQty}${unit}\u3002` };
  }
  const insert = { user_id: userId, name, quantity: qty, unit, category };
  if (intent.expiry) insert.expiry = intent.expiry;
  const { data, error } = await sb.from("fridge").insert(insert).select().single();
  if (error) throw error;
  return { handled: true, reply: `\u2705 \u5DF2\u8BB0\u5F55\uFF1A${name} +${qty}${unit}\u3002` };
}
async function handleRemove(sb, userId, intent) {
  const name = normalizeName(intent.name);
  if (!name) return { handled: true, reply: '\u8BF7\u544A\u8BC9\u6211\u5403\u4E86/\u7528\u4E86\u4EC0\u4E48\uFF0C\u6BD4\u5982"\u5403\u4E863\u4E2A\u82F9\u679C"\u3002' };
  const existing = await ensureItem(sb, userId, name);
  if (!existing) return { handled: true, reply: `\u{1F4DD} \u51B0\u7BB1\u91CC\u8FD8\u6CA1\u6709\u300C${name}\u300D\u3002` };
  const qty = intent.quantity == null || isNaN(intent.quantity) ? Number(existing.quantity) : intent.quantity;
  const newQty = Number(existing.quantity) - qty;
  if (newQty <= 0) {
    const { error: error2 } = await sb.from("fridge").delete().eq("id", existing.id);
    if (error2) throw error2;
    return { handled: true, reply: `\u2705 ${name} \u5DF2\u7528\u5B8C\uFF08${existing.quantity}${existing.unit}\uFF09\uFF0C\u5DF2\u4ECE\u51B0\u7BB1\u79FB\u9664\u3002` };
  }
  const { error } = await sb.from("fridge").update({ quantity: newQty, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", existing.id);
  if (error) throw error;
  return { handled: true, reply: `\u2705 ${name} \u5DF2\u6D88\u8017 ${qty}${existing.unit}\uFF0C\u5269\u4F59 ${newQty}${existing.unit}\u3002` };
}
async function handleUpdate(sb, userId, intent) {
  const name = normalizeName(intent.name);
  if (!name) return { handled: true, reply: '\u8BF7\u544A\u8BC9\u6211\u6539\u4EC0\u4E48\uFF0C\u6BD4\u5982"\u725B\u5976\u4FDD\u8D28\u671F\u6539\u62102026-09-10"\u3002' };
  const existing = await ensureItem(sb, userId, name);
  if (!existing) return { handled: true, reply: `\u{1F4DD} \u51B0\u7BB1\u91CC\u8FD8\u6CA1\u6709\u300C${name}\u300D\uFF0C\u53EF\u4EE5\u5148"\u4E70\u4E86${name}"\u3002` };
  const patch = { updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  if (intent.quantity != null && !isNaN(intent.quantity)) patch.quantity = Number(intent.quantity);
  if (intent.unit) patch.unit = intent.unit;
  if (intent.category) patch.category = intent.category;
  if (intent.expiry) patch.expiry = intent.expiry;
  const { error } = await sb.from("fridge").update(patch).eq("id", existing.id);
  if (error) throw error;
  return { handled: true, reply: `\u2705 ${name} \u5DF2\u66F4\u65B0\u3002` };
}
async function handleQuery(sb, userId, intent) {
  const name = normalizeName(intent.name);
  const items = await listItems(sb, userId, name);
  if (!items.length) {
    return { handled: true, reply: name ? `\u{1F4DD} \u51B0\u7BB1\u91CC\u6CA1\u627E\u5230\u300C${name}\u300D\u3002` : "\u{1F4DD} \u51B0\u7BB1\u76EE\u524D\u662F\u7A7A\u7684\u3002" };
  }
  const lines = items.map((i) => {
    let s = `\u2022 ${i.name}\uFF1A${i.quantity}${i.unit || "\u4E2A"}`;
    if (i.category) s += `\uFF08${i.category}\uFF09`;
    if (i.expiry) {
      const days = Math.ceil((new Date(i.expiry) - new Date(today())) / 864e5);
      s += days < 0 ? ` \u26A0\uFE0F\u8FC7\u671F${Math.abs(days)}\u5929` : days <= 3 ? ` \u5269${days}\u5929` : ` \u4FDD\u8D28\u671F\u81F3${i.expiry}`;
    }
    return s;
  });
  return { handled: true, reply: `\u{1F9CA} \u51B0\u7BB1\u5E93\u5B58\uFF1A
${lines.join("\n")}` };
}
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const auth = req.headers["authorization"];
  if (!auth) return res.status(401).json({ error: "\u672A\u6388\u6743" });
  if (!URL || !ANON) return res.status(500).json({ error: "\u670D\u52A1\u7AEF\u73AF\u5883\u53D8\u91CF SUPABASE_URL / SUPABASE_ANON_KEY \u672A\u914D\u7F6E" });
  const token = auth.replace("Bearer ", "");
  const sb = client(token);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "\u767B\u5F55\u5931\u6548" });
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message \u4E0D\u80FD\u4E3A\u7A7A" });
  try {
    const intent = await classifyIntent(message);
    if (intent.intent === "chat") return res.json({ handled: false });
    let result;
    if (intent.intent === "add") result = await handleAdd(sb, user.id, intent);
    else if (intent.intent === "remove") result = await handleRemove(sb, user.id, intent);
    else if (intent.intent === "update") result = await handleUpdate(sb, user.id, intent);
    else if (intent.intent === "query") result = await handleQuery(sb, user.id, intent);
    else result = { handled: false };
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e?.message || "\u51B0\u7BB1\u5E93\u5B58\u64CD\u4F5C\u5931\u8D25" });
  }
}
export {
  handler as default
};
