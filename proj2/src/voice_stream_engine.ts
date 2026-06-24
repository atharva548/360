import chalk from 'chalk';
import {
  executeStudentTool,
  formatToolResponseForVoice,
  intentToTool,
  type StudentToolName,
} from './student_tools.js';
import type {
  AudioStreamBuffer,
  LanguageCode,
  LatencyMetrics,
  SessionContext,
  StudentProfile,
  VoiceTurn,
} from './types.js';
import { isSessionVerified } from './types.js';

/** Sub-second turn target for CLI mock path (ms). */
const LATENCY_TARGET_MS = 500;
const CHUNK_PLAYBACK_MS = 45;

export type GroundedIntent =
  | 'greeting'
  | 'exam_center'
  | 'admit_card'
  | 'schedule'
  | 'registration'
  | 'eligibility'
  | 'roll_id'
  | 'help'
  | 'goodbye'
  | 'unknown';

/**
 * CLI mock voice engine — mirrors Live path via runtime tool execution + streaming playback.
 */
export class VoiceStreamEngine {
  private activeBuffer: AudioStreamBuffer | null = null;
  private interruptionRequested = false;
  private playbackTimer: ReturnType<typeof setTimeout> | null = null;

  async processTurn(
    session: SessionContext,
    userQuery: string,
    options: { simulateBargeInAtChunk?: number } = {}
  ): Promise<{ turn: VoiceTurn; metrics: LatencyMetrics; buffer: AudioStreamBuffer }> {
    if (!session.llmExecutionAllowed) {
      throw new Error('VoiceStreamEngine: voice path blocked.');
    }
    if (!isSessionVerified(session) || !session.student) {
      throw new Error('VoiceStreamEngine: caller not verified.');
    }

    const turnId = `turn-${Date.now()}`;
    const turnStart = performance.now();

    const intent = classifyIntent(userQuery);
    const toolName = intentToTool(intent);
    let response: string;
    let fieldsUsed: (keyof StudentProfile)[] = [];
    let toolLookupMs = 0;

    if (toolName) {
      const toolResult = executeStudentTool(session, toolName);
      toolLookupMs = toolResult.lookupMs;
      response = formatToolResponseForVoice(
        toolName,
        toolResult.data,
        session.language,
        session.student.name
      );
      fieldsUsed = toolResult.fieldsUsed;
    } else {
      const built = buildStaticResponse(session.student, intent, session.language);
      response = built.response;
      fieldsUsed = built.fieldsUsed;
    }

    const groundingMs = performance.now() - turnStart;
    const spokenText = formatForTts(response, session.language);
    const chunks = chunkTextForStream(spokenText, session.language);
    const buffer = this.createBuffer(session.sessionId, chunks, session.language);

    const simulatedTtsMs = 35 + Math.floor(Math.random() * 40);
    await delay(simulatedTtsMs);

    const totalMs = groundingMs + simulatedTtsMs;

    const turn: VoiceTurn = {
      turnId,
      sessionId: session.sessionId,
      userQuery,
      agentResponse: spokenText,
      language: session.language,
      latencyMs: totalMs,
      latencyWithinTarget: totalMs < LATENCY_TARGET_MS,
      interrupted: false,
      groundedFieldsUsed: fieldsUsed,
      timestamp: new Date(),
    };

    const metrics: LatencyMetrics = {
      turnId,
      dbLookupMs: toolLookupMs,
      complianceMs: 0,
      groundingMs,
      ttsFormatMs: simulatedTtsMs,
      totalMs,
      withinTarget: totalMs < LATENCY_TARGET_MS,
      targetMs: LATENCY_TARGET_MS,
    };

    logLatency(metrics, toolName);

    if (options.simulateBargeInAtChunk !== undefined) {
      await this.streamWithBargeIn(buffer, options.simulateBargeInAtChunk);
      turn.interrupted = true;
    } else {
      await this.streamToCompletion(buffer);
    }

    return { turn, metrics, buffer };
  }

  isSpeaking(): boolean {
    return this.activeBuffer?.isPlaying ?? false;
  }

  handleBargeIn(): void {
    this.interruptionRequested = true;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
    if (this.activeBuffer) {
      this.activeBuffer.isPlaying = false;
      this.activeBuffer.truncatedAt = this.activeBuffer.playbackPosition;
      console.log(
        chalk.magenta.bold(`[${isoNow()}] [BARGE-IN]`) +
          chalk.magenta(' Interrupt — flushing audio buffer.')
      );
    }
  }

  private createBuffer(
    sessionId: string,
    chunks: string[],
    language: LanguageCode
  ): AudioStreamBuffer {
    const buffer: AudioStreamBuffer = {
      bufferId: `buf-${Date.now()}`,
      sessionId,
      chunks,
      language,
      isPlaying: false,
      playbackPosition: 0,
      truncatedAt: null,
      totalDurationMs: chunks.length * CHUNK_PLAYBACK_MS,
    };
    this.activeBuffer = buffer;
    this.interruptionRequested = false;
    return buffer;
  }

