import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageBubble } from './MessageBubble';
import type { ChatMessage } from '../../types';

interface Props {
  messages: ChatMessage[];
  currentUserId: string;
}

// Scrollable message list; auto-scrolls to the newest message.
export function ChatWindow({ messages, currentUserId }: Props) {
  const { t } = useTranslation();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {messages.length === 0 && (
        <p className="pt-10 text-center text-sm opacity-50">{t('chat.empty')}</p>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} mine={m.senderId === currentUserId} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
