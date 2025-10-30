'use client'
import { ReactNode, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth-client'

export default function ProtectedClient({ children }: { children: ReactNode }) {
  const { user, loading, fetchMe } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    (async()=>{ await fetchMe(); setChecked(true) })()
  }, [fetchMe])

  if (!checked || loading) return <div className="p-6">Checking auth...</div>
  if (!user) return <div className="p-6">Redirecting…</div>
  return <>{children}</>
}
