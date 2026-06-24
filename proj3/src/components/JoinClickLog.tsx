"use client";

import { useCallback, useEffect, useState } from "react";
import type { JoinClickEvent } from "@/lib/types";

interface JoinClickLogProps {
  refreshTrigger?: number;
}

export default function JoinClickLog({ refreshTrigger }: JoinClickLogProps) {
  const [clicks, setClicks] = useState<JoinClickEvent[]>([]);

  const loadClicks = useCallback(async () => {
    const res = await fetch("/api/join-clicks", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setClicks(data.joinClickLog ?? []);
    }
  }, []);

  useEffect(() => {
    loadClicks();
    const interval = setInterval(loadClicks, 3000);
    return () => clearInterval(interval);
  }, [loadClicks, refreshTrigger]);

  return (
    <div className="border border-stone-200 bg-white p-7">
      <h2 className="font-display text-xl font-medium tracking-tight text-stone-900">
        Join Community Click Log
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        Pilgrims who clicked &ldquo;Join WhatsApp Community&rdquo; on the public gateway after
        successful routing.
      </p>

      {clicks.length === 0 ? (
        <p className="mt-6 text-sm text-stone-400">No join clicks recorded yet.</p>
      ) : (
        <ul className="mt-6 max-h-80 space-y-3 overflow-y-auto">
          {clicks.map((click) => (
            <li
              key={click.id}
              className="border border-stone-200 bg-[#faf9f7] p-4 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-stone-900">{click.leadName}</p>
                <span className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-stone-500">
                  {click.isDemoPreview ? "Demo preview" : "WhatsApp opened"}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-stone-500">
                {click.phone} · {click.city} / {click.language} / {click.interest}
              </p>
              <p className="mt-1 text-xs text-stone-600">{click.communityName}</p>
              <p className="mt-2 text-xs text-stone-400">
                {new Date(click.timestamp).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
