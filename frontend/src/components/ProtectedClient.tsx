// components/ProtectedClient.tsx
"use client";
import {ReactNode, useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import { useAuth } from "@/lib/auth-client";

export default function ProtectedClient({children}: {children: ReactNode}) {
  const {user, loading, fetchMe} = useAuth();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await fetchMe();
      } finally {
        setChecked(true);
      }
    })();
  }, [fetchMe]);

  // show checking state while verifying or fetching
  if (!checked || loading) return <div className="p-6">Checking auth...</div>;

  // if not authenticated redirect to login
  if (!user) {
    router.push("/");
    return <div className="p-6">Redirecting…</div>;
  }

  return <>{children}</>;
}
