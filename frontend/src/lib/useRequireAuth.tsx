// lib/useRequireAuth.tsx
// Small hook to require authentication in a client component/page.
// It will wait for the auth context to settle and, if not authenticated, optionally
// call fetchMe() once and redirect to `redirectTo`.

import {useEffect} from "react";
import {useRouter} from "next/navigation";
import {useAuth} from "./auth-client";

type UseRequireAuthOpts = {
  redirectTo?: string; // default "/"
  // if true (default) it'll attempt a single fetchMe() when unauthenticated to refresh state
  tryFetchMe?: boolean;
};

export function useRequireAuth(opts?: UseRequireAuthOpts) {
  const {redirectTo = "/", tryFetchMe = true} = opts || {};
  const {user, loading, fetchMe} = useAuth();
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    // Wait until auth finishes loading; if no user, try to refresh once (optional), then redirect.
    async function ensureAuth() {
      if (loading) return; // wait
      if (user) return; // already authenticated

      // If user is null and we should try to refresh, attempt a single fetchMe()
      if (tryFetchMe && typeof fetchMe === "function") {
        try {
          const refreshed = await fetchMe();
          if (refreshed) return; // now authenticated
        } catch (err) {
          // ignore refresh error
        }
      }

      // still not authenticated -> redirect
      if (mounted) {
        router.replace(redirectTo);
      }
    }

    ensureAuth();

    return () => {
      mounted = false;
    };
  }, [loading, user, fetchMe, router, redirectTo, tryFetchMe]);

  // Nothing to return; it's a side-effect hook. Use `useAuth()` in the component to read loading/user.
}
