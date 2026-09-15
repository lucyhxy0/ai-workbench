// api/calories.js — 根据三餐/加餐文字估算热量(千卡)
// 采用本地食物热量库 + 关键词匹配，完全离线、不依赖任何外部 API（DeepSeek 挂了也不影响）。
// 输入：{ meals: { breakfast, lunch, dinner, afternoon_tea, drinks } } 各餐文字
// 输出：{ calories: { breakfast, lunch, dinner, afternoon_tea, drinks } } 各餐千卡
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const auth = req.headers['authorization']
  if (!auth) return res.status(401).json({ error: '未授权' })

  const { meals } = req.body || {}
  const fields = ['breakfast', 'lunch', 'dinner', 'afternoon_tea', 'drinks']
  const out = {}
  for (const f of fields) out[f] = estimateText((meals && meals[f]) || '')
  res.json({ calories: out })
}

// [食物名, 每份典型千卡] —— 日常常见食物，覆盖中式/西式/饮品/零食
const FOODS = [
  // 主食
  ['米饭', 230], ['炒饭', 330], ['粥', 70], ['面条', 280], ['米粉', 260], ['馒头', 220],
  ['包子', 200], ['饺子', 50], ['馄饨', 60], ['面包', 120], ['吐司', 120], ['三明治', 300],
  ['燕麦', 150], ['玉米', 110], ['红薯', 130], ['紫薯', 120], ['土豆', 160], ['南瓜', 60],
  ['油条', 270], ['煎饼', 300], ['烧饼', 230], ['汉堡', 500], ['披萨', 260], ['寿司', 200],
  ['凉皮', 200], ['麻辣烫', 350], ['火锅', 500], ['盖浇饭', 500], ['便当', 600],
  // 蛋白类
  ['鸡蛋', 70], ['鸡胸肉', 130], ['鸡腿', 180], ['鸡肉', 150], ['牛肉', 250], ['牛排', 270],
  ['猪肉', 300], ['排骨', 280], ['羊肉', 250], ['鱼肉', 120], ['三文鱼', 200], ['虾', 100],
  ['蟹', 100], ['豆腐', 80], ['豆浆', 50], ['牛奶', 150], ['酸奶', 100], ['奶酪', 120],
  // 蔬果
  ['苹果', 95], ['香蕉', 105], ['橙子', 60], ['橘子', 60], ['葡萄', 70], ['草莓', 30],
  ['西瓜', 30], ['桃子', 40], ['梨', 50], ['猕猴桃', 60], ['蓝莓', 60], ['番茄', 20],
  ['西红柿', 20], ['黄瓜', 15], ['生菜', 15], ['菠菜', 25], ['西兰花', 35], ['胡萝卜', 40],
  ['青菜', 30], ['白菜', 20], ['蘑菇', 25],
  // 饮品 / 零食
  ['咖啡', 5], ['拿铁', 120], ['奶茶', 300], ['可乐', 140], ['雪碧', 140], ['果汁', 120],
  ['啤酒', 150], ['红酒', 120], ['白酒', 240], ['水', 0], ['坚果', 180], ['杏仁', 180],
  ['核桃', 180], ['花生', 280], ['巧克力', 250], ['蛋糕', 350], ['饼干', 100], ['糖果', 50],
  ['冰淇淋', 200], ['沙拉', 80]
]

const CN_COUNT = { 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

// 取食物名前 4 个字内的数量（阿拉伯数字 或 中文数字），默认 1 份
function extractCount(text, idx) {
  const before = text.slice(Math.max(0, idx - 4), idx)
  const m = before.match(/(\d+)\s*(个|杯|碗|片|根|块|份|只|枚|根)?/)
  if (m) return parseInt(m[1], 10) || 1
  for (const [c, n] of Object.entries(CN_COUNT)) if (before.includes(c)) return n
  return 1
}

function estimateText(text) {
  if (!text || !text.trim()) return 0
  let total = 0
  const matched = new Set()
  for (const [name, kcal] of FOODS) {
    let idx = text.indexOf(name)
    while (idx >= 0) {
      if (!matched.has(name)) {
        total += kcal * extractCount(text, idx)
        matched.add(name) // 同一食物名在一段文字里只计一次
      }
      idx = text.indexOf(name, idx + name.length)
    }
  }
  return Math.round(total)
}
