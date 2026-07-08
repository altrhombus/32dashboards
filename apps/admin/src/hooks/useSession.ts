import { useEffect, useState } from "react";
import { checkSession } from "../lib/apiClient.js";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

export function useSession(): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    checkSession().then((ok) => {
      if (!cancelled) setStatus(ok ? "authenticated" : "unauthenticated");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
