"use client";

import React, {useEffect, useState, useCallback, useRef} from "react";
import {useRouter, usePathname} from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {useAuth} from "../lib/auth-client";

/**
 * Header — updated:
 *  - logo 40x20
 *  - 'Profile' replaced with 'Dashboard'
 *  - primary button routes based on onboarding state:
 *      * not onboarded -> /onboarding
 *      * onboarded -> /dashboard
 *  - white background, teal accents, responsive, accessible
 */

export default function Header() {
  const {user, fetchMe} = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  // local display email to avoid showing stale email after logout until fetchMe resolves
  const [displayEmail, setDisplayEmail] = useState<string | undefined>(
    user?.email
  );
  const [authLoading, setAuthLoading] = useState(false);

  // account dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDisplayEmail(user?.email);
  }, [user?.email]);

  // hide mobile menu when path changes
  useEffect(() => setMobileOpen(false), [pathname]);

  // Use server-provided onboarding flag. Backend uses `onboardComplete` per your API.
  const onboardComplete = Boolean((user as any)?.onboardComplete);

  // Primary label: show Dashboard when onboardComplete, otherwise "Get started"
  const primaryLabel = onboardComplete ? "Dashboard" : "Get started";

  // navigate primary action:
  // - if not onboarded -> /onboarding
  // - if onboarded -> /dashboard
  const onPrimaryClick = useCallback(
    (e?: React.MouseEvent) => {
      e?.preventDefault();
      setMobileOpen(false);
      if (!user) {
        // If unauthenticated, push to public home /login (or home)
        router.push("/");
        return;
      }
      if (onboardComplete) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    },
    [onboardComplete, router, user]
  );

  // logout
  async function onLogout() {
    try {
      setDropdownOpen(false);
      setMobileOpen(false);
      setDisplayEmail(undefined);
      setAuthLoading(true);

      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (typeof fetchMe === "function") {
        await fetchMe().catch(() => {});
      }

      try {
        (router as any).refresh?.();
      } catch {}

      // after logout send user to login
      router.push("/");
    } catch (err) {
      console.error("Logout failed:", err);
      if (typeof fetchMe === "function") fetchMe().catch(() => {});
      router.push("/");
    } finally {
      setAuthLoading(false);
    }
  }

  // close dropdown on outside click / Escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node))
        setDropdownOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDropdownOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function avatarInitials() {
    const name = (user?.name || displayEmail || "").trim();
    if (!name) return "S";
    const parts = name.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  // skeleton placeholders
  const SkeletonAvatar = () => (
    <span className="inline-block w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
  );
  const SkeletonText = ({width = "w-24"}: {width?: string}) => (
    <span
      className={`inline-block h-3 rounded bg-slate-200 animate-pulse ${width}`}
    />
  );

  return (
    <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-slate-200">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        {/* top row */}
        <div className="flex h-16 items-center justify-between">
          {/* brand */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={onboardComplete ? "/dashboard" : "/onboarding"}
              className="inline-flex items-center gap-3"
              aria-label="SPEWN Home"
            >
              {/* logo 40x20 */}
              <div className="">
                <Image
                  src="/spewn-logo-main.png"
                  alt="SPEWN"
                  width={100}
                  height={20}
                  priority
                />
              </div>
            </Link>
          </div>

          {/* desktop nav */}
          <nav className="hidden md:flex items-center gap-4">
            {user ? (
              <button
                onClick={onPrimaryClick}
                className="px-4 py-2 rounded-md bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
                title={
                  onboardComplete ? "Open dashboard" : "Complete onboarding"
                }
              >
                {primaryLabel}
              </button>
            ) : (
              <Link
                href="/"
                className="px-4 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-900 transition focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                Sign in
              </Link>
            )}

            {authLoading ? (
              <div className="flex items-center gap-3">
                <SkeletonAvatar />
                <div className="flex flex-col gap-1">
                  <SkeletonText width="w-28" />
                  <SkeletonText width="w-16" />
                </div>
              </div>
            ) : user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={dropdownOpen}
                  className="inline-flex items-center gap-3 px-3 py-1 rounded-md hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-medium">
                    {avatarInitials()}
                  </div>
                  <div className="min-w-0 text-left">
                    <div
                      className="text-sm font-medium text-slate-800 truncate"
                      title={displayEmail}
                    >
                      {displayEmail ?? "Account"}
                    </div>
                    <div className="text-xs text-slate-500">View</div>
                  </div>
                </button>

                {/* dropdown */}
                {dropdownOpen && (
                  <div
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-md shadow-lg py-1 z-50"
                  >
                    <Link
                      href="/settings"
                      className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                      onClick={() => setDropdownOpen(false)}
                    >
                      Settings
                    </Link>
                    <div className="border-t my-1" />
                    <button
                      onClick={onLogout}
                      className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                      role="menuitem"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </nav>

          {/* mobile hamburger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex items-center justify-center rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
              aria-controls="mobile-menu"
              aria-expanded={mobileOpen}
              aria-label="Toggle menu"
            >
              <svg
                className={`h-6 w-6 transition-opacity ${
                  mobileOpen ? "opacity-0" : "opacity-100"
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden={!mobileOpen}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
                />
              </svg>
              <svg
                className={`absolute h-6 w-6 transition-opacity ${
                  mobileOpen ? "opacity-100" : "opacity-0"
                }`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden={mobileOpen}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div
          id="mobile-menu"
          className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-300 ${
            mobileOpen ? "max-h-[420px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="py-3 border-t px-3">
            {user ? (
              <button
                onClick={onPrimaryClick}
                className="w-full text-left px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 font-semibold text-slate-800"
              >
                {primaryLabel}
              </button>
            ) : (
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className="mt-3 block w-full text-center px-4 py-2 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-900"
              >
                Sign in
              </Link>
            )}

            {authLoading ? (
              <div className="mt-3 flex items-center gap-3">
                <SkeletonAvatar />
                <div className="flex flex-col gap-1">
                  <SkeletonText width="w-24" />
                  <SkeletonText width="w-16" />
                </div>
              </div>
            ) : user ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-semibold">
                    {avatarInitials()}
                  </div>
                  <div className="min-w-0">
                    <div
                      className="truncate text-sm font-medium text-slate-800"
                      title={displayEmail}
                    >
                      {displayEmail ?? "Account"}
                    </div>
                    <div className="text-xs text-slate-500">View</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={onLogout}
                    className="px-3 py-1 rounded-md bg-rose-50 text-rose-600 hover:bg-rose-100"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : null}

            {/* optional links */}

            <div className="mt-4 grid gap-2 text-sm">
              <Link
                href="/settings"
                className="block px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                role="menuitem"
                onClick={() => setDropdownOpen(false)}
              >
                Settings
              </Link>
              <div className="border-t my-1" />
              {/* <Link
                href="/about"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded hover:bg-slate-50"
              >
                About
              </Link>
              <Link
                href="/help"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded hover:bg-slate-50"
              >
                Help
              </Link>
              <Link
                href="/terms"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded hover:bg-slate-50"
              >
                Terms
              </Link> */}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
