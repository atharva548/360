"use client";

import { useEffect, useState } from "react";

interface WhatsAppCommunityPreviewProps {
  communityName: string;
  leadName: string;
  inviteLink: string;
  onClose: () => void;
}

export default function WhatsAppCommunityPreview({
  communityName,
  leadName,
  inviteLink,
  onClose,
}: WhatsAppCommunityPreviewProps) {
  const [step, setStep] = useState<"invite" | "joined">("invite");
  const firstName = leadName.split(" ")[0] ?? leadName;
  const initials = communityName
    .split(/[\s—–-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="WhatsApp community demo preview"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-200">
            Client demo preview
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-stone-300 transition hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="overflow-hidden rounded-[2rem] border-[6px] border-stone-800 bg-stone-900 shadow-2xl">
          <div className="bg-[#111b21]">
            {/* Status bar */}
            <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] text-white/70">
              <span>9:41</span>
              <div className="flex gap-1">
                <span className="h-2 w-3 rounded-sm bg-white/50" />
                <span className="h-2 w-3 rounded-sm bg-white/50" />
              </div>
            </div>

            {step === "invite" ? (
              <>
                <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                  <button type="button" onClick={onClose} className="text-[#aebac1]">
                    ←
                  </button>
                  <span className="text-sm text-[#aebac1]">Invite to community</span>
                </div>

                <div className="flex flex-col items-center px-6 pb-8 pt-10 text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#005c4b] text-2xl font-semibold text-white">
                    {initials || "AT"}
                  </div>
                  <h3 className="mt-5 text-xl font-medium text-[#e9edef]">{communityName}</h3>
                  <p className="mt-1 text-sm text-[#8696a0]">WhatsApp Community</p>
                  <p className="mt-1 text-sm text-[#8696a0]">24 members · 2 groups</p>

                  <p className="mt-6 max-w-xs text-sm leading-relaxed text-[#8696a0]">
                    Private community for Hajj &amp; Umrah updates, packages, and departure alerts
                    from Atlas Travels.
                  </p>

                  <div className="mt-8 w-full rounded-lg bg-[#202c33] p-4 text-left">
                    <p className="text-xs font-medium uppercase tracking-wide text-[#8696a0]">
                      Included groups
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-[#e9edef]">
                      <li className="flex items-center gap-2">
                        <span className="text-[#8696a0]">#</span> Announcements
                      </li>
                      <li className="flex items-center gap-2">
                        <span className="text-[#8696a0]">#</span> General discussion
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => setStep("joined")}
                    className="mt-8 w-full rounded-full bg-[#00a884] py-3.5 text-sm font-medium text-[#111b21] transition hover:bg-[#06cf9c]"
                  >
                    Join community
                  </button>

                  <p className="mt-4 break-all text-[10px] text-[#667781]">
                    {inviteLink}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-white/10 bg-[#202c33] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setStep("invite")}
                    className="text-[#aebac1]"
                  >
                    ←
                  </button>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#005c4b] text-xs font-semibold text-white">
                    {initials || "AT"}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-[#e9edef]">{communityName}</p>
                    <p className="text-xs text-[#8696a0]">24 members</p>
                  </div>
                </div>

                <div
                  className="min-h-[420px] bg-[#0b141a] px-3 py-4"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.02) 0%, transparent 50%)",
                  }}
                >
                  <div className="mx-auto max-w-[85%] rounded-lg rounded-tl-none bg-[#005c4b] px-3 py-2 text-left text-sm leading-relaxed text-[#e9edef]">
                    <p className="mb-1 text-xs font-medium text-[#53bdeb]">Atlas Travels Admin</p>
                    Assalamualaikum {firstName}! Welcome to {communityName}. Package updates and visa
                    alerts will be posted here. Reply in General discussion for questions.
                    <p className="mt-1 text-right text-[10px] text-[#ffffff99]">9:42 ✓✓</p>
                  </div>

                  <div className="mx-auto mt-3 max-w-[85%] rounded-lg bg-[#202c33] px-3 py-2 text-center text-xs text-[#8696a0]">
                    You joined this community
                  </div>

                  <div className="mx-auto mt-4 max-w-[75%] rounded-lg rounded-tr-none bg-[#202c33] px-3 py-2 text-left text-sm text-[#e9edef]">
                    July Umrah group departures are now open — early-bird pricing until Friday.
                    <p className="mt-1 text-right text-[10px] text-[#8696a0]">9:43</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-white/10 bg-[#202c33] px-3 py-3">
                  <div className="flex-1 rounded-full bg-[#2a3942] px-4 py-2 text-sm text-[#8696a0]">
                    Message
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00a884] text-[#111b21]">
                    ➤
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <p className="mt-3 text-center text-xs leading-relaxed text-stone-300">
          Simulated WhatsApp UI for client demos. Production uses real invite links.
        </p>
      </div>
    </div>
  );
}
