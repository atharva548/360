"use client";

import { useState } from "react";
import RejectedRoutingLog from "./RejectedRoutingLog";

interface SimulationPanelProps {
  onSimulated?: () => void;
  onCommunityCreated?: (communityId: string) => void;
  refreshTrigger?: number;
}

export default function SimulationPanel({
  onSimulated,
  onCommunityCreated,
  refreshTrigger,
}: SimulationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<{
    routed: number;
    rejected: number;
  } | null>(null);

  async function simulateOverflow() {
    setLoading(true);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: "Mumbai",
          language: "Hindi",
          interest: "Both",
          count: 10,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLastResult({ routed: data.routed, rejected: data.rejected });
        onSimulated?.();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="fixed right-0 top-0 z-50 hidden h-full w-80 flex-col border-l border-stone-200 bg-white lg:flex">
      <div className="border-b border-stone-200 px-5 py-5">
        <p className="label-caps">Dev Only — Simulation Panel</p>
        <h3 className="mt-1.5 font-display text-lg font-medium text-stone-900">
          Edge-Curve Testing
        </h3>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <button
          type="button"
          onClick={simulateOverflow}
          disabled={loading}
          className="btn-primary w-full px-4 py-3 text-sm disabled:opacity-50"
        >
          {loading ? "Simulating…" : "Simulate Capacity Overflow"}
        </button>

        <p className="text-xs leading-relaxed text-stone-500">
          Registers 10 dummy Mumbai/Hindi leads. Proves router switches to fallback community
          or rejects when proxy capacity is reached.
        </p>

        {lastResult && (
          <div className="border border-stone-200 bg-[#faf9f7] p-3.5 text-sm">
            <p className="text-stone-600">
              Last run:{" "}
              <strong className="font-medium text-stone-800">{lastResult.routed} routed</strong>,{" "}
              <strong className="font-medium text-stone-800">{lastResult.rejected} rejected</strong>
            </p>
          </div>
        )}

        <RejectedRoutingLog
          compact
          refreshTrigger={refreshTrigger}
          onCommunityCreated={onCommunityCreated}
        />
      </div>
    </aside>
  );
}
