import 'dotenv/config';
import chalk from 'chalk';
import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { GeminiLiveBridge } from './adapters/gemini_live_bridge.js';
import { buildPendingSessionContext } from './compliance_gate.js';
import { listAllStudents } from './db_service.js';
import { CallSessionTracker, listCallOutcomes, type CallOutcomeRecord } from './outcome_service.js';
import type { StudentProfile } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const publicDir = path.join(__dirname, '..', 'public');

type ClientMessage =
  | { type: 'start_call'; phone?: string }
  | { type: 'audio'; data: string }
  | { type: 'stop_call' };

type ServerMessage =
  | { type: 'call_ready'; sessionId: string; message: string }
  | { type: 'caller_verified'; studentName: string; language: string; rollId: string }
  | { type: 'verification_failed'; reason: string; message: string }
  | { type: 'audio'; data: string }
  | { type: 'transcript'; role: 'user' | 'agent'; text: string }
  | { type: 'status'; message: string }
  | { type: 'latency'; phase: string; ms: number }
  | { type: 'tool_call'; name: string; lookupMs: number }
  | { type: 'error'; message: string }
  | { type: 'call_ended'; reason: string; outcome?: { durationMs: number; toolsInvoked: string[] } };

const app = express();
app.use(express.static(publicDir));

app.get('/api/callers', (_req, res) => {
  res.json(listAllStudents());
});

app.get('/api/outcomes', (_req, res) => {
  res.json(listCallOutcomes(30));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
    inboundFlow: 'verify_by_name',
  });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket) => {
  let bridge: GeminiLiveBridge | null = null;
  let tracker: CallSessionTracker | null = null;
  let pendingResolution: CallOutcomeRecord['resolution'] = 'completed';

  const send = (msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const finalizeAndClear = (compliancePassed: boolean) => {
    const outcome = tracker?.finalize(compliancePassed, pendingResolution);
    tracker = null;
    return outcome;
  };

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;

      if (msg.type === 'stop_call') {
        bridge?.close();
        bridge = null;
        const outcome = finalizeAndClear(pendingResolution === 'completed');
        send({
          type: 'call_ended',
          reason: 'client hangup',
          outcome: outcome
            ? { durationMs: outcome.durationMs, toolsInvoked: outcome.toolsInvoked }
            : undefined,
        });
        return;
      }

      if (msg.type === 'audio') {
        bridge?.sendAudioPcm16Base64(msg.data);
        return;
      }

      if (msg.type === 'start_call') {
        bridge?.close();
        bridge = null;
        tracker = null;
        pendingResolution = 'completed';

        const rawPhone = msg.phone;
        const phone =
          typeof rawPhone === 'string' && rawPhone.trim()
            ? rawPhone.trim()
            : `unknown-${Date.now()}`;
        const sessionId = `sess-${Date.now()}`;

        tracker = new CallSessionTracker(sessionId, phone, 'pending', 'Unknown', 'hi', 'live');
        const session = buildPendingSessionContext(sessionId, phone);

        console.log(chalk.dim(`[CALL] ${sessionId} ← inbound ${phone} (awaiting name verification)`));

        bridge = new GeminiLiveBridge();

        try {
          await bridge.connect(
            session,
            {
              onOpen: () => {
                send({
                  type: 'call_ready',
                  sessionId,
                  message: 'Connected — say hello to start the conversation.',
                });
                send({ type: 'status', message: 'Say hello — agent will then introduce and ask your name.' });
              },
              onVerified: (student: StudentProfile) => {
                pendingResolution = 'completed';
                send({
                  type: 'caller_verified',
                  studentName: student.name,
                  language: student.languagePreference,
                  rollId: student.rollId,
                });
                send({ type: 'status', message: `Verified: ${student.name} — ask your question.` });
              },
              onVerificationFailed: (reason) => {
                pendingResolution = reason === 'blocked_dpdp' ? 'blocked_dpdp' : 'unverified_caller';
                send({
                  type: 'verification_failed',
                  reason,
                  message:
                    reason === 'blocked_dpdp'
                      ? 'Parental consent required — call ending.'
                      : 'Caller not in student registry — call ending.',
                });
              },
              onCallEnding: () => {
                send({ type: 'status', message: 'Call ending…' });
              },
              onAudio: (data) => send({ type: 'audio', data }),
              onInputTranscript: (text) => send({ type: 'transcript', role: 'user', text }),
              onOutputTranscript: (text) => send({ type: 'transcript', role: 'agent', text }),
              onToolCall: (name, lookupMs) => send({ type: 'tool_call', name, lookupMs }),
              onLatency: (phase, ms) => {
                send({ type: 'latency', phase, ms: Math.round(ms) });
              },
              onError: (message) => send({ type: 'error', message }),
              onClose: (reason) => {
                const passed = pendingResolution === 'completed';
                const outcome = finalizeAndClear(passed);
                send({
                  type: 'call_ended',
                  reason,
                  outcome: outcome
                    ? { durationMs: outcome.durationMs, toolsInvoked: outcome.toolsInvoked }
                    : undefined,
                });
                bridge = null;
              },
            },
            tracker
          );
        } catch (err) {
          bridge = null;
          tracker?.finalize(false, 'error');
          tracker = null;
          send({
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to connect Gemini Live',
          });
        }
      }
    } catch (err) {
      send({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid message',
      });
    }
  });

  ws.on('close', () => {
    bridge?.close();
    bridge = null;
    if (tracker) {
      tracker.finalize(pendingResolution === 'completed', pendingResolution);
      tracker = null;
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║  VidyaGyan — Inbound Voice Agent (verify by name)            ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝\n'));
  console.log(chalk.green(`  → Open http://localhost:${PORT}`));
  console.log(
    chalk.gray(
      `  → Gemini: ${process.env.GEMINI_API_KEY ? chalk.green('configured') : chalk.red('set GEMINI_API_KEY in .env')}`
    )
  );
  console.log('');
});
