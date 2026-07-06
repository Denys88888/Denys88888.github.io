import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  placeholder?: string;
}

// Message composer with a 500-char cap and Enter-to-send.
export function MessageInput({ onSend, placeholder }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');

  const submit = (): void => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="surface flex items-center gap-2 border-t border-black/5 dark:border-white/10 p-3">
      <input
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
        placeholder={placeholder ?? t('chat.typeMessage')}
        className="flex-1 rounded-full border border-[#E0E0E0] dark:border-white/15 bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
      />
      <button
        onClick={submit}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white active:scale-95"
        aria-label={t('chat.send')}
      >
        <Send size={18} />
      </button>
    </div>
  );
}
