import { wsService } from './wsService';
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
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

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
  };

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
  private async setupPeer(rideId: string): Promise<void> {
    // getUserMedia must succeed before we advertise a call; a mic failure here
    // is what we told the user could happen if Pi Browser denies the mic.
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'connected') {
        if (this.snap.state !== 'connected') {
          this.connectedAt = Date.now();
          this.startDurationTimer();
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
    // Return to idle shortly so the UI can show a brief "call ended" line.
    setTimeout(() => {
      if (this.snap.state === 'ended') {
        this.emit({ state: 'idle', rideId: null, peerId: null, durationSec: 0 });
      }
    }, 1500);
  }
}

export const callService = new CallService();
