import { NextResponse } from "next/server";
import {
  createDispatchTasks,
  getCommunityById,
  updateTaskStatus,
} from "@/lib/dispatch";
import type { CreateDispatchInput } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateDispatchInput;

    if (!body.messageText?.trim() || !body.targetSegment?.trim()) {
      return NextResponse.json(
        { error: "Message and target segment are required." },
        { status: 400 }
      );
    }

    const { tasks, skippedDuplicates } = createDispatchTasks({
      messageText: body.messageText.trim(),
      targetSegment: body.targetSegment.trim(),
      segmentType: body.segmentType ?? "city",
    });

    const enriched = tasks.map((task) => ({
      ...task,
      community: getCommunityById(task.communityId),
    }));

    return NextResponse.json({ tasks: enriched, skippedDuplicates });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      taskId: string;
      status: "Sent" | "Failed";
    };

    if (!body.taskId || !body.status) {
      return NextResponse.json({ error: "taskId and status required." }, { status: 400 });
    }

    const task = updateTaskStatus(body.taskId, body.status);
    if (!task) {
      return NextResponse.json({ error: "Task not found." }, { status: 404 });
    }

    return NextResponse.json({
      task: { ...task, community: getCommunityById(task.communityId) },
    });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function GET() {
  const { getStore } = await import("@/lib/datastore");
  const store = getStore();
  const { getCommunityById: getCommunity } = await import("@/lib/dispatch");

  const tasks = store.dispatchTasks.map((task) => ({
    ...task,
    community: getCommunity(task.communityId),
  }));

  return NextResponse.json({ tasks });
}
