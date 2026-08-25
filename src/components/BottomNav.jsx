import { NavLink } from 'react-router-dom'

const items = [
  { to: '/', ic: '🏠', label: '今日' },
  { to: '/diet', ic: '🍱', label: '饮食' },
  { to: '/trading', ic: '📈', label: '操盘' },
  { to: '/calendar', ic: '📆', label: '日历' },
  { to: '/inbox', ic: '📥', label: '收藏' },
  { to: '/chat', ic: '💬', label: '对话' }
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map(i => (
        <NavLink key={i.to} to={i.to} end={i.to === '/'}>
          {({ isActive }) => (
            <>
              <span className="ic">{i.ic}</span>
              <span className={isActive ? 'active' : ''} style={{ color: isActive ? 'var(--primary)' : 'var(--text-dim)' }}>{i.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
