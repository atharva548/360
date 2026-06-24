"use client";

import { useCallback, useState } from "react";
import { CITIES, LANGUAGES } from "@/lib/constants";
import type { Community, DispatchTask } from "@/lib/types";
import DispatchTaskList from "./DispatchTaskList";
import CommunityRegistry from "./CommunityRegistry";
import RejectedRoutingLog from "./RejectedRoutingLog";
import JoinClickLog from "./JoinClickLog";
import SimulationPanel from "./SimulationPanel";

type DispatchTaskWithCommunity = DispatchTask & { community?: Community };

export default function OperatorDashboard() {
  const [messageText, setMessageText] = useState("");
  const [segmentType, setSegmentType] = useState<"city" | "language">("city");
  const [targetSegment, setTargetSegment] = useState("");
  const [tasks, setTasks] = useState<DispatchTaskWithCommunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [highlightCommunityId, setHighlightCommunityId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    const res = await fetch("/api/dispatch");
    const data = await res.json();
    setTasks(data.tasks ?? []);
  }, []);

  async function handleCreateTasks(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText, targetSegment, segmentType }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create tasks.");
        return;
      }

      await loadTasks();
      if (data.skippedDuplicates > 0) {
        setInfo(
          `Created ${data.tasks.length} task(s). Skipped ${data.skippedDuplicates} duplicate(s) already Pending or Sent.`
        );
      } else {
        setInfo(`Created ${data.tasks.length} task(s).`);
      }
      setMessageText("");
    } catch {
      setError("Failed to create dispatch tasks.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(taskId: string, status: "Sent" | "Failed") {
    const res = await fetch("/api/dispatch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, status }),
    });

    if (res.ok) {
      await loadTasks();
    }
  }

  const segmentOptions = segmentType === "city" ? CITIES : LANGUAGES;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className={`min-h-screen bg-[#f7f5f0] ${isDev ? "lg:pr-80" : ""}`}>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <p className="label-caps">Operator Control Center</p>
            <h1 className="mt-1 font-display text-2xl font-medium tracking-tight text-stone-900">
              Atlas Travels — Assisted Dispatch
            </h1>
          </div>
          <a href="/" className="btn-secondary px-4 py-2.5 text-sm">
            ← Public Gateway
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-10 border border-stone-200 bg-white p-6">
          <h2 className="text-sm font-medium tracking-wide text-stone-800">Compliance Boundary</h2>
          <p className="mt-3 text-sm leading-relaxed text-stone-500">
            Community creation and message broadcasting are <strong className="font-medium text-stone-700">assisted workflows</strong>.
            Operators manually copy messages and send via WhatsApp Web — no browser bots or unofficial
            automation. Routing and task generation are fully automated.
          </p>
        </div>

        <section className="mb-10">
          <CommunityRegistry
            refreshTrigger={refreshKey}
            highlightCommunityId={highlightCommunityId}
            onUpdated={() => setHighlightCommunityId(null)}
          />
        </section>

        <section className="mb-10">
          <JoinClickLog refreshTrigger={refreshKey} />
        </section>

        <section className="mb-10">
          <RejectedRoutingLog
            refreshTrigger={refreshKey}
            onCommunityCreated={(communityId) => {
              setRefreshKey((k) => k + 1);
              setHighlightCommunityId(communityId);
            }}
          />
        </section>

        <div className="grid gap-10 lg:grid-cols-5">
          <section className="lg:col-span-2">
            <div className="border border-stone-200 bg-white p-7">
              <h2 className="font-display text-xl font-medium tracking-tight text-stone-900">
                Broadcast Composer
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                Draft a message and select a segment. Tasks are split per matching community.
              </p>

              <form onSubmit={handleCreateTasks} className="mt-8 space-y-6">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-stone-500">
                    Message Template
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Assalamualaikum! Umrah packages for July are now open…"
                    className="input-field resize-none"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-xs font-medium uppercase tracking-[0.1em] text-stone-500">
                    Target Filter
                  </label>
                  <div className="mb-4 flex gap-2">
                    {(["city", "language"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setSegmentType(type);
                          setTargetSegment("");
                        }}
                        className={`rounded-sm px-4 py-2 text-sm font-medium capitalize transition ${
                          segmentType === type
                            ? "bg-stone-900 text-stone-50"
                            : "border border-stone-200 bg-transparent text-stone-500 hover:bg-[#faf9f7] hover:text-stone-800"
                        }`}
                      >
                        By {type}
                      </button>
                    ))}
                  </div>
                  <select
                    required
                    value={targetSegment}
                    onChange={(e) => setTargetSegment(e.target.value)}
                    className="input-field"
                  >
                    <option value="">Select {segmentType}</option>
                    {segmentOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-sm text-stone-800">{error}</p>}
                {info && <p className="text-sm text-stone-600">{info}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full px-4 py-3 text-sm"
                >
                  {loading ? "Generating tasks…" : "Generate Operator Task List"}
                </button>
              </form>
            </div>
          </section>

          <section className="lg:col-span-3">
            <DispatchTaskList
              tasks={tasks}
              onLoad={loadTasks}
              onUpdateStatus={handleUpdateStatus}
            />
          </section>
        </div>
      </div>

      {isDev && (
        <SimulationPanel
          refreshTrigger={refreshKey}
          onSimulated={() => setRefreshKey((k) => k + 1)}
          onCommunityCreated={(communityId) => {
            setRefreshKey((k) => k + 1);
            setHighlightCommunityId(communityId);
          }}
        />
      )}
    </div>
  );
}
