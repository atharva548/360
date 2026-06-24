"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { isMockInviteLink } from "@/lib/invite-links";
import WhatsAppCommunityPreview from "./WhatsAppCommunityPreview";

interface JoinSuccessProps {
  leadId: string;
  communityName: string;
  inviteLink: string;
  leadName: string;
  onReset: () => void;
}

export default function JoinSuccess({
  leadId,
  communityName,
  inviteLink,
  leadName,
  onReset,
}: JoinSuccessProps) {
  const searchParams = useSearchParams();
  const forceDemoPreview = searchParams.get("demo") === "1";
  const useDemoPreview = forceDemoPreview || isMockInviteLink(inviteLink);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [logging, setLogging] = useState(false);

  async function recordJoinClick(isDemoPreview: boolean): Promise<boolean> {
    const res = await fetch("/api/join-clicks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, isDemoPreview }),
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("Failed to log join click:", await res.text());
      return false;
    }

    return true;
  }

  async function handleJoinClick() {
    if (logging) return;
    setLogging(true);

    try {
      await recordJoinClick(useDemoPreview);

      if (useDemoPreview) {
        setPreviewOpen(true);
      } else {
        window.open(inviteLink, "_blank", "noopener,noreferrer");
      }
    } finally {
      setLogging(false);
    }
  }

  return (
    <>
      <div className="animate-in space-y-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-stone-200 bg-[#faf9f7]">
          <svg
            className="h-6 w-6 text-stone-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h2 className="font-display text-2xl font-medium tracking-tight text-stone-900">
            You&apos;re all set, {leadName.split(" ")[0]}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            We&apos;ve matched you to the best available community for your city and language.
          </p>
        </div>

        <div className="border border-stone-200 bg-[#faf9f7] p-6 text-left">
          <p className="label-caps">Your Community</p>
          <p className="mt-2 font-display text-xl font-medium text-stone-900">{communityName}</p>
        </div>

        <button
          type="button"
          data-testid="whatsapp-join-link"
          data-invite-link={inviteLink}
          disabled={logging}
          onClick={handleJoinClick}
          className="btn-primary inline-flex w-full gap-2.5 px-6 py-3.5 text-sm disabled:opacity-60"
        >
          <svg className="h-5 w-5 opacity-90" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.957.957l4.458-1.495A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-4.988-1.352l-.357-.213-2.652.888.888-2.652-.213-.357A9.818 9.818 0 0112 2.182c5.422 0 9.818 4.396 9.818 9.818 0 5.422-4.396 9.818-9.818 9.818z" />
          </svg>
          {logging ? "Opening…" : "Join WhatsApp Community"}
        </button>

        <p className="text-xs leading-relaxed text-stone-400">
          {useDemoPreview
            ? "Opens a WhatsApp-style demo preview — seed placeholder links cannot launch the real app."
            : "Tap the button above to open WhatsApp and join your private community via the invite link."}
        </p>

        <button
          type="button"
          onClick={onReset}
          className="text-sm text-stone-500 underline decoration-stone-300 underline-offset-4 transition hover:text-stone-800"
        >
          Register another person
        </button>
      </div>

      {previewOpen && (
        <WhatsAppCommunityPreview
          communityName={communityName}
          leadName={leadName}
          inviteLink={inviteLink}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
