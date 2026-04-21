"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * /contacts is merged into AI Analyst. Preserve query params (e.g. client_id).
 */
function RedirectToAnalystContacts() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", "contacts");
    router.replace(`/chat?${next.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="app-layout" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
      <p style={{ color: "var(--text-muted)" }}>Opening prospects…</p>
    </div>
  );
}

export default function ContactsPage() {
  return (
    <Suspense
      fallback={
        <div className="app-layout" style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
          <p style={{ color: "var(--text-muted)" }}>Loading…</p>
        </div>
      }
    >
      <RedirectToAnalystContacts />
    </Suspense>
  );
}
