import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "./datastore";
import { createDispatchTasks } from "./dispatch";
import { routeLead } from "./router";

function baseInput(overrides: Partial<Parameters<typeof routeLead>[0]> = {}) {
  return {
    name: "Test User",
    phone: "+919988776655",
    city: "Mumbai",
    language: "Hindi",
    interest: "Umrah" as const,
    consented: true,
    ...overrides,
  };
}

describe("routeLead", () => {
  beforeEach(() => {
    resetStore();
  });

  it("routes to lowest-count eligible community in segment", () => {
    const result = routeLead(baseInput());
    expect(result.success).toBe(true);
    expect(result.community?.id).toBe("comm-mumbai-hindi-02");
  });

  it("rejects when community is Full", () => {
    const result = routeLead(
      baseInput({ city: "Chennai", language: "Tamil", interest: "Hajj" })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/full/i);
  });

  it("rejects when community is Privacy Risk", () => {
    const result = routeLead(
      baseInput({ city: "Bangalore", language: "Kannada", interest: "Umrah" })
    );
    expect(result.success).toBe(false);
  });

  it("rejects when community is Paused", () => {
    const result = routeLead(
      baseInput({ city: "Lucknow", language: "Hindi", interest: "Hajj" })
    );
    expect(result.success).toBe(false);
  });

  it("blocks suppressed phone numbers", () => {
    const result = routeLead(baseInput({ phone: "+919000000000" }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/opted out/i);
  });

  it("routes Hajj-only leads to Hajj/Both communities only", () => {
    const result = routeLead(baseInput({ interest: "Hajj" }));
    expect(result.success).toBe(true);
    expect(result.community?.id).toBe("comm-mumbai-hindi-01");
  });
});

describe("createDispatchTasks", () => {
  beforeEach(() => {
    resetStore();
  });

  it("skips duplicate Pending/Sent tasks for same message and segment", () => {
    const input = {
      messageText: "Test broadcast",
      targetSegment: "Mumbai",
      segmentType: "city" as const,
    };

    const first = createDispatchTasks(input);
    expect(first.tasks.length).toBe(2);
    expect(first.skippedDuplicates).toBe(0);

    const second = createDispatchTasks(input);
    expect(second.tasks.length).toBe(0);
    expect(second.skippedDuplicates).toBe(2);
  });
});
