"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Community } from "@/lib/types";

type CommunityWithMockFlag = Community & { isMockInvite?: boolean };

interface CommunityRegistryProps {
  onUpdated?: () => void;
  highlightCommunityId?: string | null;
  refreshTrigger?: number;
}

export default function CommunityRegistry({
  onUpdated,
  highlightCommunityId,
  refreshTrigger,
}: CommunityRegistryProps) {
  const [communities, setCommunities] = useState<CommunityWithMockFlag[]>([]);
  const [draftLinks, setDraftLinks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loadCommunities = useCallback(async () => {
    const res = await fetch("/api/communities", { method: "POST" });
    if (!res.ok) return;
    const data = await res.json();
    const list = data.communities as CommunityWithMockFlag[];
    setCommunities(list);
    setDraftLinks(
      Object.fromEntries(list.map((c) => [c.id, c.inviteLink]))
    );
  }, []);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities, refreshTrigger]);

  useEffect(() => {
    if (!highlightCommunityId) return;
    const row = rowRefs.current[highlightCommunityId];
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [highlightCommunityId, communities]);

  async function saveInviteLink(communityId: string) {
    setSavingId(communityId);
    setMessage("");

    try {
      const res = await fetch("/api/communities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId,
          inviteLink: draftLinks[communityId],
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error ?? "Failed to save invite link.");
        return;
      }

      setMessage(
        data.community?.status === "Active" && !data.isMock
          ? "Invite link saved and community activated. New leads for this segment will join directly."
          : "Invite link saved. New leads routed to this community will receive it."
      );
      await loadCommunities();
      onUpdated?.();
    } catch {
      setMessage("Failed to save invite link.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="border border-stone-200 bg-white p-7">
      <h2 className="font-display text-xl font-medium tracking-tight text-stone-900">
        Community Invite Links
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-500">
        After creating a community manually in WhatsApp, paste its real invite link here.
        The public gateway uses these links when routing pilgrims — operators manage links, not end users.
      </p>

      {message && (
        <p className="mt-5 border border-stone-200 bg-[#faf9f7] px-4 py-3 text-sm text-stone-700">
          {message}
        </p>
      )}

      <div className="mt-8 space-y-4">
        {communities.map((community) => {
          const isMock = community.isMockInvite ?? true;
          const unchanged = draftLinks[community.id] === community.inviteLink;

          return (
            <div
              key={community.id}
              ref={(el) => {
                rowRefs.current[community.id] = el;
              }}
              className={`border bg-[#faf9f7] p-5 transition ${
                highlightCommunityId === community.id
                  ? "border-stone-400 ring-1 ring-stone-300"
                  : "border-stone-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-stone-900">{community.name}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
                    {community.city} · {community.language} · {community.interest}
                    {" · "}
                    {community.currentCount}/{community.proxyCapacity} proxy
                    {community.status !== "Active" && (
                      <span className="ml-1 text-stone-600">({community.status})</span>
                    )}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] ${
                    isMock
                      ? "border border-stone-300 text-stone-500"
                      : "border border-stone-400 text-stone-700"
                  }`}
                >
                  {isMock ? "Placeholder link" : "Live link"}
                </span>
              </div>

              <label className="mt-4 block text-xs font-medium uppercase tracking-[0.1em] text-stone-500">
                WhatsApp invite URL
              </label>
              <input
                type="url"
                value={draftLinks[community.id] ?? ""}
                onChange={(e) =>
                  setDraftLinks((prev) => ({
                    ...prev,
                    [community.id]: e.target.value,
                  }))
                }
                placeholder="https://chat.whatsapp.com/…"
                className="input-field mt-2 text-sm"
              />

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingId === community.id || unchanged}
                  onClick={() => saveInviteLink(community.id)}
                  className="btn-primary px-3 py-1.5 text-xs disabled:cursor-not-allowed"
                >
                  {savingId === community.id ? "Saving…" : "Save invite link"}
                </button>
                {!isMock && (
                  <a
                    href={community.inviteLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    Test link
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
