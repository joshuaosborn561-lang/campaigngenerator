"use client";

import { useRef, type KeyboardEvent } from "react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * Inline chip editor. Type text + hit Enter (or comma) to add; Backspace
 * on empty input removes the last chip. Values are deduplicated.
 */
export function ChipInput({ value, onChange, placeholder, ariaLabel }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(text: string) {
    const cleaned = text.trim().replace(/,+$/, "");
    if (!cleaned) return;
    if (value.includes(cleaned)) return;
    onChange([...value, cleaned]);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(el.value);
      el.value = "";
    } else if (e.key === "Backspace" && el.value === "" && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
        padding: "6px 8px",
        background: "var(--bg-tertiary)",
        border: "1px solid var(--border-light)",
        borderRadius: "var(--radius-sm)",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((v) => (
        <span
          key={v}
          className="ct-chip"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {v}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange(value.filter((x) => x !== v));
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
            }}
            aria-label={`Remove ${v}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder ?? "Type then press Enter"}
        aria-label={ariaLabel}
        onKeyDown={onKey}
        onBlur={(e) => {
          if (e.currentTarget.value) {
            commit(e.currentTarget.value);
            e.currentTarget.value = "";
          }
        }}
        style={{
          flex: 1,
          minWidth: 120,
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--text-primary)",
          padding: "4px 2px",
          fontSize: 13,
        }}
      />
    </div>
  );
}
