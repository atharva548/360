import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LanguageCode } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUTCOMES_FILE = join(DATA_DIR, 'call_outcomes.jsonl');

export interface CallOutcomeRecord {
  sessionId: string;
  phoneNumber: string;
  rollId: string;
  studentName: string;
  language: LanguageCode;
  channel: 'live' | 'cli';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  turnCount: number;
  compliancePassed: boolean;
  toolsInvoked: string[];
  avgTurnLatencyMs: number | null;
  resolution: 'completed' | 'blocked_dpdp' | 'not_found' | 'unverified_caller' | 'error';
  transcriptSummary: string[];
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

/** Append one call outcome — mock write-back to the student system of record. */
export function logCallOutcome(record: CallOutcomeRecord): void {
  ensureDataDir();
  appendFileSync(OUTCOMES_FILE, `${JSON.stringify(record)}\n`, 'utf-8');
}

export function listCallOutcomes(limit = 50): CallOutcomeRecord[] {
  if (!existsSync(OUTCOMES_FILE)) return [];
  const lines = readFileSync(OUTCOMES_FILE, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.slice(-limit).map((line) => JSON.parse(line) as CallOutcomeRecord);
}

/** In-memory session tracker for live WebSocket calls. */
export class CallSessionTracker {
  private readonly startedAt = Date.now();
  private readonly toolsInvoked: string[] = [];
  private readonly latencies: number[] = [];
  private readonly transcript: string[] = [];
  private turnCount = 0;
  private rollId: string;
  private studentName: string;
  private language: LanguageCode;

  constructor(
    readonly sessionId: string,
    readonly phoneNumber: string,
    rollId: string,
    studentName: string,
    language: LanguageCode,
    readonly channel: 'live' | 'cli'
  ) {
    this.rollId = rollId;
    this.studentName = studentName;
    this.language = language;
  }

  recordTool(tool: string, lookupMs: number): void {
    this.toolsInvoked.push(tool);
    this.latencies.push(lookupMs);
  }

  recordTurnLatency(ms: number): void {
    this.latencies.push(ms);
    this.turnCount += 1;
  }

  recordTranscript(role: 'user' | 'agent', text: string): void {
    this.transcript.push(`${role}: ${text.slice(0, 120)}`);
  }

  setVerifiedStudent(student: { rollId: string; name: string; languagePreference: LanguageCode }): void {
    this.rollId = student.rollId;
    this.studentName = student.name;
    this.language = student.languagePreference;
  }

  finalize(compliancePassed: boolean, resolution: CallOutcomeRecord['resolution']): CallOutcomeRecord {
    const endedAt = new Date();
    const avg =
      this.latencies.length > 0
        ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
        : null;

    const record: CallOutcomeRecord = {
      sessionId: this.sessionId,
      phoneNumber: this.phoneNumber,
      rollId: this.rollId,
      studentName: this.studentName,
      language: this.language,
      channel: this.channel,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: Date.now() - this.startedAt,
      turnCount: this.turnCount,
      compliancePassed,
      toolsInvoked: [...this.toolsInvoked],
      avgTurnLatencyMs: avg,
      resolution,
      transcriptSummary: this.transcript.slice(-10),
    };

    logCallOutcome(record);
    return record;
  }
}

/** Reset outcomes file (dev helper). */
export function clearOutcomes(): void {
  ensureDataDir();
  writeFileSync(OUTCOMES_FILE, '', 'utf-8');
}
