"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

function suggestionsForPath(pathname: string): string[] {
  if (pathname.startsWith("/campaign-tester")) {
    return [
      "What order do the campaign tester modules go in?",
      "What is the difference between brief and ICP steps?",
      "When is Claude / Anthropic used?",
    ];
  }
  if (pathname.startsWith("/contacts")) {
    return [
      "How do filters work on this page?",
      "How do I export CSV?",
      "Can the AI bar set filters for me?",
    ];
  }
  if (pathname.startsWith("/clients")) {
    return [
      "What API keys do I put on a client?",
      "Where does nightly sync get its data?",
    ];
  }
  if (pathname.startsWith("/chat")) {
    return [
      "What can I ask the AI analyst?",
      "Does this use live warehouse data?",
    ];
  }
  return [
    "What should I do first as a new user?",
    "How do clients, sync, and contacts fit together?",
    "Where do Calendly webhooks go?",
  ];
}

export default function GuideChatWidget() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = suggestionsForPath(pathname);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      const next: Msg[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setInput("");
      setLoading(true);
      try {
        const res = await fetch("/api/guide-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, pathname }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setMessages([...next, { role: "assistant", content: data.response || "(no reply)" }]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Request failed";
        setError(msg);
        setMessages((prev) => (prev.length > 0 && prev[prev.length - 1]?.role === "user" ? prev.slice(0, -1) : prev));
        setInput(trimmed);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, pathname]
  );

  return (
    <>
      {!open && (
        <button
          type="button"
          className="guide-chat-fab"
          aria-label="Open platform guide chat"
          title="Platform guide"
          onClick={() => setOpen(true)}
        >
          <span className="guide-chat-fab-icon" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 10h.01M12 10h.01M16 10h.01" strokeLinecap="round" />
            </svg>
          </span>
          <span className="guide-chat-fab-label">Guide</span>
        </button>
      )}

      {open && (
        <div className="guide-chat-backdrop" role="presentation" onClick={() => setOpen(false)} />
      )}

      <aside
        className={`guide-chat-panel${open ? " guide-chat-panel-open" : ""}`}
        aria-hidden={!open}
      >
        <div className="guide-chat-head">
          <div>
            <div className="guide-chat-head-title">Platform guide</div>
            <div className="guide-chat-head-sub">
              Answers use the in-app knowledge base (like RAG). Not live warehouse numbers—use{" "}
              <strong>AI analyst</strong> for data.
            </div>
          </div>
          <button
            type="button"
            className="guide-chat-close"
            onClick={() => setOpen(false)}
            aria-label="Close guide"
          >
            ×
          </button>
        </div>

        <div className="guide-chat-path">
          <span className="guide-chat-path-label">You are here</span>
          <code>{pathname}</code>
        </div>

        <div className="guide-chat-suggestions">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className="guide-chip"
              onClick={() => send(s)}
              disabled={loading}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="guide-chat-messages" ref={scrollRef}>
          {messages.length === 0 && (
            <p className="guide-chat-empty">
              Ask how anything works, or tap a suggested question. I stay within this product’s documented behavior.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`guide-chat-msg guide-chat-msg-${m.role}`}>
              {m.role === "assistant" ? (
                <div className="guide-md">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p>{m.content}</p>
              )}
            </div>
          ))}
          {loading && <div className="guide-chat-loading">Thinking…</div>}
        </div>

        {error && <div className="guide-chat-error">{error}</div>}

        <form
          className="guide-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask what to do next…"
            rows={2}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <div className="guide-chat-form-row">
            <button type="button" className="btn" onClick={() => setMessages([])} disabled={loading}>
              Clear
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Send
            </button>
          </div>
        </form>
      </aside>
    </>
  );
}
