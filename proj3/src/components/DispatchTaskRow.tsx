"use client";

import { useState } from "react";
import type { Community, DispatchTask } from "@/lib/types";

type DispatchTaskWithCommunity = DispatchTask & { community?: Community };

interface DispatchTaskRowProps {
  task: DispatchTaskWithCommunity;
  onUpdateStatus: (taskId: string, status: "Sent" | "Failed") => Promise<void>;
}

const statusStyles = {
  Pending: "border-stone-300 text-stone-600",
  Sent: "border-stone-400 text-stone-700",
  Failed: "border-stone-300 text-stone-500 line-through decoration-stone-300",
};

export default function DispatchTaskRow({ task, onUpdateStatus }: DispatchTaskRowProps) {
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const community = task.community;

  async function copyMessage() {
    await navigator.clipboard.writeText(task.messageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function launchWhatsApp() {
    const encoded = encodeURIComponent(task.messageText);
    window.open(`https://web.whatsapp.com/send?text=${encoded}`, "_blank", "noopener,noreferrer");
  }

  async function markStatus(status: "Sent" | "Failed") {
    if (task.status === "Sent") return;
    setUpdating(true);
    await onUpdateStatus(task.id, status);
    setUpdating(false);
  }

  return (
    <div
      className={`border p-5 transition ${
        task.status === "Sent"
          ? "border-stone-200 bg-[#faf9f7] opacity-80"
          : "border-stone-200 bg-[#faf9f7]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-stone-900">
            {community?.name ?? task.communityId}
          </p>
          <p className="mt-1.5 text-xs text-stone-500">
            Proxy members: {community?.currentCount ?? "—"} / {community?.proxyCapacity ?? "—"}
            {community?.status && community.status !== "Active" && (
              <span className="ml-2 text-stone-600">({community.status})</span>
            )}
          </p>
        </div>
        <span
          className={`border px-3 py-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.08em] ${statusStyles[task.status]}`}
        >
          {task.status}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-stone-600">{task.messageText}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyMessage}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {copied ? "Copied" : "Copy Message"}
        </button>
        <button
          type="button"
          onClick={launchWhatsApp}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          Launch WhatsApp
        </button>
        <button
          type="button"
          disabled={task.status === "Sent" || updating}
          onClick={() => markStatus("Sent")}
          className="btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark Sent
        </button>
        <button
          type="button"
          disabled={task.status === "Sent" || updating}
          onClick={() => markStatus("Failed")}
          className="btn-secondary px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          Mark Failed
        </button>
      </div>
    </div>
  );
}
