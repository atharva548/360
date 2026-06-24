from __future__ import annotations

import copy
from pathlib import Path

from dotenv import load_dotenv
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from growrev.candidate_rules import generate_candidates
from growrev.executor import ReversibleExecutor
from growrev.llm_agent import GrowRevAgent, prioritize_mock
from growrev.mock_data import (
    DEFAULT_BRAND_CAPS,
    MOCK_CAMPAIGNS,
    build_campaign_history,
    build_initial_db,
    deep_copy_db,
)
from growrev.models import (
    ActionProposal,
    BrandCaps,
    KILL_SWITCH_VIOLATION_MESSAGE,
    PolicyDecision,
    ViolationType,
)
from growrev.policy_engine import evaluate_proposals

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

console = Console()


def main() -> None:
    console.print(
        Panel.fit(
            "[bold cyan]GrowRev Control Loop Demo[/bold cyan]\n"
            "Rules -> LLM prioritize -> Policy gates -> Executor applies (with rollback proof)",
            border_style="cyan",
        )
    )

    caps = DEFAULT_BRAND_CAPS
    metrics = MOCK_CAMPAIGNS
    db = build_initial_db()
    history = build_campaign_history()

    _print_metrics_table(metrics)

    # --- Legitimate pipeline ---
    console.print("\n[bold yellow]Phase 1: Rule-Based Candidates[/bold yellow]")
    candidates, skipped = generate_candidates(metrics, caps)
    _print_candidates_table(candidates)
    if skipped:
        console.print(f"  [dim]{len(skipped)} campaign(s) skipped by rules[/dim]")

    console.print("\n[bold yellow]Phase 2: LLM Prioritize & Explain (Gemini)[/bold yellow]")
    agent = GrowRevAgent(caps=caps)
    try:
        proposals, llm_meta = agent.prioritize(candidates, metrics)
        console.print(f"  [dim]Source: {llm_meta.get('source', 'unknown')}[/dim]")
    except Exception:
        proposals, llm_meta = prioritize_mock(candidates, metrics)
        console.print(f"  [dim]Gemini unavailable - using {llm_meta.get('source')}[/dim]")
    _print_proposals_table(proposals, title="Prioritized LLM Output")

    console.print("\n[bold yellow]Phase 3: Policy Engine Evaluation[/bold yellow]")
    db_before_policy = deep_copy_db(db)
    history_before_policy = copy.deepcopy(history)
    decisions = evaluate_proposals(proposals, caps, db, history)
    _assert_policy_read_only(db, db_before_policy, history, history_before_policy)
    _print_decisions_table(decisions)

    console.print("\n[bold yellow]Phase 4: Execute Approved Actions[/bold yellow]")
    executor = ReversibleExecutor(campaigns=db, history=history)
    metrics_by_id = {m.campaign_id: m for m in metrics}
    executed: list[str] = []

    for decision in decisions:
        m = metrics_by_id[decision.proposal.campaign_id]
        result = executor.execute(decision, m)
        if result:
            executed.append(result.action_id)
            _print_execution(result)

    _print_db_state(executor, "Campaign DB After Legitimate Executions")

    # --- Rollback proof ---
    if executed:
        console.print("\n[bold yellow]Phase 5: Rollback Proof[/bold yellow]")
        rollback_id = executed[0]
        first_decision = next(d for d in decisions if d.status == "APPROVED")
        cid = first_decision.proposal.campaign_id
        before_rollback = copy.deepcopy(executor.get_campaign(cid))

        executor.rollback(rollback_id)
        after_rollback = executor.get_campaign(cid)

        console.print(
            Panel(
                f"[green]Rolled back action[/green] [dim]{rollback_id[:8]}...[/dim]\n"
                f"Campaign [bold]{cid}[/bold] restored:\n"
                f"  Budget: [red]${before_rollback.daily_budget:.2f}[/red] -> "
                f"[green]${after_rollback.daily_budget:.2f}[/green]\n"
                f"  Status: [red]{before_rollback.status}[/red] -> "
                f"[green]{after_rollback.status}[/green]",
                title="Rollback Successful",
                border_style="green",
            )
        )

        executor.execute(first_decision, metrics_by_id[cid])

    # --- Scenario A: Escalation & Rejection Path ---
    console.print(
        "\n[bold yellow]Phase 6: Scenario A - Escalation & Rejection Path[/bold yellow]"
    )
    console.print(
        "[dim]Crafted proposals: out-of-bounds budget shift (ESCALATED) "
        "and insufficient-data pause (REJECTED).[/dim]\n"
    )

    scenario_a_db = build_initial_db()
    scenario_a_history = build_campaign_history()
    escalation_proposals = _build_escalation_scenario_proposals(caps)
    _print_proposals_table(escalation_proposals, title="Scenario A Proposals")

    scenario_a_decisions = evaluate_proposals(
        escalation_proposals, caps, scenario_a_db, scenario_a_history
    )
    _print_decisions_table(scenario_a_decisions, highlight_blocked=True)

    _print_scenario_a_verdict(scenario_a_decisions)

    # --- Scenario B: Emergency Kill Switch ---
    console.print(
        "\n[bold yellow]Phase 7: Scenario B - Emergency Kill Switch[/bold yellow]"
    )
    console.print(
        "[dim]Flipping emergency_kill_switch_active=True on otherwise legitimate proposals.[/dim]\n"
    )

    kill_switch_caps = caps.model_copy(update={"emergency_kill_switch_active": True})
    kill_switch_db = build_initial_db()
    kill_switch_history = build_campaign_history()
    legitimate_for_kill_test = proposals

    console.print(
        Panel(
            f"[bold red]KILL SWITCH ACTIVE[/bold red] on brand caps\n"
            f"Proposals under test: {len(legitimate_for_kill_test)} legitimate LLM outputs",
            border_style="red",
        )
    )
    _print_proposals_table(
        legitimate_for_kill_test, title="Legitimate Proposals (Pre-Kill-Switch)"
    )

    kill_switch_decisions = evaluate_proposals(
        legitimate_for_kill_test, kill_switch_caps, kill_switch_db, kill_switch_history
    )
    _print_decisions_table(kill_switch_decisions, highlight_blocked=True)
    _print_kill_switch_verdict(kill_switch_decisions, kill_switch_db)

    # --- Adversarial test ---
    console.print(
        "\n[bold red]Phase 8: Adversarial Test - Rogue LLM Payload[/bold red]"
    )
    console.print(
        "[dim]Simulating a hallucinated/malicious LLM response that violates brand caps...[/dim]\n"
    )

    db_snapshot_before = deep_copy_db(executor.campaigns)
    adversarial = _build_adversarial_proposals()
    _print_proposals_table(adversarial, title="Forged Malicious Proposals")

    adv_decisions = evaluate_proposals(adversarial, caps, executor.campaigns, history)
    _print_decisions_table(adv_decisions, highlight_blocked=True)

    blocked_count = sum(1 for d in adv_decisions if d.status != "APPROVED")
    for decision in adv_decisions:
        m = metrics_by_id.get(decision.proposal.campaign_id)
        if m is None:
            m = metrics[0]
        executor.execute(decision, m)

    db_unchanged = _db_equals(db_snapshot_before, executor.campaigns)
    adversarial_campaigns_touched = _adversarial_db_diff(
        db_snapshot_before, executor.campaigns, adversarial
    )

    summary = Table(title="Money Trust Boundary - Result", box=box.DOUBLE_EDGE)
    summary.add_column("Check", style="bold")
    summary.add_column("Result")
    summary.add_row(
        "Adversarial proposals blocked",
        f"[green]{blocked_count}/{len(adv_decisions)} blocked[/green]",
    )
    summary.add_row(
        "Mock DB unchanged by rogue actions",
        "[green]PASS[/green]" if db_unchanged else "[red]FAIL - DB was mutated[/red]",
    )
    summary.add_row(
        "Campaigns targeted by adversarial payload",
        ", ".join(p.campaign_id for p in adversarial) if adversarial else "none",
    )
    if not db_unchanged:
        summary.add_row(
            "Mutated campaigns",
            ", ".join(adversarial_campaigns_touched) or "unknown",
        )
    console.print(summary)

    console.print(
        Panel.fit(
            "[bold green]Demo complete.[/bold green] "
            "Legitimate actions executed; escalation, kill switch, and rogue payloads "
            "caught by the deterministic policy node.",
            border_style="green",
        )
    )


