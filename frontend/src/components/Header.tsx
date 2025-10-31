'use client'
import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../lib/auth-client'

export default function Header() {
  const { user, fetchMe } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || '/'
  const [mobileOpen, setMobileOpen] = useState(false)

  const onDashboard = pathname.startsWith('/dashboard')
  const onOnboarding = pathname === '/' || pathname.startsWith('/onboarding')

  // Label shown in the single “main” tab (we flip to the other on click)
  const tabLabel = onDashboard ? 'Dashboard' : 'Home'

  async function onLogout() {
    await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
    await fetchMe()
    router.push('/')
    setMobileOpen(false)
  }

  // Clicking the single tab: toggle to the other primary surface
  function onTabClick(e: React.MouseEvent) {
    e.preventDefault()
    if (!user) {
      router.push('/')
      return
    }
    if (onDashboard) {
      router.push('/onboarding')
    } else {
      router.push('/dashboard')
    }
    setMobileOpen(false)
  }

  // Close mobile menu when the route changes
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-slate-900/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Top row */}
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/"
              className="shrink-0 text-xl font-extrabold tracking-tight text-slate-900 hover:text-teal-600 dark:text-slate-100"
              style={{ color: '#00bba7' }}
              aria-label="SPEWN Home"
            >
              SPEWN
            </Link>
            <span className="hidden sm:block text-xs text-slate-500 dark:text-slate-400 truncate">
              Salary sorted, mind at ease.
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-4">
            {user ? (
              <button
                onClick={onTabClick}
                className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 font-semibold text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 transition"
                title={`Go to ${onDashboard ? 'Onboarding (edit)' : 'Dashboard'}`}
              >
                {tabLabel}
              </button>
            ) : null}

            {user ? (
              <div className="flex items-center gap-3">
                <div
                  className="max-w-[16ch] truncate text-sm text-slate-600 dark:text-slate-300"
                  title={user.email}
                >
                  {user.email}
                </div>
                <button
                  onClick={onLogout}
                  className="bg-red-50 text-red-600 px-3 py-1 rounded-md hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-300 transition"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/"
                className="px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 transition"
              >
                Sign in
              </Link>
            )}
          </nav>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="inline-flex items-center justify-center rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900"
              aria-controls="mobile-menu"
              aria-expanded={mobileOpen}
              aria-label="Toggle menu"
            >
              <svg
                className={`h-6 w-6 ${mobileOpen ? 'hidden' : 'block'}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
              <svg
                className={`h-6 w-6 ${mobileOpen ? 'block' : 'hidden'}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu panel */}
        <div
          id="mobile-menu"
          className={`md:hidden overflow-hidden transition-[max-height] duration-300 ${mobileOpen ? 'max-h-64' : 'max-h-0'}`}
        >
          <div className="py-3 border-t">
            {user ? (
              <button
                onClick={onTabClick}
                className="w-full text-left px-3 py-2 rounded-md bg-slate-100 hover:bg-slate-200 font-semibold text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 transition"
                title={`Go to ${onDashboard ? 'Onboarding (edit)' : 'Dashboard'}`}
              >
                {tabLabel}
              </button>
            ) : null}

            {user ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-sm text-slate-700 dark:text-slate-300"
                    title={user.email}
                  >
                    {user.email}
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="bg-red-50 text-red-600 px-3 py-1 rounded-md hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-300 transition"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="mt-2 block w-full text-center px-4 py-2 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 transition"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
