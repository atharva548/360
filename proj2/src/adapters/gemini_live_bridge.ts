import {
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  type FunctionCall,
  type FunctionResponse,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import {
  applyVerifiedStudent,
  evaluateCompliance,
  WHATSAPP_PARENT_CONSENT_TEMPLATE,
} from '../compliance_gate.js';
import { verifyCallerIdentity } from '../db_service.js';
import { toolPersonaReminder } from '../prompts/agent_persona.js';
import { buildVidyagyanSystemPrompt } from '../prompts/vidyagyan_system_prompt.js';
import type { CallSessionTracker } from '../outcome_service.js';
import { executeStudentTool, LIVE_TOOL_DECLARATIONS } from '../student_tools.js';
import type { SessionContext, StudentProfile } from '../types.js';

export interface GeminiLiveEvents {
  onOpen?: () => void;
  onAudio?: (base64Pcm: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onTurnComplete?: () => void;
  onToolCall?: (tool: string, lookupMs: number) => void;
  onVerified?: (student: StudentProfile) => void;
  onVerificationFailed?: (reason: 'not_in_registry' | 'blocked_dpdp') => void;
  onCallEnding?: () => void;
  onLatency?: (phase: string, ms: number) => void;
  onError?: (message: string) => void;
  onClose?: (reason: string) => void;
}

const DEFAULT_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_VOICE_NAME = 'Aoede';
const END_CALL_DELAY_MS = 4500;

export class GeminiLiveBridge {
  private session: Session | null = null;
  private sessionContext: SessionContext | null = null;
  private tracker: CallSessionTracker | null = null;
  private closed = false;
  private turnStartMs: number | null = null;
  private scheduleEndAfterTurn = false;
  private endCallTimer: ReturnType<typeof setTimeout> | null = null;

  async connect(
    sessionContext: SessionContext,
    events: GeminiLiveEvents,
    tracker?: CallSessionTracker
  ): Promise<void> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Add it to .env (see .env.example).');
    }

    this.sessionContext = sessionContext;
    this.tracker = tracker ?? null;

    const model = process.env.GEMINI_LIVE_MODEL ?? DEFAULT_MODEL;
    const ai = new GoogleGenAI({ apiKey });
    const systemInstruction = buildVidyagyanSystemPrompt(sessionContext);
    const connectStart = performance.now();

    this.session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        tools: [{ functionDeclarations: LIVE_TOOL_DECLARATIONS }],
        temperature: 0.4,
        maxOutputTokens: 256,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
            prefixPaddingMs: 120,
            silenceDurationMs: 280,
          },
        },
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: process.env.GEMINI_VOICE_NAME ?? DEFAULT_VOICE_NAME,
            },
          },
        },
      },
      callbacks: {
        onopen: () => {
          events.onLatency?.('connect', performance.now() - connectStart);
          events.onOpen?.();
        },
        onmessage: (message: LiveServerMessage) => this.handleMessage(message, events),
        onerror: (e: { message?: string }) => {
          events.onError?.(e.message ?? 'Gemini Live WebSocket error');
        },
        onclose: (e: { reason?: string }) => {
          this.closed = true;
          events.onClose?.(e.reason || 'connection closed');
        },
      },
    });
  }

  sendAudioPcm16Base64(base64: string): void {
    if (!this.session || this.closed) return;
    this.session.sendRealtimeInput({
      audio: {
        data: base64,
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  }

  close(): void {
    if (this.endCallTimer) {
      clearTimeout(this.endCallTimer);
      this.endCallTimer = null;
    }
    if (this.session && !this.closed) {
      try {
        this.session.close();
      } catch {
        // already closed
      }
    }
    this.closed = true;
    this.session = null;
    this.sessionContext = null;
  }

  private handleMessage(message: LiveServerMessage, events: GeminiLiveEvents): void {
    if (message.toolCall?.functionCalls?.length) {
      this.handleToolCalls(message.toolCall.functionCalls, events);
      return;
    }

    const content = message.serverContent;
    if (!content) return;

    if (content.inputTranscription?.text) {
      this.turnStartMs = performance.now();
      events.onInputTranscript?.(content.inputTranscription.text);
      this.tracker?.recordTranscript('user', content.inputTranscription.text);
    }

    if (content.outputTranscription?.text) {
      events.onOutputTranscript?.(content.outputTranscription.text);
      this.tracker?.recordTranscript('agent', content.outputTranscription.text);
    }

    const parts = content.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (this.turnStartMs !== null) {
          const ttfa = performance.now() - this.turnStartMs;
          events.onLatency?.('time_to_first_audio', ttfa);
          this.tracker?.recordTurnLatency(ttfa);
          this.turnStartMs = null;
        }
        events.onAudio?.(part.inlineData.data);
      }
    }

    if (content.turnComplete) {
      events.onTurnComplete?.();
      if (this.scheduleEndAfterTurn) {
        this.scheduleEndAfterTurn = false;
        events.onCallEnding?.();
        this.endCallTimer = setTimeout(() => {
          this.close();
        }, END_CALL_DELAY_MS);
      }
    }
  }

  private handleToolCalls(functionCalls: FunctionCall[], events: GeminiLiveEvents): void {
    if (!this.session || !this.sessionContext || this.closed) return;

    const toolStart = performance.now();
    const responses: FunctionResponse[] = functionCalls.map((call) => {
      const name = call.name ?? 'unknown';
      const args = (call.args ?? {}) as Record<string, unknown>;

      if (name === 'verify_student_identity') {
        return this.handleVerifyTool(call, args, events);
      }

      const result = executeStudentTool(this.sessionContext!, name);
      events.onToolCall?.(name, result.lookupMs);
      this.tracker?.recordTool(name, result.lookupMs);

      const lang = this.sessionContext!.language;
      return {
        id: call.id,
        name,
        response: {
          output: result.data,
          personaReminder: toolPersonaReminder(lang),
        },
      };
    });

    this.session.sendToolResponse({ functionResponses: responses });
    events.onLatency?.('tool_round_trip', performance.now() - toolStart);
  }

  private handleVerifyTool(
    call: FunctionCall,
    args: Record<string, unknown>,
    events: GeminiLiveEvents
  ): FunctionResponse {
    const spokenName = String(args.name ?? '').trim();
    const rollId = args.rollId ? String(args.rollId) : undefined;
    const { student, lookupMs } = verifyCallerIdentity(spokenName, rollId);

    events.onToolCall?.('verify_student_identity', lookupMs);

    if (!student) {
      this.sessionContext!.verificationStatus = 'rejected';
      this.scheduleEndAfterTurn = true;
      events.onVerificationFailed?.('not_in_registry');

      return {
        id: call.id,
        name: 'verify_student_identity',
        response: {
          output: {
            verified: false,
            action: 'END_CALL',
            instruction:
              'Apologize sincerely. Explain this is VidyaGyan HCL helpline for registered lateral-admission students only. Say goodbye and end the call.',
          },
        },
      };
    }

    const compliance = evaluateCompliance({
      sessionId: this.sessionContext!.sessionId,
      phoneNumber: this.sessionContext!.phoneNumber,
      student,
    });

    if (!compliance.passed) {
      this.sessionContext = applyVerifiedStudent(this.sessionContext!, student, compliance);
      this.scheduleEndAfterTurn = true;
      events.onVerificationFailed?.('blocked_dpdp');

      return {
        id: call.id,
        name: 'verify_student_identity',
        response: {
          output: {
            verified: true,
            complianceBlocked: true,
            action: 'END_CALL',
            studentName: student.name,
            message:
              compliance.whatsAppFallback?.messageTemplate ?? WHATSAPP_PARENT_CONSENT_TEMPLATE,
            instruction:
              'Explain parental consent is required under DPDP. Mention WhatsApp message sent. Say goodbye and end call.',
          },
        },
      };
    }

    this.sessionContext = applyVerifiedStudent(this.sessionContext!, student, compliance);
    this.tracker?.setVerifiedStudent(student);
    events.onVerified?.(student);

    return {
      id: call.id,
      name: 'verify_student_identity',
      response: {
        output: {
          verified: true,
          action: 'CONTINUE',
          studentName: student.name,
          rollId: student.rollId,
          languagePreference: student.languagePreference,
          traiDisclosure: compliance.callRecordingDisclosure,
          nextStep:
            'Welcome them by name, read TRAI disclosure verbatim, then ask: How can I help you today?',
        },
        personaReminder: toolPersonaReminder(student.languagePreference),
      },
    };
  }
}
