"use client";

import { Suspense, useState } from "react";
import GatewayForm from "@/components/GatewayForm";
import JoinSuccess from "@/components/JoinSuccess";

export default function HomePage() {
  const [success, setSuccess] = useState<{
    leadId: string;
    communityName: string;
    inviteLink: string;
    leadName: string;
  } | null>(null);

  return (
    <div className="min-h-screen bg-[#f7f5f0]">
      <header className="relative mx-auto max-w-6xl px-6 pt-12 pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-stone-300 bg-white font-display text-base font-semibold tracking-wide text-stone-800">
              AT
            </div>
            <div>
              <p className="label-caps">Atlas Travels</p>
              <p className="mt-0.5 text-sm text-stone-600">Hajj &amp; Umrah Specialists</p>
            </div>
          </div>
          <a
            href="/operator"
            className="btn-secondary hidden px-5 py-2.5 text-sm sm:inline-flex"
          >
            Operator Dashboard →
          </a>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-6 pb-24">
        <div className="grid items-start gap-14 lg:grid-cols-2 lg:gap-20">
          <div className="space-y-8 pt-2">
            <div className="inline-flex items-center gap-2.5 border border-stone-200 bg-white px-4 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
              <span className="text-xs font-medium tracking-wide text-stone-600">
                Private WhatsApp Communities
              </span>
            </div>

            <h1 className="font-display text-4xl font-medium leading-[1.15] tracking-tight text-stone-900 sm:text-[2.75rem]">
              Your journey to the Holy Land starts here
            </h1>

            <p className="max-w-lg text-base leading-relaxed text-stone-600">
              Join a private WhatsApp Community matched to your city and language.
              Get exclusive Hajj &amp; Umrah packages, visa updates, and departure alerts —
              all in one trusted space.
            </p>

            <ul className="space-y-3.5 text-stone-700">
              {[
                "Matched to your city & preferred language",
                "Private communities — not public groups",
                "Exclusive packages & early-bird pricing",
                "Direct support from Atlas Travels experts",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="mt-2 h-px w-3 shrink-0 bg-stone-400" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>

            <div className="border border-stone-200 bg-white p-6">
              <p className="label-caps">One Smart Link</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                One gateway URL routes thousands of pilgrims to the right community —
                automatically, compliantly, via native WhatsApp invite links.
              </p>
            </div>
          </div>

          <div className="border border-stone-200 bg-white p-8 sm:p-10">
            {success ? (
              <Suspense fallback={<p className="text-sm text-stone-500">Loading…</p>}>
                <JoinSuccess
                  leadId={success.leadId}
                  communityName={success.communityName}
                  inviteLink={success.inviteLink}
                  leadName={success.leadName}
                  onReset={() => setSuccess(null)}
                />
              </Suspense>
            ) : (
              <>
                <h2 className="font-display text-2xl font-medium tracking-tight text-stone-900">
                  Join Your Community
                </h2>
                <p className="mt-2 mb-8 text-sm leading-relaxed text-stone-500">
                  Fill in your details — we&apos;ll route you to the best available community.
                </p>
                <GatewayForm onSuccess={setSuccess} />
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white py-10 text-center">
        <p className="text-sm text-stone-600">© 2026 Atlas Travels · Hajj &amp; Umrah Community Gateway</p>
        <p className="mt-2 text-xs leading-relaxed text-stone-400">
          Routing is automated · Broadcasting is operator-assisted · No unofficial WhatsApp automation
        </p>
      </footer>
    </div>
  );
}
