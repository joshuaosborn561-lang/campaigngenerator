"use client";

import { Suspense, useState, useRef, useEffect, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { ContactsWorkspace } from "@/components/contacts-workspace";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "What subject lines have the highest reply rates for MSP clients?",
  "Which offer type converts best across all campaigns?",
  "Show me the top 10 campaigns by reply rate with at least 500 sends",
  "What copy patterns show up in campaigns with over 5% reply rates?",
  "How many meetings have we booked this quarter by industry?",
];

type AnalystTab = "ask" | "contacts";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const initialTab: AnalystTab = viewParam === "contacts" ? "contacts" : "ask";
  const [tab, setTab] = useState<AnalystTab>(initialTab);

  useEffect(() => {
    setTab(viewParam === "contacts" ? "contacts" : "ask");
  }, [viewParam]);

  function setAnalystTab(next: AnalystTab) {
    setTab(next);
    const qs = new URLSearchParams(searchParams.toString());
    if (next === "contacts") qs.set("view", "contacts");
    else qs.delete("view");
    const s = qs.toString();
    router.replace(s ? `/chat?${s}` : "/chat");
  }

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError("");
    const next: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMessages([...next, { role: "assistant", content: data.response || "(no response)" }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get response";
      setError(msg);
      setMessages(messages);
      setInput(trimmed);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function reset() {
    setMessages([]);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  if (tab === "contacts") {
    return (
      <ContactsWorkspace
        sidebarActive="chat"
        basePath="/chat"
        onBackToAsk={() => setAnalystTab("ask")}
      />
    );
  }

  return (
    <div className="app-layout">
      <AppSidebar active="chat" />

      <div className="content-area">
        <div className="top-bar" style={{ flexWrap: "wrap", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>AI Analyst</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              Ask Gemini about campaigns — or open <strong>Prospects</strong> to search people synced from SmartLead & HeyReach
            </p>
          </div>
          <div className="analyst-tabs" role="tablist" aria-label="AI Analyst sections">
            <button
              type="button"
              role="tab"
              aria-selected
              className="analyst-tab analyst-tab-active"
              onClick={() => setAnalystTab("ask")}
            >
              Ask
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={false}
              className="analyst-tab"
              onClick={() => setAnalystTab("contacts")}
            >
              Prospects
            </button>
          </div>
          {messages.length > 0 && (
            <button onClick={reset} className="btn" style={{ fontSize: 12 }}>
              New conversation
            </button>
          )}
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 0",
          }}
        >
          <div style={{ maxWidth: 820, margin: "0 auto", padding: "0 24px" }}>
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", marginTop: 48 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                    marginBottom: 16,
                  }}
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                  Ask about your campaign data
                </h2>
                <p style={{ margin: "0 0 24px", fontSize: 13, color: "var(--text-muted)" }}>
                  Gemini has access to campaigns, sequences, leads, and contacts. It queries Supabase live.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 8,
                    maxWidth: 560,
                    margin: "0 auto",
                  }}
                >
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        textAlign: "left",
                        padding: "12px 16px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} role={m.role} content={m.content} />
            ))}

            {loading && (
              <div style={{ padding: "16px 0", display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--accent-light)",
                    color: "var(--accent)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  AI
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 6 }}>
                  <span className="thinking-dot" />
                  <span className="thinking-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="thinking-dot" style={{ animationDelay: "0.3s" }} />
                  <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 6 }}>
                    Querying Supabase...
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "var(--red-bg)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  borderRadius: 6,
                  color: "var(--red)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "16px 24px",
            background: "var(--bg-primary)",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              maxWidth: 820,
              margin: "0 auto",
              display: "flex",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about subject lines, offer types, reply rates, meetings booked..."
              disabled={loading}
              rows={1}
              style={{
                flex: 1,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 14px",
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "inherit",
                resize: "none",
                minHeight: 44,
                maxHeight: 200,
                outline: "none",
              }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, 200) + "px";
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="btn btn-primary"
              style={{
                padding: "12px 18px",
                fontSize: 14,
              }}
            >
              Send
            </button>
          </form>
          <div style={{ maxWidth: 820, margin: "8px auto 0", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
            Press <kbd style={{ background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>Enter</kbd> to send,{" "}
            <kbd style={{ background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3, fontSize: 10 }}>Shift+Enter</kbd> for newline
          </div>
        </div>
      </div>

      <style jsx>{`
        .thinking-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--text-muted);
          display: inline-block;
          animation: bounce 1s infinite ease-in-out;
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="app-layout">
          <AppSidebar active="chat" />
          <div className="content-area" style={{ padding: 24 }}>
            <p style={{ color: "var(--text-muted)" }}>Loading…</p>
          </div>
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        padding: "16px 0",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: isUser ? "var(--bg-tertiary)" : "var(--accent-light)",
          color: isUser ? "var(--text-secondary)" : "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {isUser ? "You" : "AI"}
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          lineHeight: 1.65,
          color: "var(--text-primary)",
          paddingTop: 4,
        }}
        className="chat-md"
      >
        {isUser ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{content}</div>
        ) : (
          <ReactMarkdown>{content}</ReactMarkdown>
        )}
      </div>
      <style jsx global>{`
        .chat-md p { margin: 0 0 10px; }
        .chat-md p:last-child { margin-bottom: 0; }
        .chat-md ul, .chat-md ol { margin: 6px 0 10px; padding-left: 22px; }
        .chat-md li { margin-bottom: 4px; }
        .chat-md code {
          background: var(--bg-tertiary);
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 12px;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .chat-md pre {
          background: var(--bg-tertiary);
          padding: 12px 14px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 8px 0 12px;
        }
        .chat-md pre code {
          background: none;
          padding: 0;
          font-size: 12px;
        }
        .chat-md h1, .chat-md h2, .chat-md h3 {
          margin: 14px 0 8px;
          font-weight: 600;
        }
        .chat-md h1 { font-size: 16px; }
        .chat-md h2 { font-size: 15px; }
        .chat-md h3 { font-size: 14px; }
        .chat-md table {
          border-collapse: collapse;
          margin: 8px 0;
          font-size: 12px;
        }
        .chat-md th, .chat-md td {
          border: 1px solid var(--border);
          padding: 6px 10px;
          text-align: left;
        }
        .chat-md th { background: var(--bg-secondary); font-weight: 600; }
        .chat-md strong { color: var(--text-primary); font-weight: 600; }
        .chat-md a { color: var(--accent); text-decoration: underline; }
      `}</style>
    </div>
  );
}
