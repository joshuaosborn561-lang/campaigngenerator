"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import AppSidebar from "@/components/AppSidebar";

interface UploadResult {
  total: number;
  matched: number;
  new: number;
  prospeoAttempted: number;
  prospeoFound: number;
  prospeoSaved: number;
  prospeoErrors: number;
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [enrich, setEnrich] = useState(true);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File) {
    setError("");
    setResult(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Please upload a CSV file");
      return;
    }
    setFile(f);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleProcess() {
    if (!file || processing) return;
    setProcessing(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("enrich", enrich ? "true" : "false");

      const res = await fetch("/api/contacts/diff", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      // Read counts from headers before downloading
      const total = parseInt(res.headers.get("X-Total-Rows") || "0");
      const matched = parseInt(res.headers.get("X-Matched-Rows") || "0");
      const newCount = parseInt(res.headers.get("X-New-Rows") || "0");
      const prospeoAttempted = parseInt(res.headers.get("X-Prospeo-Attempted") || "0");
      const prospeoFound = parseInt(res.headers.get("X-Prospeo-Found") || "0");
      const prospeoSaved = parseInt(res.headers.get("X-Prospeo-Saved") || "0");
      const prospeoErrors = parseInt(res.headers.get("X-Prospeo-Errors") || "0");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `apollo-diff-${Date.now()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);

      setResult({
        total,
        matched,
        new: newCount,
        prospeoAttempted,
        prospeoFound,
        prospeoSaved,
        prospeoErrors,
      });
    } catch (err: any) {
      setError(err.message || "Failed to process file");
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="app-layout">
      <AppSidebar active="import" />

      {/* Main */}
      <div className="content-area">
        <div className="top-bar">
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
              Apollo CSV Diff
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
              Upload your Apollo export — get back an Excel marking which contacts you already have so you don&apos;t burn credits revealing emails twice
            </p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "32px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 640 }}>
            {/* Step 1: Upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-light)"}`,
                borderRadius: 12,
                padding: "48px 24px",
                textAlign: "center",
                background: dragOver ? "var(--accent-light)" : "var(--bg-secondary)",
                cursor: file ? "default" : "pointer",
                transition: "all 0.15s",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              {!file ? (
                <>
                  <div style={{ marginBottom: 16, color: "var(--text-muted)" }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
                    Drag your Apollo CSV here
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    or click to browse
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 12, color: "var(--green)" }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{file.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    style={{
                      marginTop: 12,
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      fontSize: 12,
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    Choose a different file
                  </button>
                </>
              )}
            </div>

            {/* Enrichment toggle */}
            {file && !result && (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginTop: 16,
                  padding: "12px 14px",
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={enrich}
                  onChange={(e) => setEnrich(e.target.checked)}
                  disabled={processing}
                  style={{ marginTop: 2, accentColor: "var(--accent)" }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                    Also enrich new contacts with Prospeo
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                    For rows we don&apos;t have yet, find emails via Prospeo (LinkedIn URL → name+company fallback) and save them to Supabase so they&apos;re cached for next time. Skips rows where Apollo already revealed the email.
                  </div>
                </div>
              </label>
            )}

            {/* Process button */}
            {file && !result && (
              <button
                onClick={handleProcess}
                disabled={processing}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  marginTop: 12,
                  padding: "12px",
                  fontSize: 14,
                  justifyContent: "center",
                }}
              >
                {processing ? (
                  <>
                    <span style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }} />
                    {enrich ? "Diffing + enriching with Prospeo..." : "Processing... checking against Supabase"}
                  </>
                ) : (
                  enrich ? "Diff + enrich + download Excel" : "Process and download Excel"
                )}
              </button>
            )}

            {/* Error */}
            {error && (
              <div style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "var(--red-bg)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: 6,
                color: "var(--red)",
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            {/* Result */}
            {result && (
              <div style={{
                marginTop: 16,
                padding: 20,
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--green)" }}>
                  ✓ Done — Excel downloaded
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Stat label="Total rows" value={result.total} />
                  <Stat label="Already in DB" value={result.matched} color="var(--orange)" />
                  <Stat label="New" value={result.new} color="var(--green)" />
                </div>

                {result.prospeoAttempted > 0 && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 16, marginBottom: 8, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Prospeo enrichment
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                      <Stat label="Tried" value={result.prospeoAttempted} />
                      <Stat label="Found" value={result.prospeoFound} color="var(--green)" />
                      <Stat label="Cached" value={result.prospeoSaved} color="var(--accent)" />
                      <Stat label="Errors" value={result.prospeoErrors} color={result.prospeoErrors > 0 ? "var(--red)" : undefined} />
                    </div>
                  </>
                )}

                <div style={{ marginTop: 14, padding: 12, background: "var(--bg-tertiary)", borderRadius: 6, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {result.prospeoFound > 0 ? (
                    <>
                      Found <strong style={{ color: "var(--green)" }}>{result.prospeoFound}</strong> fresh emails via Prospeo. Open the Excel and check the{" "}
                      <code style={{ background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3 }}>prospeo_email</code>{" "}
                      column. All {result.prospeoSaved} are cached in Supabase — next time you upload a CSV with these contacts, they&apos;ll show up as already-in-DB.
                    </>
                  ) : (
                    <>
                      Open the Excel file and sort the <strong>Contacts</strong> sheet by{" "}
                      <code style={{ background: "var(--bg-hover)", padding: "1px 5px", borderRadius: 3 }}>in_database = no</code>{" "}
                      to see the {result.new} contacts you should reveal emails for. Skip the {result.matched} you already have.
                    </>
                  )}
                </div>
                <button
                  onClick={reset}
                  className="btn"
                  style={{ marginTop: 12, width: "100%", justifyContent: "center" }}
                >
                  Process another file
                </button>
              </div>
            )}

            {/* How it works */}
            <div style={{ marginTop: 32, padding: 20, background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
                How it works
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
                <li>In Apollo, run your search and export the list as CSV (no need to reveal emails first)</li>
                <li>Drop the CSV here</li>
                <li>We match each row against your Supabase contacts using LinkedIn URL → email → name+company</li>
                <li>For the new ones, Prospeo finds the email (LinkedIn URL → name+company fallback)</li>
                <li>Fresh emails are saved to Supabase so you never burn credits on the same contact twice</li>
                <li>Open the Excel — contacts you already had, plus brand-new enriched ones, all in one file</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ padding: 12, background: "var(--bg-tertiary)", borderRadius: 6, textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--text-primary)" }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
