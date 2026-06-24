const phoneInput = document.getElementById('phone');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const latencyEl = document.getElementById('latency');
const callerListEl = document.getElementById('callerList');

let ws = null;
let audioContext = null;
let mediaStream = null;
let processor = null;
let callActive = false;
let nextPlayTime = 0;

const INPUT_BUFFER_SIZE = 2048;
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

function setStatus(text, mode = '') {
  statusEl.textContent = text;
  statusEl.className = mode;
}

function addLatency(phase, ms) {
  if (!latencyEl) return;
  const row = document.createElement('div');
  row.className = 'lat-row';
  row.textContent = `${phase}: ${ms}ms`;
  latencyEl.prepend(row);
  while (latencyEl.children.length > 8) latencyEl.lastChild.remove();
}

function addTranscript(role, text) {
  const line = document.createElement('div');
  line.className = role === 'user' ? 't-user' : role === 'agent' ? 't-agent' : 't-sys';
  const prefix = role === 'user' ? 'You: ' : role === 'agent' ? 'Agent: ' : '';
  line.textContent = prefix + text;
  transcriptEl.appendChild(line);
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function downsample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = input[Math.round(i * ratio)];
  return out;
}

function floatTo16BitPcmBase64(float32) {
  const buf = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function playPcmBase64(base64) {
  if (!audioContext || !callActive) return;

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;

  const buffer = audioContext.createBuffer(1, float32.length, OUTPUT_RATE);
  buffer.getChannelData(0).set(float32);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  const now = audioContext.currentTime;
  const start = Math.max(now, nextPlayTime);
  source.start(start);
  nextPlayTime = start + buffer.duration;
}

async function startMic() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  audioContext = new AudioContext({ latencyHint: 'interactive' });
  if (audioContext.state === 'suspended') await audioContext.resume();
  nextPlayTime = audioContext.currentTime;

  const source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(INPUT_BUFFER_SIZE, 1, 1);

  processor.onaudioprocess = (e) => {
    if (!callActive || !ws || ws.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const downsampled = downsample(input, audioContext.sampleRate, INPUT_RATE);
    ws.send(JSON.stringify({ type: 'audio', data: floatTo16BitPcmBase64(downsampled) }));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);
}

function stopMic() {
  callActive = false;
  processor?.disconnect();
  processor = null;
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  audioContext?.close();
  audioContext = null;
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocket(`${proto}://${location.host}`);
}

async function startCall() {
  transcriptEl.innerHTML = '';
  if (latencyEl) latencyEl.innerHTML = '';

  const phone = (phoneInput?.value ?? '').trim();

  startBtn.disabled = true;
  setStatus('Requesting microphone...');

  try {
    await startMic();
  } catch {
    setStatus('Microphone access denied.', 'blocked');
    startBtn.disabled = false;
    return;
  }

  ws = connectWs();

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'start_call', phone: phone || undefined }));
    setStatus('Connecting inbound call...');
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    switch (msg.type) {
      case 'call_ready':
        callActive = true;
        stopBtn.disabled = false;
        setStatus('● Connected — say hello to start', 'live');
        addTranscript('sys', msg.message);
        break;

      case 'caller_verified':
        setStatus(`● Verified: ${msg.studentName} — ask your question`, 'live');
        addTranscript('sys', `Identity verified: ${msg.studentName} (${msg.rollId})`);
        break;

      case 'verification_failed':
        setStatus('Call ending — verification failed', 'blocked');
        addTranscript('sys', msg.message);
        break;

      case 'audio':
        playPcmBase64(msg.data);
        break;

      case 'transcript':
        addTranscript(msg.role, msg.text);
        break;

      case 'latency':
        addLatency(msg.phase, msg.ms);
        break;

      case 'tool_call':
        addTranscript('sys', `🔧 ${msg.name} (${msg.lookupMs.toFixed(1)}ms)`);
        break;

      case 'status':
        if (callActive) setStatus(`● Live — ${msg.message}`, 'live');
        else setStatus(msg.message);
        break;

      case 'error':
        addTranscript('sys', `Error: ${msg.message}`);
        setStatus(msg.message, 'blocked');
        break;

      case 'call_ended':
        endCall(false);
        addTranscript('sys', `Call ended: ${msg.reason}`);
        if (msg.outcome) {
          addTranscript(
            'sys',
            `Duration ${msg.outcome.durationMs}ms | tools: ${msg.outcome.toolsInvoked.join(', ') || 'none'}`
          );
        }
        break;
    }
  };

  ws.onerror = () => {
    setStatus('WebSocket error — is the server running?', 'blocked');
    endCall(false);
  };

  ws.onclose = () => {
    if (callActive) endCall(false);
  };
}

function endCall(sendStop = true) {
  callActive = false;
  if (sendStop && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop_call' }));
  }
  stopMic();
  ws?.close();
  ws = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  if (!statusEl.classList.contains('blocked')) {
    setStatus('Call ended. Ready for next inbound call.');
  }
}

startBtn.addEventListener('click', startCall);
stopBtn.addEventListener('click', () => endCall(true));

async function loadCallers() {
  try {
    const res = await fetch('/api/callers');
    const students = await res.json();
    for (const s of students) {
      const li = document.createElement('li');
      const flag = s.isMinor && !s.parentalConsent ? ' ⚠ DPDP block if verified' : '';
      li.textContent = `${s.name} — Roll ${s.rollId}${flag}`;
      callerListEl.appendChild(li);
    }
  } catch {
    callerListEl.textContent = 'Could not load student list.';
  }
}

loadCallers();
