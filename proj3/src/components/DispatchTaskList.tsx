"use client";

import { useEffect } from "react";
import type { Community, DispatchTask } from "@/lib/types";
import DispatchTaskRow from "./DispatchTaskRow";

type DispatchTaskWithCommunity = DispatchTask & { community?: Community };

interface DispatchTaskListProps {
  tasks: DispatchTaskWithCommunity[];
  onLoad: () => Promise<void>;
  onUpdateStatus: (taskId: string, status: "Sent" | "Failed") => Promise<void>;
}

export default function DispatchTaskList({
  tasks,
  onLoad,
  onUpdateStatus,
}: DispatchTaskListProps) {
  useEffect(() => {
    onLoad();
  }, [onLoad]);

  const pending = tasks.filter((t) => t.status === "Pending").length;
  const sent = tasks.filter((t) => t.status === "Sent").length;
  const failed = tasks.filter((t) => t.status === "Failed").length;

  return (
    <div className="border border-stone-200 bg-white p-7">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-medium tracking-tight text-stone-900">
            Operator Task List
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            One row per community — execute manually, then mark status.
          </p>
        </div>
        <div className="flex gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em]">
          <span className="border border-stone-200 px-3 py-1.5 text-stone-600">
            {pending} Pending
          </span>
          <span className="border border-stone-200 px-3 py-1.5 text-stone-600">
            {sent} Sent
          </span>
          <span className="border border-stone-200 px-3 py-1.5 text-stone-600">
            {failed} Failed
          </span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-10 border border-dashed border-stone-300 py-14 text-center text-sm text-stone-400">
          No dispatch tasks yet. Compose a broadcast to generate the operator queue.
        </div>
      ) : (
        <div className="mt-8 space-y-3">
          {tasks.map((task) => (
            <DispatchTaskRow
              key={task.id}
              task={task}
              onUpdateStatus={onUpdateStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}
