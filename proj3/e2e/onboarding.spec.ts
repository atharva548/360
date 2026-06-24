import { expect, test } from "@playwright/test";

const EXPECTED_COMMUNITY = "Atlas Mumbai — Umrah Pilgrims (Hindi)";
const EXPECTED_INVITE_PREFIX = "https://chat.whatsapp.com/InviteMumbaiHindi02";

async function resetStore(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/test/reset");
  expect(res.ok()).toBeTruthy();
}

test.describe("Public gateway — onboarding to community invite", () => {
  test.beforeEach(async ({ request }) => {
    await resetStore(request);
  });

  test("pilgrim completes form and receives WhatsApp invite link", async ({ page }) => {
    const pilgrimName = "Demo User E2E";
    const pilgrimPhone = "+919988776655";

    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Your journey to the/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Join Your Community" })).toBeVisible();

    await page.getByLabel("Full Name").fill(pilgrimName);
    await page.getByLabel("WhatsApp Number").fill(pilgrimPhone);
    await page.getByLabel("City").selectOption("Mumbai");
    await page.getByLabel("Preferred Language").selectOption("Hindi");
    await page.getByLabel("Pilgrimage Interest").selectOption("Umrah");
    await page.getByRole("checkbox").check();

    await page.getByRole("button", { name: "Join Your Community →" }).click();

    await expect(page.getByRole("heading", { name: /You're all set, Demo!/i })).toBeVisible();
    await expect(page.getByText("Your Community")).toBeVisible();
    await expect(page.getByText(EXPECTED_COMMUNITY)).toBeVisible();

    const inviteLink = page.getByTestId("whatsapp-join-link");
    await expect(inviteLink).toBeVisible();
    await expect(inviteLink).toHaveAttribute("data-invite-link", EXPECTED_INVITE_PREFIX);

    const communitiesResponse = await page.request.get("/api/communities");
    expect(communitiesResponse.ok()).toBeTruthy();

    const { leads, communities } = await communitiesResponse.json();
    const lead = leads.find(
      (entry: { name: string }) => entry.name === pilgrimName
    );
    expect(lead).toBeDefined();
    expect(lead.routedCommunityId).toBe("comm-mumbai-hindi-02");
    expect(lead.consented).toBe(true);
    expect(lead.phone).toBe(pilgrimPhone);

    const community = communities.find(
      (entry: { id: string }) => entry.id === "comm-mumbai-hindi-02"
    );
    expect(community).toBeDefined();
    expect(community.name).toBe(EXPECTED_COMMUNITY);
    expect(community.inviteLink).toBe(EXPECTED_INVITE_PREFIX);
  });
});
