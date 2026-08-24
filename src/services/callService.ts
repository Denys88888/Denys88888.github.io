import { wsService } from './wsService';
import { startRingtone, stopRingtone } from './notificationService';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// In-app voice calls over WebRTC.
//
// Audio flows peer-to-peer between the two phones; the server only relays the
// SDP offer/answer and ICE candidates (see the call_* cases in the server's
// websocket handler). Neither party ever sees the other's phone number — this
// replaces the tel: link that dialed the real number.
//
// Roles are explicit: whoever taps "call" is the caller and sends the offer;
// whoever receives the offer is the callee. That removes the need for perfect-
// negotiation glare handling — a second offer arriving mid-call is simply
// declined as busy.
// ---------------------------------------------------------------------------

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface CallSnapshot {
  state: CallState;
  rideId: string | null;
  // uid of the other party (the incoming caller while ringing).
  peerId: string | null;
  muted: boolean;
  // Seconds since the call connected, for the on-screen timer.
  durationSec: number;
  // Why the last call ended, for a brief status line.
  endReason: string | null;
  // Live line diagnostics while connected — packet loss %, jitter, round-trip,
  // receive bitrate and negotiated codec. Shown small in the overlay so a user
  // reporting bad audio can read the actual numbers back instead of guessing.
  stats: string | null;
}

// Multiple independent STUN providers: if one is slow/blocked on a given carrier
// network, the others still let both sides discover a public NAT mapping. (The
// once-common free public TURN relays — Open Relay Project's openrelayproject
// demo, freestun.net, numb.viagenie.ca, turn.bistri.com — were probed directly
// with raw STUN binding requests while building this and none responded on any
// port; they're dead. A working TURN relay needs either a provider account
// [Metered, ExpressTURN, Twilio, Cloudflare Realtime] or a self-hosted coturn on
// a VPS with a public UDP port range — both are infra/cost decisions, not
// something to wire in silently.) iceCandidatePoolSize pre-gathers candidates so
// the path is ready as soon as the offer/answer exchange lands.
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.nextcloud.com:3478' },
  ],
  iceCandidatePoolSize: 4,
};

// Nudge Opus toward voice-call quality: in-band FEC recovers lost packets
// (smoother audio on a lossy mobile link) and a raised average bitrate lifts it
// above the codec's conservative default. Applied to both offer and answer SDP.
function tuneOpus(sdp: string): string {
  const rtpmap = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
  if (!rtpmap) return sdp;
  const pt = rtpmap[1];
  // 48 kbps mono Opus is comfortably above voice-clear; FEC recovers lost
  // packets; DTX off keeps the stream continuous (no comfort-noise artefacts on
  // speech gaps, which can read as crackle).
  const params = 'useinbandfec=1;usedtx=0;maxaveragebitrate=48000;stereo=0;cbr=0';
  const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
  if (fmtpRe.test(sdp)) {
    // Append our params to the existing fmtp line, without duplicating keys.
    return sdp.replace(fmtpRe, (_full, existing: string) => {
      const kept = existing
        .split(';')
        .filter((kv) => !/^(useinbandfec|usedtx|maxaveragebitrate|stereo)=/.test(kv.trim()))
        .join(';');
      return `a=fmtp:${pt} ${[kept, params].filter(Boolean).join(';')}`;
    });
  }
  // No fmtp line for Opus — add one right after its rtpmap.
  return sdp.replace(rtpmap[0], `${rtpmap[0]}\r\na=fmtp:${pt} ${params}`);
}

type Sub = (snap: CallSnapshot) => void;

