import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Loader2 } from 'lucide-react';
import { sanitize, cn } from '../../utils/helpers';
import { formatTime } from '../../utils/formatters';
import { translateMessage } from '../../services/translateService';
import type { ChatMessage } from '../../types';

interface Props {
  message: ChatMessage;
  mine: boolean;
}

// A single chat bubble. User-generated text is sanitized before render (Rule 8).
// Incoming messages can be translated into the app language on demand.
export function MessageBubble({ message, mine }: Props) {
  const { t, i18n } = useTranslation();
  const [translated, setTranslated] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'failed' | 'same-language'>('idle');

  const toggleTranslate = async (): Promise<void> => {
    if (shown) {
      setShown(false);
      return;
    }
    if (translated) {
      setShown(true);
      return;
    }
    setBusy(true);
    setStatus('idle');
    const result = await translateMessage(message.text, i18n.language);
    setBusy(false);
    if (result.status === 'translated') {
      setTranslated(result.text);
      setShown(true);
    } else {
      setStatus(result.status === 'same-language' ? 'same-language' : 'failed');
    }
  };

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
          mine ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm surface shadow-card'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{sanitize(message.text)}</p>
        {shown && translated && (
          <p
            className={cn(
              'mt-1 whitespace-pre-wrap break-words border-t pt-1 text-sm italic',
              mine ? 'border-white/25 text-white/90' : 'border-black/10 dark:border-white/15 opacity-80'
            )}
          >
            {sanitize(translated)}
          </p>
        )}
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <p className={cn('text-[10px]', mine ? 'text-white/70' : 'opacity-50')}>
            {formatTime(message.timestamp)}
          </p>
          {!mine && (
            <button
              onClick={toggleTranslate}
              disabled={status === 'same-language'}
              className={cn(
                'inline-flex min-h-[24px] items-center gap-1 text-[10px] font-medium',
                status === 'failed'
                  ? 'text-danger'
                  : status === 'same-language'
                    ? 'opacity-50'
                    : 'text-primary'
              )}
              aria-label={t('chat.translate')}
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Languages size={11} />}
              {status === 'failed'
                ? t('chat.translateFailed')
                : status === 'same-language'
                  ? t('chat.translateSameLanguage')
                  : shown
                    ? t('chat.hideTranslation')
                    : t('chat.translate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
