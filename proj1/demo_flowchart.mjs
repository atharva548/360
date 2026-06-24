/**
 * Walkthrough demo for each node in the GrowRev flowchart.
 * Mirrors proj1 Python logic (no Gemini required — uses representative proposals).
 */

const CAPS = {
  max_daily_budget_shift: 500,
  max_changes_per_week: 3,
  min_conversions_before_acting: 50,
  min_impressions_before_acting: 10_000,
  spend_ceiling_per_campaign: 5_000,
  emergency_kill_switch_active: false,
};

const METRICS = [
  { campaign_id: "camp_001", platform: "META", spend: 3200, cpa: 85, ctr: 0.012, conversions: 65, impressions: 45_000, daily_budget: 400, status: "ACTIVE" },
  { campaign_id: "camp_002", platform: "GOOGLE", spend: 2800, cpa: 92, ctr: 0.009, conversions: 55, impressions: 38_000, daily_budget: 350, status: "ACTIVE" },
  { campaign_id: "camp_003", platform: "META", spend: 4100, cpa: 18, ctr: 0.045, conversions: 228, impressions: 120_000, daily_budget: 500, status: "ACTIVE" },
  { campaign_id: "camp_004", platform: "GOOGLE", spend: 3600, cpa: 22, ctr: 0.038, conversions: 164, impressions: 95_000, daily_budget: 450, status: "ACTIVE" },
  { campaign_id: "camp_005", platform: "META", spend: 120, cpa: 60, ctr: 0.015, conversions: 2, impressions: 800, daily_budget: 100, status: "ACTIVE" },
];

function cloneCampaigns() {
  return Object.fromEntries(METRICS.map((m) => [m.campaign_id, { ...m }]));
}

function cloneHistory() {
  return Object.fromEntries(METRICS.map((m) => [m.campaign_id, { changes_this_week: 0, last_change_at: null }]));
}

function hr(title) {
  console.log("\n" + "=".repeat(72));
  console.log(`  ${title}`);
  console.log("=".repeat(72));
}

function evaluateProposal(proposal, caps, campaigns, history) {
  if (caps.emergency_kill_switch_active) {
    return { status: "REJECTED", code: "KILL_SWITCH_TRIGGERED", reason: "CRITICAL: Brand Emergency Kill Switch is ACTIVE." };
  }
  const c = campaigns[proposal.campaign_id];
  if (!c) return { status: "REJECTED", code: "INVALID_VALUE", reason: `Unknown campaign: ${proposal.campaign_id}` };
  if (c.conversions < caps.min_conversions_before_acting || c.impressions < caps.min_impressions_before_acting) {
    return { status: "REJECTED", code: "INSUFFICIENT_DATA", reason: `Insufficient data: ${c.conversions} conv (min ${caps.min_conversions_before_acting}), ${c.impressions} impr (min ${caps.min_impressions_before_acting})` };
  }
  const entry = history[proposal.campaign_id] ?? { changes_this_week: 0 };
  if (entry.changes_this_week >= caps.max_changes_per_week) {
    return { status: "REJECTED", code: "WEEKLY_LIMIT_EXCEEDED", reason: `Weekly change limit reached (${caps.max_changes_per_week}/week)` };
  }
  if (proposal.action_type === "PAUSE") {
    if (c.status === "PAUSED") return { status: "REJECTED", code: "INVALID_VALUE", reason: "Campaign is already paused" };
    return { status: "APPROVED", code: null, reason: null };
  }
  const shift = Math.abs(proposal.target_value - c.daily_budget);
  if (shift > caps.max_daily_budget_shift) {
    return { status: "ESCALATED", code: "BUDGET_SHIFT_BREACH", reason: `Budget shift $${shift.toFixed(2)} exceeds max daily shift ($${caps.max_daily_budget_shift.toFixed(2)})` };
  }
  if (proposal.target_value > caps.spend_ceiling_per_campaign) {
    return { status: "ESCALATED", code: "SPEND_CEILING_BREACH", reason: `Target budget $${proposal.target_value.toFixed(2)} exceeds spend ceiling ($${caps.spend_ceiling_per_campaign.toFixed(2)})` };
  }
  return { status: "APPROVED", code: null, reason: null };
}