def _build_escalation_scenario_proposals(caps: BrandCaps) -> list[ActionProposal]:
    """Out-of-bounds shift (ESCALATED) + insufficient-data pause (REJECTED)."""
    camp_003 = next(m for m in MOCK_CAMPAIGNS if m.campaign_id == "camp_003")
    oob_target = camp_003.daily_budget + caps.max_daily_budget_shift + 1_000.0

    return [
        ActionProposal(
            campaign_id="camp_003",
            action_type="SHIFT_BUDGET",
            target_value=oob_target,
            rationale=(
                f"[TEST] Budget shift of ${oob_target - camp_003.daily_budget:.0f} "
                f"exceeds max_daily_budget_shift (${caps.max_daily_budget_shift:.0f})."
            ),
        ),
        ActionProposal(
            campaign_id="camp_005",
            action_type="PAUSE",
            target_value=0.0,
            rationale="[TEST] Pause campaign with insufficient conversion/impression data.",
        ),
    ]


def _build_adversarial_proposals() -> list[ActionProposal]:
    return [
        ActionProposal(
            campaign_id="camp_003",
            action_type="SHIFT_BUDGET",
            target_value=50_500.0,
            rationale="[ROGUE] Scale winner budget by $50,000 immediately!",
        ),
        ActionProposal(
            campaign_id="camp_005",
            action_type="PAUSE",
            target_value=0.0,
            rationale="[ROGUE] Pause campaign with zero historical data.",
        ),
        ActionProposal(
            campaign_id="camp_ghost",
            action_type="SHIFT_BUDGET",
            target_value=10_000.0,
            rationale="[ROGUE] Target non-existent campaign.",
        ),
    ]