class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private connectedAt = 0;
  // ICE candidates that arrive before the remote description is set can't be
  // added yet — hold them until setRemoteDescription lands.
  private pendingRemoteCandidates: RTCIceCandidateInit[] = [];
  private wsUnsub: Array<() => void> = [];
  private subs = new Set<Sub>();

  private snap: CallSnapshot = {
    state: 'idle',
    rideId: null,
    peerId: null,
    muted: false,
    durationSec: 0,
    endReason: null,
    stats: null,
  };

  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private lastBytes = 0;
  private lastStatsAt = 0;

  constructor() {
    // Bind to the shared socket once; these fire for the lifetime of the app.
    this.wsUnsub.push(
      wsService.on('call_offer', (m) => void this.onOffer(m)),
      wsService.on('call_answer', (m) => void this.onAnswer(m)),
      wsService.on('call_ice', (m) => void this.onIce(m)),
      wsService.on('call_end', (m) => this.onRemoteEnd(m)),
      wsService.on('call_decline', (m) => this.onRemoteEnd({ ...m, reason: 'declined' }))
    );
  }

  // ── Subscription ──────────────────────────────────────────────────────────
  subscribe(cb: Sub): () => void {
    this.subs.add(cb);
    cb(this.snap);
    return () => this.subs.delete(cb);
  }
  getSnapshot(): CallSnapshot {
    return this.snap;
  }
  private emit(patch: Partial<CallSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    // The ringtone rings only on the RECEIVING side ('ringing'). The caller
    // ('calling') stays silent — playing the same ring there made both phones
    // ring at once ("звонок у обоих"), which is confusing; the caller already
    // sees "Calling…" on screen. Idempotent, so re-emitting won't restart it.
    if (this.snap.state === 'ringing') {
      startRingtone();
    } else {
      stopRingtone();
    }
    this.subs.forEach((cb) => {
      try {
        cb(this.snap);
      } catch (err) {
        logger.error('[call] subscriber threw', (err as Error).message);
      }
    });
  }

  // ── Outgoing ──────────────────────────────────────────────────────────────
  async startCall(rideId: string, peerId: string): Promise<void> {
    if (this.snap.state !== 'idle' && this.snap.state !== 'ended') return;
    try {
      this.emit({ state: 'calling', rideId, peerId, endReason: null, durationSec: 0 });
      await this.setupPeer(rideId);
      const offer = await this.pc!.createOffer({ offerToReceiveAudio: true });
      offer.sdp = tuneOpus(offer.sdp ?? '');
      await this.pc!.setLocalDescription(offer);
      wsService.send('call_offer', { rideId, sdp: JSON.stringify(offer) });
    } catch (err) {
      logger.error('[call] startCall failed', (err as Error).message);
      this.end('mic_error', true);
    }
  }

  // ── Incoming ──────────────────────────────────────────────────────────────
  private incomingOffer: { rideId: string; sdp: string; from: string } | null = null;

  private async onOffer(m: Record<string, unknown>): Promise<void> {
    const rideId = String(m.rideId ?? '');
    const from = String(m.from ?? '');
    const sdp = typeof m.sdp === 'string' ? m.sdp : '';
    if (!rideId || !sdp) return;
    // Already busy on another call — tell them we can't pick up.
    if (this.snap.state !== 'idle' && this.snap.state !== 'ended') {
      wsService.send('call_decline', { rideId, reason: 'busy' });
      return;
    }
    this.incomingOffer = { rideId, sdp, from };
    this.emit({ state: 'ringing', rideId, peerId: from, endReason: null, durationSec: 0 });
  }

  async acceptCall(): Promise<void> {
    const offer = this.incomingOffer;
    if (!offer || this.snap.state !== 'ringing') return;
    try {
      this.emit({ state: 'connecting' });
      await this.setupPeer(offer.rideId);
      await this.pc!.setRemoteDescription(JSON.parse(offer.sdp) as RTCSessionDescriptionInit);
      await this.drainPendingCandidates();
      const answer = await this.pc!.createAnswer();
      answer.sdp = tuneOpus(answer.sdp ?? '');
      await this.pc!.setLocalDescription(answer);
      wsService.send('call_answer', { rideId: offer.rideId, sdp: JSON.stringify(answer) });
      this.incomingOffer = null;
    } catch (err) {
      logger.error('[call] acceptCall failed', (err as Error).message);
      this.end('mic_error', true);
    }
  }

  private async onAnswer(m: Record<string, unknown>): Promise<void> {
    if (!this.pc || this.snap.state !== 'calling') return;
    const sdp = typeof m.sdp === 'string' ? m.sdp : '';
    if (!sdp) return;
    try {
      this.emit({ state: 'connecting' });
      await this.pc.setRemoteDescription(JSON.parse(sdp) as RTCSessionDescriptionInit);
      await this.drainPendingCandidates();
    } catch (err) {
      logger.error('[call] onAnswer failed', (err as Error).message);
      this.end('failed', true);
    }
  }

  private async onIce(m: Record<string, unknown>): Promise<void> {
    const cand = m.candidate as RTCIceCandidateInit | undefined;
    if (!cand) return;
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingRemoteCandidates.push(cand);
      return;
    }
    try {
      await this.pc.addIceCandidate(cand);
    } catch (err) {
      logger.warn('[call] addIceCandidate failed', (err as Error).message);
    }
  }

  private async drainPendingCandidates(): Promise<void> {
    const queued = this.pendingRemoteCandidates.splice(0);
    for (const c of queued) {
      try {
        await this.pc!.addIceCandidate(c);
      } catch (err) {
        logger.warn('[call] drain addIceCandidate failed', (err as Error).message);
      }
    }
  }

  // ── Shared peer setup ─────────────────────────────────────────────────────
  /** Close the ended screen now — the user chose to do something else. */
  dismiss(): void {
    if (this.snap.state !== 'ended') return;
    this.emit({ state: 'idle', rideId: null, peerId: null, durationSec: 0, stats: null });
  }

  private async setupPeer(rideId: string): Promise<void> {
    // getUserMedia must succeed before we advertise a call; a mic failure here
    // is what we told the user could happen if Pi Browser denies the mic.
    //
    // Audio processing in the Pi Browser's WebView is low quality: the reported
    // constant crackle + hiss is the signature of autoGainControl (clips loud
    // speech into rasp, boosts the noise floor between words into hiss) and of
    // the cheap noiseSuppression adding a metallic wash. Both off gives a rawer
    // but far cleaner signal. Echo cancellation stays on — without it the other
    // side hears themselves through the earpiece, which is worse than either.
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    this.snap.muted = false;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    this.pc = pc;

    for (const track of this.localStream.getTracks()) {
      pc.addTrack(track, this.localStream);
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        wsService.send('call_ice', { rideId, candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      if (!this.remoteAudio) {
        this.remoteAudio = document.createElement('audio');
        this.remoteAudio.autoplay = true;
        // playsInline keeps WebView from trying to fullscreen the (audio-only)
        // element on some Android builds.
        this.remoteAudio.setAttribute('playsinline', '');
        document.body.appendChild(this.remoteAudio);
      }
      this.remoteAudio.srcObject = e.streams[0];
      void this.remoteAudio.play().catch(() => undefined);

      // Ask the browser to hold ~150ms of audio before playout. That absorbs
      // network jitter (packets arriving unevenly spaced) by smoothing it into a
      // steady stream instead of playing gaps/bursts as crackle — the standard
      // fix for jitter-driven artifacts, at the cost of a small added delay that's
      // unnoticeable in a voice call. jitterBufferTarget is the current API;
      // playoutDelayHint is kept for browsers that only support the older name.
      const receiver = e.receiver as unknown as Record<string, unknown>;
      try {
        if (typeof receiver.jitterBufferTarget !== 'undefined') receiver.jitterBufferTarget = 150;
        else if (typeof receiver.playoutDelayHint !== 'undefined') receiver.playoutDelayHint = 0.15;
      } catch (err) {
        logger.warn('[call] jitter buffer tuning unsupported', (err as Error).message);
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        if (this.snap.state !== 'connected') {
          this.connectedAt = Date.now();
          this.startDurationTimer();
          this.startStatsTimer();
          this.emit({ state: 'connected' });
        }
      } else if (s === 'failed') {
        this.end('failed', false);
      } else if (s === 'disconnected' || s === 'closed') {
        // A brief disconnect can recover; only end if we never reconnect.
        if (this.snap.state === 'connected' && s === 'disconnected') {
          setTimeout(() => {
            if (this.pc && this.pc.connectionState === 'disconnected') this.end('disconnected', false);
          }, 4000);
        }
      }
    };
  }

  // Poll inbound-audio stats so bad-audio reports come with real numbers.
  // High loss/jitter points at the network (a TURN relay or lower bitrate would
  // help); clean stats with bad audio points at capture/playback instead.
  private startStatsTimer(): void {
    this.stopStatsTimer();
    this.lastBytes = 0;
    this.lastStatsAt = Date.now();
    const poll = async (): Promise<void> => {
      if (!this.pc) return;
      try {
        const report = await this.pc.getStats();
        let loss = '?';
        let jitterMs = '?';
        let kbps = '?';
        let codec = '?';
        let rttMs = '?';
        const codecById = new Map<string, string>();
        report.forEach((r) => {
          if (r.type === 'codec' && typeof r.mimeType === 'string') {
            codecById.set(r.id, r.mimeType.replace('audio/', ''));
          }
        });
        report.forEach((r) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            const recv = r.packetsReceived ?? 0;
            const lost = r.packetsLost ?? 0;
            const total = recv + lost;
            if (total > 0) loss = `${((lost / total) * 100).toFixed(1)}%`;
            if (typeof r.jitter === 'number') jitterMs = `${Math.round(r.jitter * 1000)}ms`;
            const bytes = r.bytesReceived ?? 0;
            const now = Date.now();
            const dt = (now - this.lastStatsAt) / 1000;
            if (this.lastBytes && dt > 0) {
              kbps = `${Math.round(((bytes - this.lastBytes) * 8) / dt / 1000)}`;
            }
            this.lastBytes = bytes;
            this.lastStatsAt = now;
            if (r.codecId && codecById.has(r.codecId)) codec = codecById.get(r.codecId)!;
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && typeof r.currentRoundTripTime === 'number') {
            rttMs = `${Math.round(r.currentRoundTripTime * 1000)}ms`;
          }
        });
        this.emit({ stats: `loss ${loss} · jitter ${jitterMs} · ${kbps}kbps · rtt ${rttMs} · ${codec}` });
      } catch {
        /* getStats can throw during teardown — ignore */
      }
    };
    void poll();
    this.statsTimer = setInterval(() => void poll(), 2000);
  }
  private stopStatsTimer(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationTimer = setInterval(() => {
      this.emit({ durationSec: Math.floor((Date.now() - this.connectedAt) / 1000) });
    }, 1000);
  }
  private stopDurationTimer(): void {
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.durationTimer = null;
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  toggleMute(): void {
    if (!this.localStream) return;
    const enabled = this.localStream.getAudioTracks().some((t) => t.enabled);
    this.localStream.getAudioTracks().forEach((t) => (t.enabled = !enabled));
    this.emit({ muted: enabled });
  }

  // Decline an incoming call without answering.
  decline(): void {
    if (this.snap.rideId) wsService.send('call_decline', { rideId: this.snap.rideId, reason: 'declined' });
    this.end('declined', false);
  }

  // Hang up an active/outgoing call.
  hangUp(): void {
    if (this.snap.rideId && (this.snap.state === 'calling' || this.snap.state === 'connecting' || this.snap.state === 'connected')) {
      wsService.send('call_end', { rideId: this.snap.rideId, reason: 'hangup' });
    }
    this.end('ended', false);
  }

  private onRemoteEnd(m: Record<string, unknown>): void {
    if (this.snap.state === 'idle') return;
    const reason = typeof m.reason === 'string' ? m.reason : 'ended';
    this.end(reason, false);
  }

  // Tear everything down. `notify` skips sending another WS message (used when
  // the failure originated locally and we haven't told the peer yet — startCall
  // errors before an offer was even sent).
  private end(reason: string, _local: boolean): void {
    this.stopDurationTimer();
    this.stopStatsTimer();
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      try {
        this.pc.close();
      } catch {
        /* already closed */
      }
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }
    this.pendingRemoteCandidates = [];
    this.incomingOffer = null;
    this.emit({ state: 'ended', endReason: reason, muted: false });
    // Hold the ended screen longer when the call actually connected, so the
    // line-quality line stays readable after hanging up (you can't read it mid-
    // conversation). A call that never connected clears quickly.
    // A call that failed to find a path offers a way into the chat instead, and
    // 1.5s is not long enough to read why and reach for it.
    const failedToConnect = reason === 'failed' || reason === 'disconnected';
    const hold = this.snap.stats ? 6000 : failedToConnect ? 10000 : 1500;
    setTimeout(() => {
      if (this.snap.state === 'ended') {
        this.emit({ state: 'idle', rideId: null, peerId: null, durationSec: 0, stats: null });
      }
    }, hold);
  }
}

export const callService = new CallService();
