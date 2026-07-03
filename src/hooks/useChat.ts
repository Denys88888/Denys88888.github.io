import { useEffect, useState, useCallback } from 'react';
import { wsService } from '../services/wsService';
import { clampMessage } from '../utils/validators';
import { sanitize } from '../utils/helpers';
import type { ChatMessage } from '../types';

// Joins a chat room over WebSocket and exposes its live message list + a sender.
export function useChat(chatId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!chatId) return;
    wsService.send('join_chat', { chatId });

    const offJoined = wsService.on('joined', (msg) => {
      if (String(msg.chatId) === chatId) {
        setMessages((msg.messages as ChatMessage[]) ?? []);
      }
    });
    const offNew = wsService.on('new_message', (msg) => {
      if (String(msg.chatId) === chatId) {
        setMessages((prev) => [...prev, msg.message as ChatMessage]);
      }
    });

    return () => {
      offJoined();
      offNew();
    };
  }, [chatId]);

  const send = useCallback(
    (text: string, isTemplate = false) => {
      const clean = sanitize(clampMessage(text));
      if (!clean.trim()) return;
      wsService.send('send_message', { chatId, text: clean, isTemplate });
    },
    [chatId]
  );

  return { messages, send };
}