  private async streamToCompletion(buffer: AudioStreamBuffer): Promise<void> {
    buffer.isPlaying = true;
    for (let i = 0; i < buffer.chunks.length; i++) {
      if (this.interruptionRequested) break;
      buffer.playbackPosition = i + 1;
      console.log(chalk.blueBright(`  ▶ ${buffer.chunks[i]}`));
      await delay(CHUNK_PLAYBACK_MS);
    }
    buffer.isPlaying = false;
  }

  private async streamWithBargeIn(buffer: AudioStreamBuffer, bargeInAtChunk: number): Promise<void> {
    buffer.isPlaying = true;
    for (let i = 0; i < buffer.chunks.length; i++) {
      if (this.interruptionRequested) break;
      buffer.playbackPosition = i + 1;
      if (i === bargeInAtChunk) {
        await delay(20);
        this.handleBargeIn();
        break;
      }
      await delay(CHUNK_PLAYBACK_MS);
    }
    buffer.isPlaying = false;
  }
}

function classifyIntent(query: string): GroundedIntent {
  const q = query.toLowerCase().trim();

  if (/^(hi|hello|hey|namaste|नमस्ते|हैलो)/i.test(q)) return 'greeting';
  if (/^(bye|goodbye|exit|quit|hang up|धन्यवाद|अलविदा|कॉल समाप्त)/i.test(q)) return 'goodbye';
  if (/help|madad|सहायता|क्या पूछ/i.test(q)) return 'help';
  if (/roll|रोल/i.test(q)) return 'roll_id';
  if (/eligib|पात्र/i.test(q)) return 'eligibility';
  if (/regist|पंजी/i.test(q)) return 'registration';
  if (/schedule|date|time|report|समय|तारीख|रिपोर्ट/i.test(q)) return 'schedule';
  if (/center|centre|केंद्र/i.test(q)) return 'exam_center';
  if (/admit|प्रवेश|एडमिट/i.test(q)) return 'admit_card';
  return 'unknown';
}

function buildStaticResponse(
  student: StudentProfile,
  intent: GroundedIntent,
  language: LanguageCode
): { response: string; fieldsUsed: (keyof StudentProfile)[] } {
  switch (intent) {
    case 'greeting':
      return language === 'hi'
        ? {
            response: `नमस्ते ${student.name}! मैं VidyaGyan की सहायिका हूँ। परीक्षा केंद्र, प्रवेश पत्र, पंजीकरण, पात्रता, या समय पूछें।`,
            fieldsUsed: ['name'],
          }
        : {
            response: `Hello ${student.name}! I'm VidyaGyan's voice assistant. I can help with exam center, admit card, registration, eligibility, or schedule.`,
            fieldsUsed: ['name'],
          };
    case 'goodbye':
      return language === 'hi'
        ? { response: `धन्यवाद ${student.name}! शुभकामनाएँ।`, fieldsUsed: ['name'] }
        : { response: `Thank you ${student.name}! Goodbye.`, fieldsUsed: ['name'] };
    case 'help':
      return language === 'hi'
        ? {
            response: `${student.name}, मैं परीक्षा केंद्र, प्रवेश पत्र, पंजीकरण, पात्रता, और समय बता सकती हूँ।`,
            fieldsUsed: ['name'],
          }
        : {
            response: `${student.name}, I can help with exam center, admit card, registration, eligibility, and schedule.`,
            fieldsUsed: ['name'],
          };
    default:
      return language === 'hi'
        ? {
            response: `${student.name}, कृपया परीक्षा केंद्र, प्रवेश पत्र, पंजीकरण, पात्रता, या समय के बारे में पूछें।`,
            fieldsUsed: ['name'],
          }
        : {
            response: `${student.name}, please ask about exam center, admit card, registration, eligibility, or schedule.`,
            fieldsUsed: ['name'],
          };
  }
}

export function formatForTts(text: string, language: LanguageCode): string {
  const prefix = language === 'hi' ? '[HI-TTS|Sarvam]' : '[EN-TTS|Gemini]';
  return `${prefix} ${text}`;
}

function chunkTextForStream(text: string, language: LanguageCode): string[] {
  const words = text.replace(/^\[[^\]]+\]\s*/, '').split(/\s+/);
  const chunkSize = language === 'hi' ? 5 : 6;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }
  return chunks.length > 0 ? chunks : [text];
}

function logLatency(metrics: LatencyMetrics, tool: StudentToolName | null): void {
  const color = metrics.withinTarget ? chalk.green : chalk.yellow;
  const toolLabel = tool ? ` tool=${tool}` : '';
  console.log(
    color(`[${isoNow()}] [LATENCY]`) +
      chalk.white(
        ` total=${metrics.totalMs.toFixed(1)}ms db=${metrics.dbLookupMs.toFixed(1)}ms` +
          ` target<${metrics.targetMs}ms${toolLabel}` +
          (metrics.withinTarget ? ' ✓' : ' ⚠')
      )
  );
}

function isoNow(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { LATENCY_TARGET_MS, classifyIntent };
