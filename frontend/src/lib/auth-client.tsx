// lib/auth-client.tsx
"use client";
import React, { createContext, useContext, useEffect, useState } from "react";

type UserShape = {
  id: string;
  email: string;
  name?: string;
  salary?: number;
  splits?: Record<string, number>;
  distribution?: Record<string, number>;
};

type AuthContextShape = {
  user: UserShape | null;
  isLoading: boolean;
  fetchMe: () => Promise<UserShape | null>;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<any>;
  register: (name: string, email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextShape | undefined>(undefined);

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "";

/**
 * Client cookie helpers (fallback token cookie, not httpOnly)
 * We avoid localStorage per your request.
 */
function setClientTokenCookie(token: string | null) {
  if (typeof document === "undefined") return;
  const name = "spewn_client_token";
  if (!token) {
    // clear cookie
    document.cookie = `${name}=; path=/; Max-Age=0; samesite=lax`;
    return;
  }
  const isLocal = typeof window !== "undefined" && window.location.hostname === "localhost";
  const secure = !isLocal;
  // session cookie (no Max-Age) so it clears when session ends
  document.cookie = `${name}=${encodeURIComponent(token)}; path=/; samesite=lax${secure ? "; secure" : ""}`;
}

function getClientTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)spewn_client_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * fetchWithTimeout: small helper to avoid hanging requests in some environments.
 */
async function fetchWithTimeout(input: RequestInfo, init?: RequestInit, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * AuthProvider (default export) and useAuth hook (named export)
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserShape | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  async function fetchMe(): Promise<UserShape | null> {
    setIsLoading(true);
    try {
      // 1) Try cookie-based /me
      try {
        const res = await fetchWithTimeout(`${BACKEND}/api/auth/me`, {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        }, 10000);

        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setIsLoading(false);
          return data;
        }
      } catch (err) {
        // cookie attempt failed (network/cors or cookie blocked)
      }

      // 2) Try bearer token fallback using client cookie
      const token = getClientTokenFromCookie();
      if (token) {
        try {
          const res2 = await fetchWithTimeout(`${BACKEND}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
          }, 10000);

          if (res2.ok) {
            const data2 = await res2.json();
            setUser(data2);
            setIsLoading(false);
            return data2;
          } else {
            // invalid token -> erase fallback cookie
            setClientTokenCookie(null);
          }
        } catch (err) {
          // bearer attempt failed
        }
      }

      // no user
      setUser(null);
      setIsLoading(false);
      return null;
    } catch (err) {
      setUser(null);
      setIsLoading(false);
      return null;
    }
  }

  async function login(email: string, password: string, rememberMe = false) {
    const res = await fetchWithTimeout(`${BACKEND}/api/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, rememberMe }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || `Login failed (${res.status})`);
    }

    const token = json?.user?.token;
    if (token) setClientTokenCookie(token);

    await fetchMe();
    return json;
  }

  async function register(name: string, email: string, password: string) {
    const res = await fetchWithTimeout(`${BACKEND}/api/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || `Register failed (${res.status})`);
    }

    const token = json?.user?.token;
    if (token) setClientTokenCookie(token);

    await fetchMe();
    return json;
  }

  async function logout() {
    try {
      await fetchWithTimeout(`${BACKEND}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => null);
    } catch (err) {
      // ignore
    } finally {
      setClientTokenCookie(null);
      setUser(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await fetchMe();
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payload: AuthContextShape = {
    user,
    isLoading,
    fetchMe,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={payload}>{children}</AuthContext.Provider>;
}

/**
 * Named hook: useAuth
 */
export function useAuth(): AuthContextShape {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