def _print_scenario_a_verdict(decisions: list[PolicyDecision]) -> None:
    escalation = next(
        (d for d in decisions if d.proposal.campaign_id == "camp_003"), None
    )
    rejection = next(
        (d for d in decisions if d.proposal.campaign_id == "camp_005"), None
    )

    table = Table(title="Scenario A Verification", box=box.SIMPLE)
    table.add_column("Check", style="bold")
    table.add_column("Expected")
    table.add_column("Actual")

    esc_ok = (
        escalation is not None
        and escalation.status == "ESCALATED"
        and escalation.violation_code == ViolationType.BUDGET_SHIFT_BREACH
    )
    rej_ok = (
        rejection is not None
        and rejection.status == "REJECTED"
        and rejection.violation_code == ViolationType.INSUFFICIENT_DATA
    )

    table.add_row(
        "Out-of-bounds budget shift",
        "ESCALATED / BUDGET_SHIFT_BREACH",
        _verdict_cell(esc_ok, escalation),
    )
    table.add_row(
        "Insufficient-data pause",
        "REJECTED / INSUFFICIENT_DATA",
        _verdict_cell(rej_ok, rejection),
    )
    console.print(table)


def _print_kill_switch_verdict(
    decisions: list[PolicyDecision],
    db: dict,
) -> None:
    all_rejected = all(d.status == "REJECTED" for d in decisions)
    all_kill_code = all(
        d.violation_code == ViolationType.KILL_SWITCH_TRIGGERED for d in decisions
    )
    all_correct_message = all(
        d.violation_reason == KILL_SWITCH_VIOLATION_MESSAGE for d in decisions
    )
    db_pristine = all(c.status == "ACTIVE" for c in db.values())

    table = Table(title="Scenario B Verification", box=box.SIMPLE)
    table.add_column("Check", style="bold")
    table.add_column("Result")

    table.add_row(
        "All proposals REJECTED",
        "[green]PASS[/green]" if all_rejected else "[red]FAIL[/red]",
    )
    table.add_row(
        "All violation_code = KILL_SWITCH_TRIGGERED",
        "[green]PASS[/green]" if all_kill_code else "[red]FAIL[/red]",
    )
    table.add_row(
        "Kill switch message propagated",
        "[green]PASS[/green]" if all_correct_message else "[red]FAIL[/red]",
    )
    table.add_row(
        "Campaign DB untouched (all ACTIVE)",
        "[green]PASS[/green]" if db_pristine else "[red]FAIL[/red]",
    )
    console.print(table)


def _verdict_cell(ok: bool, decision: PolicyDecision | None) -> str:
    if decision is None:
        return "[red]MISSING[/red]"
    code = decision.violation_code.value if decision.violation_code else "-"
    if ok:
        return f"[green]{decision.status} / {code}[/green]"
    return f"[red]{decision.status} / {code}[/red]"


def _assert_policy_read_only(db_before, db_after, history_before, history_after) -> None:
    assert _db_equals(db_before, db_after), "Policy engine mutated campaign DB"
    assert history_before.model_dump() == history_after.model_dump(), (
        "Policy engine mutated campaign history"
    )