function execute(decision, campaigns, history, metrics, auditLog, snapshots) {
  if (decision.status !== "APPROVED") return null;
  const p = decision.proposal;
  const c = campaigns[p.campaign_id];
  const actionId = `act-${Math.random().toString(36).slice(2, 10)}`;
  const original = { ...c };
  snapshots[actionId] = { ...original };
  const newState = { ...c };
  if (p.action_type === "PAUSE") newState.status = "PAUSED";
  else newState.daily_budget = p.target_value;
  campaigns[p.campaign_id] = newState;
  history[p.campaign_id].changes_this_week += 1;
  const result = {
    action_id: actionId,
    status: "APPROVED",
    original_state: original,
    new_state: newState,
    triggering_metrics: metrics[p.campaign_id],
    rationale: p.rationale,
    timestamp: new Date().toISOString(),
    rolled_back: false,
  };
  auditLog.push(result);
  return result;
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  console.log(headers.map((h, i) => h.padEnd(widths[i])).join("  "));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(row.map((c, i) => String(c).padEnd(widths[i])).join("  "));
}

function printDecision(proposal, decision) {
  const code = decision.code ?? "-";
  console.log(`  ${proposal.campaign_id}  ${proposal.action_type.padEnd(13)}  ${decision.status.padEnd(10)}  ${code}`);
  if (decision.reason) console.log(`    └─ ${decision.reason}`);
}

// ── 1. INGEST ──────────────────────────────────────────────────────────────
hr("1. INGEST  (mock_data.py → CampaignMetrics batch)");
console.log("\n  Source: MOCK_CAMPAIGNS (Meta + Google fixture data)\n");
printTable(
  ["ID", "Platform", "CPA", "Conv", "Impr", "Budget", "Status"],
  METRICS.map((m) => [m.campaign_id, m.platform, `$${m.cpa}`, m.conversions, m.impressions.toLocaleString(), `$${m.daily_budget}`, m.status])
);

// ── 2. PROPOSE ─────────────────────────────────────────────────────────────
hr("2. PROPOSE  (llm_agent.py → ActionProposal[])");
console.log("\n  Source: Representative Gemini output (same shape as live LLM pass)\n");
const legitimateProposals = [
  { campaign_id: "camp_003", action_type: "SHIFT_BUDGET", target_value: 700, rationale: "Low CPA winner ($18) — increase budget +$200 to scale" },
  { campaign_id: "camp_004", action_type: "SHIFT_BUDGET", target_value: 550, rationale: "Strong performer ($22 CPA) — modest budget increase" },
  { campaign_id: "camp_001", action_type: "PAUSE", target_value: 0, rationale: "High CPA loser ($85) — pause to stop waste" },
  { campaign_id: "camp_002", action_type: "PAUSE", target_value: 0, rationale: "High CPA loser ($92) — pause to stop waste" },
];
printTable(
  ["Campaign", "Action", "Target", "Rationale"],
  legitimateProposals.map((p) => [p.campaign_id, p.action_type, p.action_type === "PAUSE" ? "PAUSE" : `$${p.target_value}`, p.rationale.slice(0, 45) + "..."])
);

// ── 3a. POLICY → APPROVED ──────────────────────────────────────────────────
hr("3a. POLICY → APPROVED  (policy_engine.py)");
console.log("\n  All 4 legitimate proposals pass caps → forwarded to executor\n");
const db1 = cloneCampaigns();
const hist1 = cloneHistory();
for (const p of legitimateProposals) {
  printDecision(p, evaluateProposal(p, CAPS, db1, hist1));
}

// ── 3b. POLICY → REJECTED ──────────────────────────────────────────────────
hr("3b. POLICY → REJECTED  (policy_engine.py → No execution)");
console.log("\n  Insufficient-data campaign: LLM wrongly proposes PAUSE on camp_005\n");
const rejectProposal = { campaign_id: "camp_005", action_type: "PAUSE", target_value: 0, rationale: "[ROGUE] Pause campaign with zero historical data." };
const rejectDecision = evaluateProposal(rejectProposal, CAPS, cloneCampaigns(), cloneHistory());
printDecision(rejectProposal, rejectDecision);
console.log("\n  ✗ Executor NOT called — DB unchanged (camp_005 stays ACTIVE)");

// ── 3c. POLICY → ESCALATED ─────────────────────────────────────────────────
hr("3c. POLICY → ESCALATED  (policy_engine.py → Human queue, no execution)");
console.log("\n  Out-of-bounds budget shift on winner camp_003\n");
const escalateProposal = { campaign_id: "camp_003", action_type: "SHIFT_BUDGET", target_value: 2001, rationale: "[TEST] Shift of $1,501 exceeds max_daily_budget_shift ($500)" };
const escalateDecision = evaluateProposal(escalateProposal, CAPS, cloneCampaigns(), cloneHistory());
printDecision(escalateProposal, escalateDecision);
console.log("\n  ✗ Executor NOT called — budget stays $500, queued for human review");

