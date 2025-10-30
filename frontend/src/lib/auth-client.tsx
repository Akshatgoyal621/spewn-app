'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'

type User = any

const AuthContext = createContext({
  user: null as User | null,
  loading: true,
  fetchMe: async () => {}
})

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchMe() {
    setLoading(true)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/me`, { credentials: 'include' })
      if (!res.ok) { setUser(null); setLoading(false); return }
      const body = await res.json()
      setUser(body)
    } catch {
      setUser(null)
    } finally { setLoading(false) }
  }

  useEffect(()=>{ fetchMe() }, [])

  return (
    <AuthContext.Provider value={{ user, loading, fetchMe }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
