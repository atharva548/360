import { generateId, getStore } from "./datastore";
import type { Community, CreateDispatchInput, DispatchTask } from "./types";

function segmentKey(segmentType: string, targetSegment: string): string {
  return `${segmentType}:${targetSegment}`;
}

function hasDuplicateTask(
  communityId: string,
  messageText: string,
  targetKey: string
): boolean {
  const store = getStore();
  return store.dispatchTasks.some(
    (task) =>
      task.communityId === communityId &&
      task.messageText === messageText &&
      task.targetSegment === targetKey &&
      (task.status === "Pending" || task.status === "Sent")
  );
}

export function createDispatchTasks(
  input: CreateDispatchInput
): { tasks: DispatchTask[]; skippedDuplicates: number } {
  const store = getStore();
  const { messageText, targetSegment, segmentType } = input;
  const targetKey = segmentKey(segmentType, targetSegment);

  const matchingCommunities: Community[] = store.communities.filter((c) => {
    if (segmentType === "city") {
      return c.city.toLowerCase() === targetSegment.toLowerCase();
    }
    return c.language.toLowerCase() === targetSegment.toLowerCase();
  });

  let skippedDuplicates = 0;
  const tasks: DispatchTask[] = [];

  for (const community of matchingCommunities.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (hasDuplicateTask(community.id, messageText, targetKey)) {
      skippedDuplicates += 1;
      continue;
    }

    tasks.push({
      id: generateId("task"),
      messageText,
      targetSegment: targetKey,
      status: "Pending",
      communityId: community.id,
      createdAt: new Date().toISOString(),
    });
  }

  store.dispatchTasks.unshift(...tasks);
  return { tasks, skippedDuplicates };
}

export function updateTaskStatus(
  taskId: string,
  status: "Sent" | "Failed"
): DispatchTask | null {
  const store = getStore();
  const task = store.dispatchTasks.find((t) => t.id === taskId);
  if (!task) return null;

  if (task.status === "Sent" && status === "Failed") {
    return task;
  }

  task.status = status;
  return task;
}

export function getCommunityById(id: string): Community | undefined {
  return getStore().communities.find((c) => c.id === id);
}
