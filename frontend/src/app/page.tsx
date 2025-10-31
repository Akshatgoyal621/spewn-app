"use client";
import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "@/lib/auth-client";

/**
 * Helper: set a client-side fallback cookie for token (not httpOnly).
 * We keep it short-lived (session cookie) so it's only around while the tab is open.
 * Avoids using localStorage (per request).
 */
function setClientTokenCookie(token: string | null) {
  if (!token) return;
  const isLocal =
    typeof window !== "undefined" && window.location.hostname === "localhost";
  const secure = !isLocal;
  const cookie = `spewn_client_token=${encodeURIComponent(
    token
  )}; path=/; samesite=lax${secure ? "; secure" : ""}`;
  try {
    document.cookie = cookie;
  } catch (e) {
    // ignore
  }
}

function getClientTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)spewn_client_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/* Simple inline spinner used in buttons */
function ButtonSpinner({className = "h-4 w-4"}: {className?: string}) {
  return (
    <svg
      className={`${className} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        opacity="0.25"
      />
      <path
        d="M22 12a10 10 0 00-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Default-exported page component (explicitly typed so Next recognizes it)
 */
export default function LoginPage() {
  const {user, fetchMe, loading: authLoading} = useAuth();
  const router = useRouter();

  // Auto-redirect if already authenticated (auth check finished and user exists)
  useEffect(() => {
    if (!authLoading && user) {
      // decide: consider profile "complete" when salary exists and splits sum to 100
      const salaryOk = Number(user.salary) > 0;
      const splits = (user.splits as Record<string, number>) || {};
      const splitsSum = Object.values(splits).reduce(
        (a: number, b: any) => a + Number(b || 0),
        0
      );
      const profileComplete = salaryOk && splitsSum === 100;
      if (profileComplete) {
        router.replace("/dashboard");
      } else {
        router.replace("/onboarding");
      }
    }
    // we only want to react to authLoading/user changes
  }, [authLoading, user, router]);

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [fpEmail, setFpEmail] = useState("");
  const [fpMessage, setFpMessage] = useState("");
  const [fpToken, setFpToken] = useState("");
  const [fpNewPassword, setFpNewPassword] = useState("");
  const [fpStage, setFpStage] = useState<"request" | "reset">("request");

  const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

  // local submitting flag (separate from authLoading)
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const path = isRegister ? "/api/auth/register" : "/api/auth/login";
      const body: any = {email, password};
      if (isRegister) body.name = name;
      if (!isRegister) body.rememberMe = rememberMe;

      // 1) Try cookie + JSON token response flow
      const res = await fetch(`${BACKEND}${path}`, {
        method: "POST",
        credentials: "include", // important for httpOnly cookie
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Error");

      // Server returned token in JSON (useful as fallback)
      const token = json?.user?.token;
      if (token) {
        // Save fallback in a client cookie (session cookie). Avoid localStorage per request.
        try {
          setClientTokenCookie(token);
        } catch {}
      }

      // Ask auth context to refresh (it may rely on cookies)
      try {
        if (typeof fetchMe === "function") await fetchMe();
      } catch (e) {
        // ignore — we'll attempt /me directly below
      }

      // 2) fetch /api/auth/me via cookie first
      let meRes = await fetch(`${BACKEND}/api/auth/me`, {
        credentials: "include",
      });

      // 3) If server cookie is blocked (iOS/WKWebView), retry with bearer token fallback
      if (!meRes.ok) {
        const fallbackToken = token || getClientTokenFromCookie();
        if (fallbackToken) {
          meRes = await fetch(`${BACKEND}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${fallbackToken}`,
              "Content-Type": "application/json",
            },
          });
        }
      }

      if (!meRes.ok) {
        // safe fallback routing if /me still fails: send to onboarding as a sensible default
        router.replace("/onboarding");
        return;
      }

      const me = await meRes.json();

      // decide: consider profile "complete" when salary exists and splits sum to 100
      const salaryOk = Number(me.salary) > 0;
      const splits = me.splits || {};
      const splitsSum = Object.values(splits).reduce(
        (a: any, b: any) => a + Number(b || 0),
        0
      );
      const profileComplete = salaryOk && splitsSum === 100;

      if (profileComplete) {
        router.replace("/dashboard");
      } else {
        router.replace("/onboarding");
      }
    } catch (e: any) {
      setErr(e?.message || "Error");
    } finally {
      setSubmitting(false);
    }
  }

  // Forgot password request
  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setFpMessage("");
    try {
      const res = await fetch(`${BACKEND}/api/auth/forgot-password`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({email: fpEmail}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || "Error");
      setFpMessage(
        "If account exists, reset instructions generated. (Check server console in dev.)"
      );
      setFpStage("reset");
    } catch (err: any) {
      setFpMessage(err.message || "Error");
    }
  }

  // Use the token printed on the server (dev) to reset
  async function doReset(e: React.FormEvent) {
    e.preventDefault();
    setFpMessage("");
    try {
      const res = await fetch(`${BACKEND}/api/auth/reset-password`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({token: fpToken, newPassword: fpNewPassword}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || "Error");
      setFpMessage(
        "Password reset successful — you can now login with new password."
      );
      setShowForgot(false);
      setFpStage("request");
      setFpEmail("");
      setFpToken("");
      setFpNewPassword("");
    } catch (err: any) {
      setFpMessage(err.message || "Error");
    }
  }

  function openGoogle() {
    // opens backend google auth endpoint which will redirect to Google
    window.location.href = `${BACKEND}/api/auth/google`;
  }

  const disabled = authLoading || submitting;

  return (
    <main className="py-12" style={{marginTop:"130px"}}>
      <section className="bg-white rounded-2xl shadow p-8 max-w-md mx-auto">
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => setIsRegister(false)}
            className={`px-4 py-2 rounded ${
              !isRegister ? "bg-teal-500 text-white" : "bg-slate-100"
            }`}
            disabled={disabled}
          >
            {!authLoading && submitting && !isRegister ? (
              <span className="inline-flex items-center gap-2">
                <ButtonSpinner className="h-4 w-4" /> Login
              </span>
            ) : (
              "Login"
            )}
          </button>
          <button
            onClick={() => setIsRegister(true)}
            className={`px-4 py-2 rounded ${
              isRegister ? "bg-teal-500 text-white" : "bg-slate-100"
            }`}
            disabled={disabled}
          >
            {!authLoading && submitting && isRegister ? (
              <span className="inline-flex items-center gap-2">
                <ButtonSpinner className="h-4 w-4" /> Register
              </span>
            ) : (
              "Register"
            )}
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-3">
          {isRegister && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="p-3 rounded border"
              disabled={disabled}
            />
          )}
          <input
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="p-3 rounded border"
            disabled={disabled}
          />
          <div className="relative">
            <input
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type={showPassword ? "text" : "password"}
              className="p-3 rounded border w-full"
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            className="right-2 top-2 text-sm text-slate-500"
            disabled={disabled}
          >
            {showPassword ? "Hide Password" : "Show Password"}
          </button>

          {!isRegister && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={disabled}
              />
              Remember me
            </label>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              className="bg-teal-500 text-white py-2 px-4 rounded inline-flex items-center gap-2"
              disabled={disabled}
            >
              {(authLoading || submitting) && (
                <ButtonSpinner className="h-4 w-4 text-white" />
              )}
              <span>{isRegister ? "Register" : "Login"}</span>
            </button>
            <button
              type="button"
              onClick={() => openGoogle()}
              className="px-4 py-2 rounded border flex-1"
              disabled={disabled}
            >
              Sign in with Google
            </button>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="text-sm text-slate-500"
              disabled={disabled}
            >
              Forgot password?
            </button>
            {err && <div className="text-sm text-red-500">{err}</div>}
          </div>
        </form>
      </section>

      {/* Forgot Password Modal (simple) */}
      {showForgot && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white p-6 rounded shadow max-w-md w-full">
            <h3 className="text-lg font-semibold">Forgot password</h3>
            {fpStage === "request" ? (
              <form onSubmit={requestReset} className="mt-4 grid gap-2">
                <input
                  required
                  value={fpEmail}
                  onChange={(e) => setFpEmail(e.target.value)}
                  placeholder="Your email"
                  className="p-2 border rounded"
                />
                <div className="flex gap-2">
                  <button
                    className="px-3 py-2 bg-teal-500 text-white rounded"
                    disabled={authLoading}
                  >
                    Send reset token
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForgot(false)}
                    className="px-3 py-2 bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                </div>
                {fpMessage && (
                  <div className="text-sm mt-2 text-slate-600">{fpMessage}</div>
                )}
              </form>
            ) : (
              <form onSubmit={doReset} className="mt-4 grid gap-2">
                <input
                  required
                  value={fpToken}
                  onChange={(e) => setFpToken(e.target.value)}
                  placeholder="Token (from server console in dev)"
                  className="p-2 border rounded"
                />
                <input
                  required
                  value={fpNewPassword}
                  onChange={(e) => setFpNewPassword(e.target.value)}
                  placeholder="New password"
                  className="p-2 border rounded"
                />
                <div className="flex gap-2">
                  <button className="px-3 py-2 bg-teal-500 text-white rounded">
                    Reset password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFpStage("request");
                      setFpMessage("");
                    }}
                    className="px-3 py-2 bg-slate-100 rounded"
                  >
                    Back
                  </button>
                </div>
                {fpMessage && (
                  <div className="text-sm mt-2 text-slate-600">{fpMessage}</div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
