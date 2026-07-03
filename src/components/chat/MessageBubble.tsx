import { sanitize, cn } from '../../utils/helpers';
import { formatTime } from '../../utils/formatters';
import type { ChatMessage } from '../../types';

interface Props {
  message: ChatMessage;
  mine: boolean;
}

// A single chat bubble. User-generated text is sanitized before render (Rule 8).
export function MessageBubble({ message, mine }: Props) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
          mine ? 'rounded-br-sm bg-primary text-white' : 'rounded-bl-sm surface shadow-card'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{sanitize(message.text)}</p>
        <p className={cn('mt-0.5 text-[10px]', mine ? 'text-white/70' : 'opacity-50')}>
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}