// ── 4. EXECUTE ─────────────────────────────────────────────────────────────
hr("4. EXECUTE  (executor.py — APPROVED only)");
console.log("\n  Applying approved proposals to mock campaign DB...\n");
const db = cloneCampaigns();
const history = cloneHistory();
const metricsById = Object.fromEntries(METRICS.map((m) => [m.campaign_id, m]));
const auditLog = [];
const snapshots = {};
const executed = [];

for (const p of legitimateProposals) {
  const decision = { proposal: p, ...evaluateProposal(p, CAPS, db, history) };
  if (decision.status === "APPROVED") {
    const result = execute(decision, db, history, metricsById, auditLog, snapshots);
    if (result) {
      executed.push(result);
      const o = result.original_state;
      const n = result.new_state;
      console.log(`  EXECUTED  ${result.action_id}`);
      console.log(`    ${o.campaign_id}: budget $${o.daily_budget} → $${n.daily_budget}, status ${o.status} → ${n.status}`);
    }
  }
}
console.log("\n  Campaign DB after executions:");
printTable(
  ["Campaign", "Budget", "Status", "CPA"],
  Object.values(db).sort((a, b) => a.campaign_id.localeCompare(b.campaign_id)).map((c) => [c.campaign_id, `$${c.daily_budget}`, c.status, `$${c.cpa}`])
);

// ── 5. BLOCK ───────────────────────────────────────────────────────────────
hr("5. BLOCK  (REJECTED / ESCALATED — executor skipped)");
console.log("\n  Attempting to execute blocked decisions on current DB snapshot...\n");
const dbBefore = JSON.stringify(db);
const blocked = [
  { proposal: rejectProposal, ...rejectDecision },
  { proposal: escalateProposal, ...escalateDecision },
  { proposal: { campaign_id: "camp_ghost", action_type: "SHIFT_BUDGET", target_value: 10000, rationale: "[ROGUE] Non-existent campaign" }, ...evaluateProposal({ campaign_id: "camp_ghost", action_type: "SHIFT_BUDGET", target_value: 10000, rationale: "" }, CAPS, db, history) },
];
let blockedCount = 0;
for (const d of blocked) {
  const result = execute(d, db, history, metricsById, auditLog, snapshots);
  if (!result) {
    blockedCount++;
    console.log(`  BLOCKED  ${d.proposal.campaign_id}  ${d.status}  (${d.code})  → executor returned null`);
  }
}
const dbUnchanged = JSON.stringify(db) === dbBefore;
console.log(`\n  ${blockedCount}/${blocked.length} blocked proposals — mock DB ${dbUnchanged ? "UNCHANGED ✓" : "MUTATED ✗"}`);

// ── 6. AUDIT ───────────────────────────────────────────────────────────────
hr("6. AUDIT  (ExecutionResult + snapshots + rollback)");
console.log(`\n  Audit log entries: ${auditLog.length}\n`);
for (const entry of auditLog) {
  console.log(`  action_id:     ${entry.action_id}`);
  console.log(`  timestamp:     ${entry.timestamp}`);
  console.log(`  rationale:     ${entry.rationale.slice(0, 60)}...`);
  console.log(`  metrics:       CPA $${entry.triggering_metrics.cpa}, ${entry.triggering_metrics.conversions} conv, ${entry.triggering_metrics.impressions.toLocaleString()} impr`);
  console.log(`  before:        budget $${entry.original_state.daily_budget}, status ${entry.original_state.status}`);
  console.log(`  after:         budget $${entry.new_state.daily_budget}, status ${entry.new_state.status}`);
  console.log(`  snapshot:      saved ✓  (enables rollback)`);
  console.log("");
}

if (executed.length > 0) {
  const rollbackId = executed[0].action_id;
  const cid = executed[0].original_state.campaign_id;
  const before = { ...db[cid] };
  db[cid] = { ...snapshots[rollbackId] };
  history[cid].changes_this_week -= 1;
  console.log(`  ROLLBACK  ${rollbackId}`);
  console.log(`    ${cid}: budget $${before.daily_budget} → $${db[cid].daily_budget}, status ${before.status} → ${db[cid].status}`);
  console.log("    Campaign restored to pre-action snapshot ✓");
}

hr("FLOW COMPLETE");
console.log("\n  Ingest → Propose → Policy → Execute/Block → Audit");
console.log("  Money trust boundary: only APPROVED actions mutate the DB.\n");