def _print_metrics_table(metrics: list) -> None:
    table = Table(title="Input Campaign Metrics", box=box.ROUNDED)
    table.add_column("ID", style="cyan")
    table.add_column("Platform")
    table.add_column("Spend", justify="right")
    table.add_column("CPA", justify="right")
    table.add_column("CTR", justify="right")
    table.add_column("Conv", justify="right")
    table.add_column("Impr", justify="right")
    table.add_column("Budget", justify="right")
    table.add_column("Status")

    for m in metrics:
        cpa_style = "red" if m.cpa >= 70 else "green" if m.cpa <= 30 else "yellow"
        table.add_row(
            m.campaign_id,
            m.platform,
            f"${m.spend:,.0f}",
            Text(f"${m.cpa:.2f}", style=cpa_style),
            f"{m.ctr:.3f}",
            str(m.conversions),
            f"{m.impressions:,}",
            f"${m.daily_budget:.0f}",
            m.status,
        )
    console.print(table)


def _print_candidates_table(candidates) -> None:
    table = Table(title="Rule-Generated Candidates", box=box.ROUNDED)
    table.add_column("Rule")
    table.add_column("Campaign")
    table.add_column("Action")
    table.add_column("Target", justify="right")
    table.add_column("Reason")

    for c in candidates:
        target = "PAUSE" if c.action_type == "PAUSE" else f"${c.target_value:,.2f}"
        table.add_row(c.rule_id, c.campaign_id, c.action_type, target, c.rule_reason)

    if not candidates:
        table.add_row("[dim]none[/dim]", "", "", "", "")
    console.print(table)


def _print_proposals_table(proposals: list[ActionProposal], title: str) -> None:
    table = Table(title=title, box=box.ROUNDED)
    table.add_column("Campaign")
    table.add_column("Action")
    table.add_column("Target", justify="right")
    table.add_column("Rationale")

    for p in proposals:
        target = "PAUSE" if p.action_type == "PAUSE" else f"${p.target_value:,.2f}"
        table.add_row(p.campaign_id, p.action_type, target, p.rationale)

    if not proposals:
        table.add_row("[dim]none[/dim]", "", "", "")
    console.print(table)


def _print_decisions_table(
    decisions: list[PolicyDecision],
    highlight_blocked: bool = False,
) -> None:
    table = Table(title="Policy Decisions", box=box.ROUNDED)
    table.add_column("Campaign")
    table.add_column("Action")
    table.add_column("Status")
    table.add_column("Violation Code")
    table.add_column("Violation Reason")

    for d in decisions:
        status_style = {
            "APPROVED": "green",
            "REJECTED": "red",
            "ESCALATED": "yellow",
        }[d.status]
        status_text = Text(d.status, style=status_style)
        if highlight_blocked and d.status != "APPROVED":
            status_text = Text(f"BLOCKED ({d.status})", style="bold red")

        code = d.violation_code.value if d.violation_code else "-"
        table.add_row(
            d.proposal.campaign_id,
            d.proposal.action_type,
            status_text,
            Text(code, style="magenta" if d.violation_code else "dim"),
            d.violation_reason or "[dim]-[/dim]",
        )
    console.print(table)


def _print_execution(result) -> None:
    orig = result.original_state
    new = result.new_state
    console.print(
        Panel(
            f"Action [dim]{result.action_id[:8]}...[/dim]\n"
            f"Campaign [bold]{orig.campaign_id}[/bold]: "
            f"budget ${orig.daily_budget:.2f} -> ${new.daily_budget:.2f}, "
            f"status {orig.status} -> {new.status}\n"
            f"[dim]{result.rationale}[/dim]",
            title="[green]EXECUTED[/green]",
            border_style="green",
        )
    )


def _print_db_state(executor: ReversibleExecutor, title: str) -> None:
    table = Table(title=title, box=box.SIMPLE)
    table.add_column("Campaign")
    table.add_column("Budget", justify="right")
    table.add_column("Status")
    table.add_column("CPA", justify="right")

    for cid, state in sorted(executor.campaigns.items()):
        table.add_row(
            cid,
            f"${state.daily_budget:.2f}",
            state.status,
            f"${state.cpa:.2f}",
        )
    console.print(table)


def _db_equals(
    a: dict[str, object],
    b: dict[str, object],
) -> bool:
    if set(a.keys()) != set(b.keys()):
        return False
    for key in a:
        if a[key].model_dump() != b[key].model_dump():  # type: ignore[union-attr]
            return False
    return True


def _adversarial_db_diff(before, after, proposals: list[ActionProposal]) -> list[str]:
    changed = []
    for p in proposals:
        cid = p.campaign_id
        if cid in before and cid in after:
            if before[cid].model_dump() != after[cid].model_dump():
                changed.append(cid)
    return changed


if __name__ == "__main__":
    main()
