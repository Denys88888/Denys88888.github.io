import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatWindow } from '../components/chat/ChatWindow';
import { QuickTemplates } from '../components/chat/QuickTemplates';
import { MessageInput } from '../components/chat/MessageInput';
import { useChat } from '../hooks/useChat';
import { useRouter } from '../store/useRouter';
import { useAppStore } from '../store/useAppStore';

// Real-time chat screen — composed from ChatHeader, ChatWindow, QuickTemplates
// and MessageInput. All messaging logic lives in the useChat hook.
export function ChatScreen() {
  const { t } = useTranslation();
  const params = useRouter((s) => s.params);
  const back = useRouter((s) => s.back);
  const uid = useAppStore((s) => s.user?.uid ?? '');
  const chatId = params.chatId ?? '';
  const clearUnread = useAppStore((s) => s.clearUnread);
  const { messages, send } = useChat(chatId);

  // Opening the chat *is* reading it. Re-runs on every new message too, so a
  // message that lands while the screen is already open never leaves a badge
  // behind on the way back to the ride.
  useEffect(() => {
    if (chatId) clearUnread(chatId);
  }, [chatId, clearUnread, messages.length]);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title={t('chat.title')} onBack={back} />
      <ChatWindow messages={messages} currentUserId={uid} />
      <QuickTemplates onSelect={(text) => send(text, true)} />
      <MessageInput onSend={(text) => send(text)} />
    </div>
  );
}
