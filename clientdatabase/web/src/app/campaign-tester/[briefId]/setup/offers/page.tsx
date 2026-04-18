"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { SetupNav } from "@/components/campaign-tester/SetupNav";
import type {
  BriefRecord,
  Offer,
  OfferConversationMessage,
} from "@/lib/campaign-tester/brief-types";

const MIN_APPROVED_TO_UNLOCK = 3;

export default function OffersModulePage() {
  const { briefId } = useParams<{ briefId: string }>();
  const router = useRouter();

  const [brief, setBrief] = useState<BriefRecord | null>(null);
  const [pool, setPool] = useState<Offer[]>([]);
  const [messages, setMessages] = useState<OfferConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [briefRes, offersRes] = await Promise.all([
        fetch(`/api/campaign-tester/briefs/${briefId}`),
        fetch(`/api/campaign-tester/briefs/${briefId}/offers`),
      ]);
      const briefData = await briefRes.json();
      const offersData = await offersRes.json();
      if (!briefRes.ok) throw new Error(briefData.error ?? "Failed to load brief");
      if (!offersRes.ok) throw new Error(offersData.error ?? "Failed to load offers");
      setBrief(briefData.brief as BriefRecord);
      setPool((offersData.offer_pool ?? []) as Offer[]);
      setMessages(
        (offersData.conversation?.messages ?? []) as OfferConversationMessage[],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module");
    } finally {
      setLoading(false);
    }
  }, [briefId]);

  useEffect(() => {
    if (briefId) void reload();
  }, [briefId, reload]);

  // Scroll chat to bottom when new messages arrive.
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages.length]);

  async function generateInitial() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/campaign-tester/briefs/${briefId}/offers`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setPool(data.offer_pool as Offer[]);
      setMessages([data.assistant_message as OfferConversationMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function sendChat() {
    if (!input.trim()) return;
    const content = input.trim();
    setInput("");
    setError(null);
    setRefining(true);

    // Optimistically append user turn.
    const userTurn: OfferConversationMessage = {
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userTurn]);

    try {
      const res = await fetch(
        `/api/campaign-tester/briefs/${briefId}/offers/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refinement failed");
      setPool(data.offer_pool as Offer[]);
      setMessages((data.messages ?? []) as OfferConversationMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refinement failed");
      // Roll back the optimistic user turn so the user can retry.
      setMessages((prev) => prev.filter((m) => m !== userTurn));
      setInput(content);
    } finally {
      setRefining(false);
    }
  }

  async function toggleApprove(offerId: string, next: boolean) {
    setError(null);
    // Optimistic update.
    setPool((prev) => prev.map((o) => (o.id === offerId ? { ...o, approved: next } : o)));
    try {
      const res = await fetch(
        `/api/campaign-tester/briefs/${briefId}/offers/approve`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer_id: offerId, approved: next }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Approval failed");
      setPool(data.offer_pool as Offer[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      // Roll back.
      setPool((prev) =>
        prev.map((o) => (o.id === offerId ? { ...o, approved: !next } : o)),
      );
    }
  }

  const approvedCount = useMemo(() => pool.filter((o) => o.approved).length, [pool]);
  const ready = approvedCount >= MIN_APPROVED_TO_UNLOCK;

  async function finishModule() {
    if (!ready) {
      setError(`Approve at least ${MIN_APPROVED_TO_UNLOCK} offers to unlock testing.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const p = await fetch(`/api/campaign-tester/briefs/${briefId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module: "module_4_offers", complete: true }),
      });
      const pdata = await p.json();
      if (!p.ok) throw new Error(pdata.error ?? "Failed to mark module complete");
      router.push(`/campaign-tester/${briefId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !brief) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="skeleton" style={{ width: "40%", height: 20 }} />
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="app-layout">
        <AppSidebar active="tester" />
        <div className="ct-shell">
          <div className="ct-header">
            <h1>Brief not found</h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <AppSidebar active="tester" />
      <div className="ct-shell">
        <div className="ct-crumbs">
          <Link href="/campaign-tester">Campaign Tester</Link> /{" "}
          <Link href={`/campaign-tester/${briefId}`}>{brief.name}</Link> / Module 4
        </div>
        <div className="ct-header">
          <h1>Module 4 · Offer generation</h1>
          <div className="ct-sub">
            Claude generates 10 offer ideas grounded in the brief. Chat with it to reshape the pool.
            Approve at least {MIN_APPROVED_TO_UNLOCK} — those become the variants Test 2 runs.
          </div>
        </div>

        <SetupNav briefId={briefId} progress={brief.progress} current="module_4_offers" />

        {pool.length === 0 ? (
          <div className="ct-card">
            <h2>Generate the initial pool</h2>
            <div className="ct-card-sub">
              Claude will produce exactly 10 ranked offers using the brief as grounding. You can
              regenerate from scratch at any time.
            </div>
            <button
              className="btn btn-primary"
              onClick={generateInitial}
              disabled={generating}
              style={{ marginTop: 8 }}
            >
              {generating ? "Generating…" : "Generate 10 offers"}
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(360px, 1fr) 1.35fr",
              gap: 16,
              alignItems: "start",
            }}
          >
            {/* Chat column */}
            <div
              className="ct-card"
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 520,
                maxHeight: "72vh",
              }}
            >
              <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Refinement chat</span>
                <button
                  className="btn"
                  onClick={generateInitial}
                  disabled={generating || refining}
                  style={{ fontSize: 11 }}
                  title="Throw away the current pool and generate fresh 10"
                >
                  {generating ? "Regenerating…" : "Regenerate from scratch"}
                </button>
              </h2>
              <div
                ref={chatRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "8px 0",
                }}
              >
                {messages.map((m, i) => (
                  <ChatBubble key={i} m={m} />
                ))}
                {refining && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      background: "var(--bg-tertiary)",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      alignSelf: "flex-start",
                      maxWidth: "90%",
                    }}
                  >
                    Thinking…
                  </div>
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  marginTop: 8,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 8,
                }}
              >
                <textarea
                  className="ct-textarea"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ditch #3. Give me 2 more that lean on pay-per-meeting. Make #7 sharper…"
                  rows={2}
                  style={{ flex: 1, minHeight: 40 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendChat}
                  disabled={refining || !input.trim()}
                  style={{ alignSelf: "flex-end" }}
                >
                  {refining ? "…" : "Send"}
                </button>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                ⌘/Ctrl-Enter to send.
              </div>
            </div>

            {/* Offers column */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  <strong
                    style={{
                      color: ready ? "var(--green)" : "var(--text-primary)",
                    }}
                  >
                    {approvedCount}/{pool.length}
                  </strong>{" "}
                  approved
                  {!ready && (
                    <span>
                      {" "}
                      — approve at least {MIN_APPROVED_TO_UNLOCK} to unlock Test 2
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {[...pool]
                  .sort((a, b) => a.rank - b.rank)
                  .map((o) => (
                    <OfferCard
                      key={o.id}
                      offer={o}
                      onToggle={(next) => toggleApprove(o.id, next)}
                    />
                  ))}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="ct-alert ct-alert-block" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="ct-actions">
          <Link className="btn" href={`/campaign-tester/${briefId}/setup/icp`}>
            ← Back to Module 3
          </Link>
          <button
            className="btn btn-primary"
            onClick={finishModule}
            disabled={saving || !ready}
            title={ready ? "" : `Approve at least ${MIN_APPROVED_TO_UNLOCK} offers first`}
          >
            {saving ? "Saving…" : "Save & unlock Module 5 →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: OfferConversationMessage }) {
  const isUser = m.role === "user";
  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "92%",
        background: isUser ? "var(--accent-light)" : "var(--bg-tertiary)",
        color: "var(--text-primary)",
        border: `1px solid ${isUser ? "var(--accent)" : "var(--border)"}`,
        padding: "8px 10px",
        borderRadius: "var(--radius-sm)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "var(--text-muted)",
          marginBottom: 2,
        }}
      >
        {isUser ? "You" : "Claude"}
      </div>
      <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{m.content}</div>
    </div>
  );
}

function OfferCard({
  offer,
  onToggle,
}: {
  offer: Offer;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      className="ct-card"
      style={{
        padding: 12,
        borderColor: offer.approved ? "var(--accent)" : "var(--border)",
        background: offer.approved ? "var(--accent-light)" : "var(--bg-secondary)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="ct-chip">#{offer.rank}</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{offer.name}</span>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: offer.approved ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={offer.approved}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {offer.approved ? "Approved" : "Approve"}
        </label>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
        {offer.one_liner}
      </div>
      <div
        style={{
          fontSize: 11,
          padding: "6px 8px",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            color: "var(--text-muted)",
            marginRight: 6,
          }}
        >
          CTA
        </span>
        {offer.cta}
      </div>
      {offer.rationale && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            fontStyle: "italic",
            color: "var(--text-muted)",
          }}
        >
          {offer.rationale}
        </div>
      )}
    </div>
  );
}
