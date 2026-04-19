"use client";

import { useState } from "react";
import AppSidebar from "@/components/AppSidebar";

type Turn = {
  question: string;
  answer: string;
  query: string;
  results: unknown[];
};

export default function IntelligencePage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Turn[]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setInput("");

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setThread((prev) => [
        ...prev,
        {
          question: q,
          answer: data.answer,
          query: data.query,
          results: data.results ?? [],
        },
      ]);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-layout">
      <AppSidebar active="intelligence" />

      <main className="main-content intelligence-page">
        <header className="page-header">
          <h1>Intelligence</h1>
          <p className="text-muted">Plain-English questions over your campaigns, copy, and leads.</p>
        </header>

        <div className="intelligence-thread">
          {thread.length === 0 && !loading && (
            <p className="text-muted">Ask something like: &quot;What offer converts best for MSP clients by reply rate?&quot;</p>
          )}

          {thread.map((t, i) => (
            <article key={i} className="intelligence-turn">
              <div className="intelligence-q">
                <strong>You</strong>
                <p>{t.question}</p>
              </div>
              <div className="intelligence-a">
                <strong>Answer</strong>
                <p className="intelligence-answer">{t.answer}</p>
              </div>
              <details className="intelligence-sql">
                <summary>Show SQL &amp; raw results</summary>
                <pre className="sql-block">{t.query}</pre>
                <pre className="results-block">{JSON.stringify(t.results, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>

        {error && <p className="error-banner">{error}</p>}

        <form className="intelligence-form" onSubmit={onSubmit}>
          <textarea
            className="intelligence-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={loading}
          />
          <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
            {loading ? "…" : "Send"}
          </button>
        </form>
      </main>
    </div>
  );
}
