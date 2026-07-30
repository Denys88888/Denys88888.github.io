import { useTranslation } from 'react-i18next';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useCall } from '../../hooks/useCall';
import { callService } from '../../services/callService';

// Global call surface. Rendered once near the app root so an incoming call
// shows even when the user isn't on the ride screen. Media and signaling live
// in callService; this only reflects its state and forwards button taps.
export function CallOverlay() {
  const { t } = useTranslation();
  const call = useCall();

  if (call.state === 'idle') return null;

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const statusLine = () => {
    switch (call.state) {
      case 'calling':
        return t('call.calling');
      case 'ringing':
        return t('call.incoming');
      case 'connecting':
        return t('call.connecting');
      case 'connected':
        return mmss(call.durationSec);
      case 'ended':
        return t(`call.end_${call.endReason}`, t('call.ended'));
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-6 text-white">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/30">
        <Phone size={40} className={call.state === 'calling' || call.state === 'ringing' ? 'animate-pulse' : ''} />
      </div>
      <p className="mt-6 text-lg font-semibold">{t('call.title')}</p>
      <p className="mt-1 text-sm opacity-70">{statusLine()}</p>

      <div className="mt-10 flex items-center gap-6">
        {call.state === 'ringing' ? (
          <>
            <button
              onClick={() => callService.decline()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger"
              aria-label={t('call.decline')}
            >
              <PhoneOff size={26} />
            </button>
            <button
              onClick={() => void callService.acceptCall()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-success"
              aria-label={t('call.accept')}
            >
              <Phone size={26} />
            </button>
          </>
        ) : call.state === 'ended' ? null : (
          <>
            {(call.state === 'connected' || call.state === 'connecting') && (
              <button
                onClick={() => callService.toggleMute()}
                className={`flex h-14 w-14 items-center justify-center rounded-full ${
                  call.muted ? 'bg-white text-black' : 'bg-white/15'
                }`}
                aria-label={call.muted ? t('call.unmute') : t('call.mute')}
              >
                {call.muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
            )}
            <button
              onClick={() => callService.hangUp()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-danger"
              aria-label={t('call.hangUp')}
            >
              <PhoneOff size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
