"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /intelligence merged into /chat (Ask + Search prospects = one AI Analyst).
 * Kept for bookmarks; redirects with query preserved.
 */
export default function IntelligenceRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const suffix = qs && qs !== "?" ? qs : "";
    router.replace(`/chat${suffix}`);
  }, [router]);

  return null;
}
