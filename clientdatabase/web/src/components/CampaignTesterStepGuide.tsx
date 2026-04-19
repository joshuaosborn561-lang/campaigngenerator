"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

type Guide = { step: string; title: string; body: string };

function guideForPath(pathname: string): Guide | null {
  if (!pathname.startsWith("/campaign-tester")) return null;

  if (pathname === "/campaign-tester" || pathname === "/campaign-tester/") {
    return {
      step: "Overview",
      title: "Campaign testing workspace",
      body: "Start with **Client Strategy** (ICP lanes + offer library), then use **New Campaign** to spawn briefs from a lane + offer. Tests generate the copy/sequence.",
    };
  }
  if (pathname.endsWith("/new")) {
    return {
      step: "Start",
      title: "Create a brief shell",
      body: "Pick the **client**, then select a **strategy**, **ICP lane**, and **offer**. This spawns a campaign brief without redoing setup each time.",
    };
  }
  if (pathname.includes("/strategy")) {
    return {
      step: "Strategy",
      title: "Client strategy",
      body: "Define reusable ICP lanes and a generous offer library once per client. Spawn many campaigns from these building blocks.",
    };
  }
  if (pathname.includes("/setup/brief")) {
    return {
      step: "Module 1",
      title: "Campaign brief",
      body: "Capture positioning, audience, pain, and direction. This grounds everything that follows.",
    };
  }
  if (pathname.includes("/setup/icp")) {
    return {
      step: "Module 2",
      title: "Ideal customer profile",
      body: "Define who you are targeting so offers and tests stay aligned.",
    };
  }
  if (pathname.includes("/setup/infrastructure")) {
    return {
      step: "Module 3",
      title: "Infrastructure",
      body: "Sending capacity, domains, and tooling—so tests match reality.",
    };
  }
  if (pathname.includes("/setup/offers")) {
    return {
      step: "Module 4",
      title: "Offers",
      body: "Offer angles; generation may use **Claude** plus historical warehouse context when configured.",
    };
  }
  if (pathname.includes("/test/")) {
    return {
      step: "Tests",
      title: "Structured copy tests",
      body: "Run the six test cells. Compare scores and iterate before scaling sends.",
    };
  }
  if (pathname.includes("/diagnostic")) {
    return {
      step: "Diagnostic",
      title: "Deeper checks",
      body: "Optional diagnostics for this brief—use when something looks off.",
    };
  }
  if (/\/campaign-tester\/[^/]+$/.test(pathname)) {
    return {
      step: "Brief",
      title: "Brief home",
      body: "Jump into setup modules from here, or open tests when the wizard is far enough along.",
    };
  }
  return {
    step: "Campaign tester",
    title: "Wizard",
    body: "Follow modules in order. Use the **Guide** chat (bottom right) if you are stuck.",
  };
}

export default function CampaignTesterStepGuide() {
  const pathname = usePathname() ?? "";
  const g = useMemo(() => guideForPath(pathname), [pathname]);
  if (!g) return null;

  return (
    <div className="campaign-tester-guide" role="region" aria-label="Step guide">
      <div className="campaign-tester-guide-icon" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
        </svg>
      </div>
      <div className="campaign-tester-guide-text">
        <div className="campaign-tester-guide-kicker">{g.step}</div>
        <div className="campaign-tester-guide-title">{g.title}</div>
        <p className="campaign-tester-guide-body">{g.body}</p>
      </div>
    </div>
  );
}
