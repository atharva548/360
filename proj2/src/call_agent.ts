import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import {
  applyVerifiedStudent,
  buildPendingSessionContext,
  evaluateCompliance,
  TRAI_CALL_RECORDING_DISCLOSURE,
} from './compliance_gate.js';
import {
  buildInboundOpeningLine,
  buildUnverifiedRejectLine,
  buildVerifiedWelcomeLine,
} from './prompts/agent_persona.js';
import { listAllStudents, verifyCallerIdentity } from './db_service.js';
import { CallSessionTracker } from './outcome_service.js';
import type { SessionContext, VoiceTurn } from './types.js';
import { isSessionVerified } from './types.js';
import { VoiceStreamEngine } from './voice_stream_engine.js';

const HANGUP_PATTERNS = [
  /^(\/bye|\/hangup|bye|goodbye|exit|quit|hang up|end call)$/i,
  /^(धन्यवाद|अलविदा|कॉल समाप्त|बंद करो)$/,
];

export class CallAgent {
  private readonly engine = new VoiceStreamEngine();
  private session: SessionContext | null = null;
  private tracker: CallSessionTracker | null = null;
  private readonly turnHistory: VoiceTurn[] = [];
  private callActive = false;
  private verified = false;

  async run(rl: readline.Interface): Promise<void> {
    printBanner();
    this.printSampleCallers();

    const phoneRaw = await ask(
      rl,
      chalk.cyan('\n📞 Inbound call — caller ID (any number, Enter for unknown): ')
    );
    const phone = phoneRaw?.trim() || `unknown-${Date.now()}`;

    const sessionId = `sess-${Date.now()}`;
    this.session = buildPendingSessionContext(sessionId, phone);
    this.tracker = new CallSessionTracker(sessionId, phone, 'pending', 'Unknown', 'hi', 'cli');
    this.callActive = true;

    console.log(chalk.dim(`\n[CALL] Inbound ${phone} — say hello to start`));
    console.log(chalk.gray('(Connected — waiting for you to speak first)\n'));

    const helloRaw = await ask(rl, chalk.white.bold('You: '));
    const hello = helloRaw?.trim() ?? '';
    if (!hello) {
      console.log(chalk.yellow('[CALL] No greeting. Call ended.'));
      this.endCall('no greeting', 'unverified_caller', false);
      return;
    }
    this.tracker?.recordTranscript('user', hello);

    console.log(chalk.green.bold('\n[AGENT] ') + chalk.green(buildInboundOpeningLine('hi')));

    const nameRaw = await ask(rl, chalk.white.bold('\nYou (say your name): '));
    const name = nameRaw?.trim() ?? '';
    if (!name) {
      console.log(chalk.yellow('[CALL] No name provided. Ending call.'));
      this.endCall('no name', 'unverified_caller', false);
      return;
    }

    this.tracker?.recordTranscript('user', name);
    const { student, lookupMs } = verifyCallerIdentity(name);
    console.log(chalk.dim(`[VERIFY] lookup ${lookupMs.toFixed(1)}ms`));

    if (!student) {
      const reject = buildUnverifiedRejectLine('hi');
      console.log(chalk.yellow.bold('\n[AGENT] ') + chalk.yellow(reject));
      this.tracker?.recordTranscript('agent', reject);
      this.endCall('not in registry', 'unverified_caller', false);
      return;
    }

    const compliance = evaluateCompliance({ sessionId, phoneNumber: phone, student });
    this.session = applyVerifiedStudent(this.session, student, compliance);
    this.tracker?.setVerifiedStudent(student);

    if (!compliance.passed) {
      const msg =
        compliance.whatsAppFallback?.messageTemplate ??
        'Parental consent required. Please check WhatsApp.';
      console.log(chalk.red.bold('\n[AGENT] ') + chalk.red(msg));
      this.tracker?.recordTranscript('agent', msg);
      this.endCall('dpdp block', 'blocked_dpdp', false);
      return;
    }

    this.verified = true;
    console.log(chalk.dim(`[VERIFY] ✓ ${student.name} (${student.rollId})`));
    console.log(chalk.cyan(`[TRAI] ${TRAI_CALL_RECORDING_DISCLOSURE}`));

    const welcome = buildVerifiedWelcomeLine(student.languagePreference, student.name);
    console.log(chalk.green.bold('\n[AGENT] ') + chalk.green(welcome));
    this.tracker?.recordTranscript('agent', welcome);

    console.log(
      chalk.gray(
        '\nAsk about exam center, admit card, schedule, registration, eligibility, or roll ID.\n' +
          'Prefix with ! to barge-in. Say goodbye to end.\n'
      )
    );

    while (this.callActive) {
      const raw = await ask(rl, chalk.white.bold('\nYou: '));
      if (raw === null) {
        this.endCall('stdin closed', 'completed', true);
        break;
      }

      const input = raw.trim();
      if (!input) continue;

      if (this.isHangup(input)) {
        await this.speakTurn(input);
        this.endCall('user hangup', 'completed', true);
        break;
      }

      const bargeIn = input.startsWith('!');
      const query = bargeIn ? input.slice(1).trim() : input;
      if (!query) continue;

      if (bargeIn && this.engine.isSpeaking()) {
        this.engine.handleBargeIn();
        console.log(chalk.magenta('[BARGE-IN] Interrupt.'));
      }

      this.tracker?.recordTranscript('user', query);
      await this.speakTurn(query);
    }

    this.printCallSummary();
  }

