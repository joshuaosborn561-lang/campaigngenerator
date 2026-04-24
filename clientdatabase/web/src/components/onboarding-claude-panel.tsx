"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

export type OnboardingClaudeMode = "icp" | "lanes" | "offers";

type Msg = { role: "user" | "assistant"; content: string };

const STARTS: Record<OnboardingClaudeMode, string> = {
  icp: "Help me nail the decision maker and economic buyer for this client. Ask me questions and suggest titles/functions to target. I want to agree on a clear ICP hypothesis we can use in campaigns.",
  lanes: "I need 2–4 ICP segments (firmographics: company size, industry, geo, and how titles differ per segment). Propose a first pass from the website and context; I'll say what to merge, cut, or rewrite until we're happy.",
  offers: "I need about 15 offer angles (hooks, value props, risk-reversal, proof). Propose a first pass. I'll give feedback: what to keep, drop, or merge. We'll iterate until I say to save all 15.",
};

export type OnboardingClaudeHandle = {
  /** Returns false if save failed (user stays on step). */
  finalize: () => Promise<boolean>;
  isFinalizing: boolean;
  canFinalize: boolean;
};

type Props = {
  strategyId: string;
  mode: OnboardingClaudeMode;
  /**
   * When the assistant sends a new message, optionally sync (e.g. ICP step keeps the hypothesis field aligned with the latest reply).
   */
  onLatestAssistant?: (text: string) => void;
  onFinalized?: () => void;
  /** @default true — no “Start” button; first turn runs when the step opens */
  autoStart?: boolean;
  /**
   * Save buttons live in the main wizard nav (use ref); hide in-panel save row.
   * @default true
   */
  finalizeInWizardNav?: boolean;
};

const OnboardingClaudePanel = forwardRef<OnboardingClaudeHandle, Props>(function OnboardingClaudePanel(
  { strategyId, mode, onLatestAssistant, onFinalized, autoStart = true, finalizeInWizardNav = true },
  ref
) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const startOnce = useRef(false);

  const postChat = useCallback(
    async (nextMessages: Msg[]) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/onboarding-claude`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, messages: nextMessages }),
          }
        );
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

  const doStart = useCallback(() => {
    const u: Msg = { role: "user", content: STARTS[mode] };
    setMessages([u]);
    setError(null);
    void (async () => {
      try {
        const reply = await postChat([u]);
        setMessages([u, { role: "assistant", content: reply }]);
        onLatestAssistant?.(reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
        setMessages([]);
      }
    })();
  }, [mode, onLatestAssistant, postChat]);

  // Auto-open the conversation when you land on the step (this IS the step — no “Start” screen)
  useEffect(() => {
    if (!autoStart || !strategyId) return;
    if (startOnce.current) return;
    startOnce.current = true;
    doStart();
  }, [autoStart, strategyId, doStart]);

  // Reset when strategy or mode identity changes (parent should key the component)
  useEffect(() => {
    return () => {
      startOnce.current = false;
    };
  }, []);

  const runFinalize = useCallback(async (): Promise<boolean> => {
    if (messages.length === 0) return true;
    setFinalizeLoading(true);
    setError(null);
    setSaveHint(null);
    try {
      const finMode = mode === "lanes" ? "finalize_lanes" : "finalize_offers";
      const res = await fetch(
        `/api/campaign-tester/strategies/${encodeURIComponent(strategyId)}/onboarding-claude`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: finMode,
            messages,
            replace: true,
          }),
        }
      );
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
        setSaveHint(`Saved ${d.saved_lanes} ICP segment(s).`);
      }
      if (mode === "offers" && d.saved_offers != null) {
        setSaveHint(
          `Saved ${d.saved_offers} offer angle(s).` + (d.expected_fifteen && d.hint ? ` ${d.hint}` : "")
        );
      }
      onFinalized?.();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setFinalizeLoading(false);
    }
  }, [messages, mode, onFinalized, strategyId]);

  useImperativeHandle(
    ref,
    () => ({
      finalize: runFinalize,
      isFinalizing: finalizeLoading,
      canFinalize: messages.length > 0,
    }),
    [runFinalize, finalizeLoading, messages.length]
  );

  async function send() {
    const t = input.trim();
    if (!t || loading) return;
    if (messages.length === 0) {
      setError("Conversation is still loading. Try again in a moment.");
      return;
    }
    const userMsg: Msg = { role: "user", content: t };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    try {
      const reply = await postChat(next);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      onLatestAssistant?.(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <div className="onb-claude-inline">
      {error && <div className="ct-alert ct-alert-block" style={{ marginBottom: 10 }}>{error}</div>}
      {saveHint && <div className="ct-alert ct-alert-info" style={{ marginBottom: 10 }}>{saveHint}</div>}

      <div className="onb-claude-thread" aria-live="polite">
        {messages.length === 0 && loading && (
          <div className="onb-claude-bubble onb-claude-bubble--asst">
            <div className="onb-claude-bubble-text onb-claude-typing">Loading your strategist…</div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={"onb-claude-bubble" + (m.role === "user" ? " onb-claude-bubble--user" : " onb-claude-bubble--asst")}
          >
            <div className="onb-claude-bubble-label">{m.role === "user" ? "You" : "Assistant"}</div>
            <div className="onb-claude-bubble-text">{m.content}</div>
          </div>
        ))}
        {loading && messages.length > 0 && (
          <div className="onb-claude-bubble onb-claude-bubble--asst">
            <div className="onb-claude-bubble-text onb-claude-typing">Replying…</div>
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
          placeholder="Reply in this step… (Ctrl/Cmd+Enter to send)"
          disabled={loading || messages.length === 0}
        />
        <div className="onb-claude-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void send()}
            disabled={loading || !input.trim() || messages.length === 0}
          >
            Send
          </button>
        </div>
      </div>
      {mode !== "icp" && !finalizeInWizardNav && (
        <div className="onb-claude-foot">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void runFinalize()}
            disabled={loading || finalizeLoading}
          >
            {finalizeLoading ? "Saving…" : mode === "lanes" ? "Save segments" : "Save 15 offer angles"}
          </button>
        </div>
      )}
    </div>
  );
});

OnboardingClaudePanel.displayName = "OnboardingClaudePanel";

export default OnboardingClaudePanel;
