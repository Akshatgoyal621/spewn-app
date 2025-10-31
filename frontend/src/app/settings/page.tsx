"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-client";

export default function SettingsPage() {
  const { user, fetchMe } = useAuth();
  const router = useRouter();

  // form state (read-only profile)
  const [name, setName] = useState<string>("");
  const [currency, setCurrency] = useState<string>("INR");
  const [loadingSave, setLoadingSave] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // password change
  const [curPwd, setCurPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdErr, setPwdErr] = useState<string | null>(null);

  // track initial auth-loading so we show skeleton while revalidating
  const [initialLoading, setInitialLoading] = useState(false);

  // On mount: if user is `undefined` we attempt to revalidate via fetchMe()
  useEffect(() => {
    let mounted = true;
    async function ensureAuth() {
      if (typeof user === "undefined") {
        setInitialLoading(true);
        try {
          if (typeof fetchMe === "function") {
            await fetchMe();
          }
        } catch (e) {
          // ignore; fetchMe may throw for unauthenticated state
        } finally {
          if (mounted) setInitialLoading(false);
        }
      }
    }
    ensureAuth();
    return () => {
      mounted = false;
    };
    // intentionally run only on mount & when `user` is undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NOTE: removed redirect logic. We intentionally do NOT redirect if user === null.
  // This keeps the page on /settings across reloads regardless of auth state.

  // keep form values synced when user becomes available
  useEffect(() => {
    if (user && typeof user !== "undefined") {
      setName(user.name ?? "");
      setCurrency(user.currency ?? "INR");
    } else if (user === null) {
      // explicit unauthenticated: clear values
      setName("");
      setCurrency("INR");
    }
  }, [user]);

  // (Optional) If you ever want to re-enable editing later, restore this handler.
  async function handleSaveProfile(e?: React.FormEvent) {
    e?.preventDefault();
    setMsg(null);
    setErr(null);

    if (!name.trim()) {
      setErr("Please enter your name.");
      return;
    }

    setLoadingSave(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), currency }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: "Failed to save" }));
        throw new Error(j.message || "Failed to save profile");
      }
      if (typeof fetchMe === "function") await fetchMe();
      setMsg("Profile saved.");
    } catch (err: any) {
      console.error("save profile error", err);
      setErr(err?.message || "Failed to save profile");
    } finally {
      setLoadingSave(false);
    }
  }

  async function handleChangePassword(e?: React.FormEvent) {
    e?.preventDefault();
    setPwdMsg(null);
    setPwdErr(null);

    if (!curPwd || !newPwd) {
      setPwdErr("Enter current and new password.");
      return;
    }
    if (newPwd.length < 6) {
      setPwdErr("New password must be at least 6 characters.");
      return;
    }

    setChangingPwd(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });

      if (res.status === 404) {
        setPwdErr(
          "Password-change endpoint not implemented server-side. Use Forgot password flow or add POST /api/auth/change-password to backend."
        );
        return;
      }

      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: "Failed to change password" }));
        throw new Error(j.message || "Failed to change password");
      }

      setPwdMsg("Password changed successfully.");
      setCurPwd("");
      setNewPwd("");
    } catch (err: any) {
      console.error("change password error", err);
      setPwdErr(err?.message || "Failed to change password");
    } finally {
      setChangingPwd(false);
    }
  }

  // Render a loading skeleton while we're revalidating auth
  if (initialLoading || typeof user === "undefined") {
    return (
      <main className="py-8 px-4 lg:px-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm animate-pulse">
            <div className="h-6 bg-slate-200 rounded w-48 mb-4" />
            <div className="h-40 bg-slate-100 rounded" />
          </div>
        </div>
      </main>
    );
  }

  // Page remains on /settings even if user === null
  return (
    <main className="py-8 px-4 lg:px-12">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Profile (read-only) */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
              <p className="text-sm text-slate-600 mt-1">Profile (read-only) and change password.</p>
            </div>

            <div>
              <button onClick={() => router.push("/dashboard")} className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-sm">
                Back to dashboard
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <div className="text-sm text-slate-600">Full name</div>
              <input
                value={name}
                disabled
                onChange={(e) => setName(e.target.value)}
                className="w-full mt-1 p-2 border rounded bg-slate-50"
                placeholder="Your full name"
              />
            </label>

            <label className="block">
              <div className="text-sm text-slate-600">Email</div>
              <input value={user?.email ?? ""} disabled className="w-full mt-1 p-2 border rounded bg-slate-50" />
              <div className="text-xs text-slate-400 mt-1">Email and Name changes require verification and are disabled for now.</div>
            </label>

            {err && <div className="text-sm text-rose-600">{err}</div>}
            {msg && <div className="text-sm text-teal-600">{msg}</div>}
          </div>
        </div>

        {/* Password change */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Change password</h2>
          <p className="text-sm text-slate-600 mt-1">If you know your current password you can change it here. If you forgot it, use "Forgot password" flow.</p>

          {/* If user is not authenticated, disable the change-password form and show a hint */}
          {user === null && (
            <div className="mt-3 text-sm text-slate-500">
              You are not logged in. Sign in to change your password.
            </div>
          )}

          <form onSubmit={handleChangePassword} className="mt-4 grid gap-3">
            <label>
              <div className="text-sm text-slate-600">Current password</div>
              <input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} className="w-full mt-1 p-2 border rounded" disabled={user === null} />
            </label>

            <label>
              <div className="text-sm text-slate-600">New password</div>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full mt-1 p-2 border rounded" disabled={user === null} />
            </label>

            {pwdErr && <div className="text-sm text-rose-600">{pwdErr}</div>}
            {pwdMsg && <div className="text-sm text-teal-600">{pwdMsg}</div>}

            <div className="flex gap-3">
              <button disabled={changingPwd || user === null} type="submit" className="px-4 py-2 bg-teal-600 text-white rounded disabled:opacity-60">
                {changingPwd ? "Changing…" : "Change password"}
              </button>
              <button type="button" onClick={() => { setCurPwd(""); setNewPwd(""); setPwdErr(null); setPwdMsg(null); }} className="px-4 py-2 rounded bg-slate-100" disabled={user === null}>
                Reset
              </button>
            </div>

            <div className="text-xs text-slate-500">
              Please note: This settings page is still under development.
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
