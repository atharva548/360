"use client";

import { useCallback, useEffect, useState } from "react";
import type { RejectedRoutingAttempt } from "@/lib/types";

interface RejectedRoutingLogProps {
  onCommunityCreated?: (communityId: string) => void;
  refreshTrigger?: number;
  compact?: boolean;
}

function isSegmentRejection(reason: string): boolean {
  return (
    !reason.includes("Consent not provided") &&
    !reason.includes("suppression list")
  );
}

export default function RejectedRoutingLog({
  onCommunityCreated,
  refreshTrigger,
  compact = false,
}: RejectedRoutingLogProps) {
  const [rejections, setRejections] = useState<RejectedRoutingAttempt[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [createMessage, setCreateMessage] = useState<Record<string, string>>({});

  const loadRejections = useCallback(async () => {
    const res = await fetch("/api/communities");
    if (res.ok) {
      const data = await res.json();
      setRejections(data.rejectedRoutingAttempts ?? []);
    }
  }, []);

  useEffect(() => {
    loadRejections();
  }, [loadRejections, refreshTrigger]);

  async function createCommunityFromRejection(rejection: RejectedRoutingAttempt) {
    setCreatingId(rejection.id);
    setCreateMessage((prev) => {
      const next = { ...prev };
      delete next[rejection.id];
      return next;
    });

    try {
      const res = await fetch("/api/communities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: rejection.city,
          language: rejection.language,
          interest: rejection.interest,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCreateMessage((prev) => ({
          ...prev,
          [rejection.id]: data.error ?? "Failed to create community slot.",
        }));
        return;
      }

      setCreateMessage((prev) => ({
        ...prev,
        [rejection.id]: data.created
          ? "Placeholder created — paste the WhatsApp invite link in Community Invite Links."
          : "Placeholder already exists — paste the invite link in Community Invite Links.",
      }));
      onCommunityCreated?.(data.community.id);
    } catch {
      setCreateMessage((prev) => ({
        ...prev,
        [rejection.id]: "Failed to create community slot.",
      }));
    } finally {
      setCreatingId(null);
    }
  }

  return (
    <div className={compact ? "" : "border border-stone-200 bg-white p-7"}>
      {!compact && (
        <>
          <h2 className="font-display text-xl font-medium tracking-tight text-stone-900">
            Rejected Routing Log
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            Pilgrims who could not be routed appear here. Create a community invite link slot
            for their segment, paste the real WhatsApp link above, and future matches will join
            directly.
          </p>
        </>
      )}

      <div className={compact ? "" : "mt-6"}>
        {compact && (
          <h4 className="label-caps mb-3">Rejected Routing Log</h4>
        )}
        {rejections.length === 0 ? (
          <p className={`text-xs ${compact ? "text-stone-400" : "text-stone-400"}`}>
            No rejections logged yet.
          </p>
        ) : (
          <ul className={`space-y-3 ${compact ? "max-h-96 overflow-y-auto" : "max-h-80 overflow-y-auto"}`}>
            {rejections.map((r) => (
              <li
                key={r.id}
                className="border border-stone-200 bg-[#faf9f7] p-3.5 text-xs"
              >
                <p className="font-medium text-stone-800">
                  {r.name} — {r.city}/{r.language}/{r.interest}
                </p>
                <p className="mt-1.5 leading-relaxed text-stone-500">
                  {r.reason}
                </p>
                <p className="mt-1.5 text-stone-400">
                  {new Date(r.timestamp).toLocaleString()}
                </p>
                {isSegmentRejection(r.reason) && (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      disabled={creatingId === r.id}
                      className={`btn-primary px-2.5 py-1.5 text-xs disabled:opacity-50 ${compact ? "w-full" : ""}`}
                      onClick={() => createCommunityFromRejection(r)}
                    >
                      {creatingId === r.id
                        ? "Creating…"
                        : "Create community invite link"}
                    </button>
                    {createMessage[r.id] && (
                      <p className="text-[11px] leading-snug text-stone-500">
                        {createMessage[r.id]}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
