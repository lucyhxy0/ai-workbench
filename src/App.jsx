import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import Login from './pages/Login.jsx'
import Today from './pages/Today.jsx'
import Diet from './pages/Diet.jsx'
import Trading from './pages/Trading.jsx'
import CalendarPage from './pages/Calendar.jsx'
import Chat from './pages/Chat.jsx'
import Settings from './pages/Settings.jsx'
import Inbox from './pages/Inbox.jsx'
import Pet from './pages/Pet.jsx'
import BottomNav from './components/BottomNav.jsx'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="empty">加载中…</div>
  if (!session) return <Login />

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/diet" element={<Diet />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/pet" element={<Pet />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <BottomNav />
    </div>
  )
}
