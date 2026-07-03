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
  const { messages, send } = useChat(chatId);

  return (
    <div className="flex h-full flex-col">
      <ChatHeader title={t('chat.title')} onBack={back} />
      <ChatWindow messages={messages} currentUserId={uid} />
      <QuickTemplates onSelect={(text) => send(text, true)} />
      <MessageInput onSend={(text) => send(text)} />
    </div>
  );
}
