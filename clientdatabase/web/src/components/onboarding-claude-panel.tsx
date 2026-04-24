"use client";

import { useCallback, useState } from "react";

export type OnboardingClaudeMode = "icp" | "lanes" | "offers";

type Msg = { role: "user" | "assistant"; content: string };

const STARTS: Record<OnboardingClaudeMode, string> = {
  icp: "Help me nail the decision maker and economic buyer for this client. Ask me questions and suggest titles/functions to target. I want to agree on a clear ICP hypothesis we can use in campaigns.",
  lanes: "I need 2–4 ICP segments (firmographics: company size, industry, geo, and how titles differ per segment). Propose a first pass from the website and context; I'll say what to merge, cut, or rewrite until we're happy.",
  offers: "I need about 15 offer angles (hooks, value props, risk-reversal, proof). Propose a first pass. I'll give feedback: what to keep, drop, or merge. We'll iterate until I say to save all 15.",
};

type Props = {
  strategyId: string;
  mode: OnboardingClaudeMode;
  title: string;
  help: string;
  onApplyText?: (text: string) => void;
  applyLabel?: string;
  onFinalized?: () => void;
  /** Lanes + offers: label for the "save to DB" button. Omit for ICP (no finalize). */
  finalizeLabel?: string;
  /** When true, "Save to database" replaces existing lanes/offers for this strategy */
  replaceOnFinalize?: boolean;
};

export default function OnboardingClaudePanel({
  strategyId,
  mode,
  title,
  help,
  onApplyText,
  applyLabel = "Use latest reply in wizard",
  onFinalized,
  finalizeLabel = "Save to database",
  replaceOnFinalize = true,
}: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const postChat = useCallback(
    async (nextMessages: Msg[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/onboarding-claude`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, messages: nextMessages }),
        });
        const d = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok) throw new Error(d.error ?? "Request failed");
        const reply = d.reply?.trim() ?? "";
        if (!reply) throw new Error("Empty reply");
        return reply;
      } finally {
        setLoading(false);
      }
    },
    [strategyId, mode]
  );

  function start() {
    const u: Msg = { role: "user", content: STARTS[mode] };
    setMessages([u]);
    setError(null);
    void (async () => {
      try {
        const reply = await postChat([u]);
        setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
        setMessages([]);
      }
    })();
  }

  async function send() {
    const t = input.trim();
    if (!t || loading) return;
    const soFar = messages;
    if (soFar.length === 0) {
      setError("Use “Start” first.");
      return;
    }
    const userMsg: Msg = { role: "user", content: t };
    const next = [...soFar, userMsg];
    setMessages(next);
    setInput("");
    try {
      const reply = await postChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function finalize() {
    if (messages.length === 0) return;
    setFinalizeLoading(true);
    setError(null);
    setSaveHint(null);
    try {
      const finMode = mode === "lanes" ? "finalize_lanes" : "finalize_offers";
      const res = await fetch(`/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/onboarding-claude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: finMode,
          messages,
          replace: replaceOnFinalize,
        }),
      });
      const d = (await res.json()) as {
        ok?: boolean;
        error?: string;
        saved_lanes?: number;
        saved_offers?: number;
        offer_count?: number;
        expected_fifteen?: boolean;
        hint?: string | null;
      };
      if (!res.ok) throw new Error(d.error ?? "Save failed");
      if (mode === "lanes" && d.saved_lanes != null) {
        setSaveHint(`Saved ${d.saved_lanes} ICP segment(s) to this strategy.`);
      }
      if (mode === "offers" && d.saved_offers != null) {
        setSaveHint(
          `Saved ${d.saved_offers} offer angle(s).` +
            (d.expected_fifteen && d.hint ? ` ${d.hint}` : "")
        );
      }
      onFinalized?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setFinalizeLoading(false);
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="onb-claude-panel">
      <h3 className="onb-claude-title">{title}</h3>
      <p className="ct-wizard-help" style={{ marginBottom: 10 }}>
        {help}
      </p>
      {error && <div className="ct-alert ct-alert-block" style={{ marginBottom: 10 }}>{error}</div>}
      {saveHint && <div className="ct-alert ct-alert-info" style={{ marginBottom: 10 }}>{saveHint}</div>}

      {messages.length === 0 ? (
        <div className="onb-claude-start">
          <button type="button" className="btn btn-primary" onClick={start} disabled={loading || !strategyId}>
            {loading ? "Starting…" : "Start with Claude"}
          </button>
          <p className="onb-light-fineprint" style={{ marginTop: 8 }}>
            Opens a back-and-forth. Your API uses server-side <strong>Anthropic</strong> (same as the rest of this app).
          </p>
        </div>
      ) : (
        <>
          <div className="onb-claude-thread" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={i}
                className={"onb-claude-bubble" + (m.role === "user" ? " onb-claude-bubble--user" : " onb-claude-bubble--asst")}
              >
                <div className="onb-claude-bubble-label">{m.role === "user" ? "You" : "Claude"}</div>
                <div className="onb-claude-bubble-text">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="onb-claude-bubble onb-claude-bubble--asst">
                <div className="onb-claude-bubble-text onb-claude-typing">Claude is replying…</div>
              </div>
            )}
          </div>
          <div className="onb-claude-composer">
            <textarea
              className="ct-textarea onb-claude-input"
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder="Type a reply… (Ctrl/Cmd+Enter to send)"
              disabled={loading}
            />
            <div className="onb-claude-actions">
              <button type="button" className="btn btn-primary" onClick={() => void send()} disabled={loading || !input.trim()}>
                Send
              </button>
            </div>
          </div>
          <div className="onb-claude-foot">
            {onApplyText && lastAssistant && mode === "icp" && (
              <button
                type="button"
                className="btn"
                onClick={() => onApplyText(lastAssistant.content)}
                disabled={loading}
              >
                {applyLabel}
              </button>
            )}
            {mode === "lanes" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void finalize()}
                disabled={loading || finalizeLoading}
              >
                {finalizeLoading ? "Saving…" : finalizeLabel}
              </button>
            )}
            {mode === "offers" && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void finalize()}
                disabled={loading || finalizeLoading}
              >
                {finalizeLoading ? "Saving…" : finalizeLabel}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
