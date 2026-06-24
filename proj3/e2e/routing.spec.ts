import { expect, test } from "@playwright/test";

async function resetStore(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/test/reset");
  expect(res.ok()).toBeTruthy();
}

test.describe("Routing API — rejection cases", () => {
  test.beforeEach(async ({ request }) => {
    await resetStore(request);
  });

  test("rejects Full community segment", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        name: "Tamil Lead",
        phone: "+919111111111",
        city: "Chennai",
        language: "Tamil",
        interest: "Hajj",
        consented: true,
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test("rejects Privacy Risk community segment", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        name: "Kannada Lead",
        phone: "+919222222222",
        city: "Bangalore",
        language: "Kannada",
        interest: "Umrah",
        consented: true,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects Paused community segment", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        name: "Lucknow Lead",
        phone: "+919333333333",
        city: "Lucknow",
        language: "Hindi",
        interest: "Hajj",
        consented: true,
      },
    });
    expect(res.status()).toBe(422);
  });

  test("rejects suppressed phone number", async ({ request }) => {
    const res = await request.post("/api/leads", {
      data: {
        name: "Opted Out",
        phone: "+919000000000",
        city: "Mumbai",
        language: "Hindi",
        interest: "Both",
        consented: true,
      },
    });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/opted out/i);
  });
});

test.describe("Dispatch API — duplicate prevention", () => {
  test.beforeEach(async ({ request }) => {
    await resetStore(request);
  });

  test("skips duplicate tasks on repeat broadcast", async ({ request }) => {
    const payload = {
      messageText: "Duplicate test message",
      targetSegment: "Mumbai",
      segmentType: "city",
    };

    const first = await request.post("/api/dispatch", { data: payload });
    expect(first.ok()).toBeTruthy();
    const firstBody = await first.json();
    expect(firstBody.tasks.length).toBe(2);
    expect(firstBody.skippedDuplicates).toBe(0);

    const second = await request.post("/api/dispatch", { data: payload });
    expect(second.ok()).toBeTruthy();
    const secondBody = await second.json();
    expect(secondBody.tasks.length).toBe(0);
    expect(secondBody.skippedDuplicates).toBe(2);
  });
});
