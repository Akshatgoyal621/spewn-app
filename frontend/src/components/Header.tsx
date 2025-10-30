'use client'
import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../lib/auth-client'

export default function Header() {
  const { user, fetchMe } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || '/'

  async function onLogout() {
    await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    })
    await fetchMe()
    router.push('/')
  }

  // Determine the single visible tab label based on current route
  // - If on /dashboard => show "Dashboard"
  // - If on /onboarding or landing (/) => show "Home"
  // - Else show "Home" as a sensible default
  const onDashboard = pathname.startsWith('/dashboard')
  const onOnboarding = pathname === '/' || pathname.startsWith('/onboarding')

  // Label to display (only one)
  const tabLabel = onDashboard ? 'Dashboard' : (onOnboarding ? 'Home' : 'Home')

  // Clicking the tab toggles to the other main page (if allowed)
  function onTabClick(e: React.MouseEvent) {
    e.preventDefault()
    if (!user) {
      // unauthenticated: send to landing/sign-in
      router.push('/')
      return
    }
 
  }

  return (
    <header className="flex items-center justify-between py-4 border-b mb-6">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-xl font-bold text-slate-800 hover:text-teal-600" style={{color:"#00bba7"}}>
          SPEWN
        </Link>
        <div className="text-xs text-slate-500">Salary sorted, mind at ease.</div>
      </div>

      <nav className="flex items-center gap-4">
        {/* Single tab (only visible when user is authenticated) */}
        {user ? (
          <a
            href={tabLabel === 'Dashboard' ? '/dashboard' : '/onboarding'}
            onClick={onTabClick}
            className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200 font-semibold"
            title={`Go to ${tabLabel === 'Dashboard' ? 'Onboarding (edit)' : 'Dashboard'}`}
          >
            {tabLabel}
          </a>
        ) : null}

        {/* Spacer / user area */}
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-sm text-slate-600">{user.email}</div>
            <button
              onClick={onLogout}
              className="bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100"
            >
              Logout
            </button>
          </div>
        ) : (
          <Link href="/" className="px-4 py-2 rounded bg-slate-100 hover:bg-slate-200">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  )
}
