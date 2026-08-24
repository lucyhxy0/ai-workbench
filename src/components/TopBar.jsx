import { prettyDate } from '../lib/date.js'

export default function TopBar({ title, right }) {
  return (
    <div className="topbar">
      <h1>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="date">{prettyDate()}</span>
        {right}
      </div>
    </div>
  )
}
