import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  onBack: () => void;
}

// Chat screen header: back button + room title (and optional counterpart name).
export function ChatHeader({ title, subtitle, onBack }: Props) {
  return (
    <header className="surface flex items-center gap-3 border-b border-black/5 dark:border-white/10 p-4">
      <button onClick={onBack} aria-label="Back" className="p-1">
        <ArrowLeft size={22} />
      </button>
      <div>
        <h3 className="leading-tight">{title}</h3>
        {subtitle && <p className="text-xs opacity-60">{subtitle}</p>}
      </div>
    </header>
  );
}
