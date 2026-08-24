// 日期工具
export function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export function prettyDate(d = new Date()) {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`
}

export function weekOfMonth(d = new Date()) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  return Math.ceil((d.getDate() + first.getDay()) / 7)
}

export function monthMatrix(year, month) {
  const first = new Date(year, month, 1)
  const startDay = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
