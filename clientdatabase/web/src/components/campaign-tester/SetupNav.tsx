"use client";

import Link from "next/link";
import { MODULE_ORDER, moduleLocked, type BriefProgress, type ModuleKey } from "@/lib/campaign-tester/brief-types";

const MODULES: {
  key: ModuleKey;
  href: (briefId: string) => string;
  label: string;
  short: string;
}[] = [
  {
    key: "module_1_brief",
    href: (id) => `/campaign-tester/${id}/setup/brief`,
    label: "1. Campaign brief",
    short: "Brief",
  },
  {
    key: "module_2_infra",
    href: (id) => `/campaign-tester/${id}/setup/infrastructure`,
    label: "2. Infrastructure",
    short: "Infra",
  },
  {
    key: "module_3_icp",
    href: (id) => `/campaign-tester/${id}/setup/icp`,
    label: "3. ICP & list",
    short: "ICP",
  },
  {
    key: "module_4_offers",
    href: (id) => `/campaign-tester/${id}/setup/offers`,
    label: "4. Offers",
    short: "Offers",
  },
  {
    key: "module_5_tests",
    href: (id) => `/campaign-tester/${id}`,
    label: "5. 6-test wizard",
    short: "Tests",
  },
];

interface Props {
  briefId: string;
  progress: BriefProgress | null;
  current: ModuleKey;
}

export function SetupNav({ briefId, progress, current }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 6,
        marginBottom: 20,
        overflowX: "auto",
      }}
    >
      {MODULES.map((m, i) => {
        const locked = moduleLocked(progress, m.key);
        const done = !!progress?.[m.key];
        const active = m.key === current;
        const canClick = !locked;

        const bg = active
          ? "var(--accent-light)"
          : done
            ? "var(--green-bg)"
            : "var(--bg-tertiary)";
        const color = active
          ? "var(--accent)"
          : done
            ? "var(--green)"
            : locked
              ? "var(--text-muted)"
              : "var(--text-secondary)";
        const border = active
          ? "1px solid var(--accent)"
          : `1px solid var(--border)`;

        const content = (
          <div
            style={{
              padding: "10px 14px",
              background: bg,
              border,
              borderRadius: "var(--radius)",
              color,
              minWidth: 140,
              opacity: locked ? 0.55 : 1,
              cursor: canClick ? "pointer" : "not-allowed",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              Module {i + 1}
              {done ? " · done" : locked ? " · locked" : active ? " · here" : ""}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.short}</div>
          </div>
        );

        return canClick ? (
          <Link key={m.key} href={m.href(briefId)} style={{ textDecoration: "none" }}>
            {content}
          </Link>
        ) : (
          <div key={m.key}>{content}</div>
        );
      })}
    </div>
  );
}