  private async speakTurn(userQuery: string): Promise<void> {
    if (!this.session || !isSessionVerified(this.session)) return;

    try {
      const { turn } = await this.engine.processTurn(this.session, userQuery);
      this.turnHistory.push(turn);
      this.tracker?.recordTurnLatency(turn.latencyMs);
      this.tracker?.recordTranscript('agent', turn.agentResponse);

      const label = this.session.language === 'hi' ? 'एजेंट' : 'Agent';
      console.log(chalk.green.bold(`\n${label}: `) + chalk.green(turn.agentResponse));
      console.log(chalk.dim(`  [${turn.latencyMs.toFixed(0)}ms | ${turn.groundedFieldsUsed.join(', ')}]`));
    } catch (err) {
      console.log(chalk.red(`[AGENT] Error: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  private isHangup(input: string): boolean {
    return HANGUP_PATTERNS.some((p) => p.test(input.trim()));
  }

  private endCall(
    reason: string,
    resolution: 'completed' | 'blocked_dpdp' | 'unverified_caller',
    compliancePassed: boolean
  ): void {
    if (!this.callActive && !this.tracker) return;
    this.callActive = false;
    console.log(chalk.gray(`\n[CALL] Disconnected (${reason}).`));
    const record = this.tracker?.finalize(compliancePassed, resolution);
    this.tracker = null;
    if (record) {
      console.log(chalk.cyan(`[OUTCOME] Logged → data/call_outcomes.jsonl`));
    }
  }

  private printCallSummary(): void {
    if (!this.verified || this.turnHistory.length === 0) return;
    console.log(chalk.cyan(`\n── Call summary: ${this.turnHistory.length} turn(s) ──`));
  }

  private printSampleCallers(): void {
    console.log(chalk.white.bold('Registered students (say name to verify):'));
    for (const s of listAllStudents()) {
      const flag = s.isMinor && !s.parentalConsent ? chalk.red(' [DPDP block if verified]') : '';
      console.log(chalk.gray(`  ${s.name} — Roll ${s.rollId}${flag}`));
    }
  }
}

function printBanner(): void {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  VidyaGyan — Inbound Call Simulator (verify by name)         ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝'));
}

async function ask(rl: readline.Interface, prompt: string): Promise<string | null> {
  try {
    return await rl.question(prompt);
  } catch {
    return null;
  }
}
