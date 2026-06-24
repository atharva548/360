import seedData from "@/data/seed.json";
import type {
  Community,
  DataStore,
  DispatchTask,
  JoinClickEvent,
  Lead,
  RejectedRoutingAttempt,
} from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __atlasDataStore: DataStore | undefined;
}

function createStore(): DataStore {
  return {
    communities: structuredClone(seedData.communities) as Community[],
    leads: structuredClone(seedData.leads) as Lead[],
    dispatchTasks: structuredClone(seedData.dispatchTasks) as DispatchTask[],
    rejectedRoutingAttempts: structuredClone(
      seedData.rejectedRoutingAttempts
    ) as RejectedRoutingAttempt[],
    joinClickLog: structuredClone(seedData.joinClickLog) as JoinClickEvent[],
    suppressedPhones: structuredClone(seedData.suppressedPhones) as string[],
  };
}

/** Singleton in-memory datastore — resets on server restart */
export function getStore(): DataStore {
  if (!global.__atlasDataStore) {
    global.__atlasDataStore = createStore();
  } else if (!global.__atlasDataStore.joinClickLog) {
    // Hot-reload can keep an older store shape missing newer collections
    global.__atlasDataStore.joinClickLog = [];
  }
  return global.__atlasDataStore;
}

export function resetStore(): void {
  global.__atlasDataStore = createStore();
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
