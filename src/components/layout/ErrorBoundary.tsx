import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { logger } from '../../utils/logger';
import i18n from '../../i18n';

interface State {
  hasError: boolean;
  message?: string;
}

// Catches render errors so a single broken screen never blanks the whole app.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <AlertTriangle size={40} className="text-warning" strokeWidth={1.75} />
          <h3>{i18n.t('common.somethingWentWrong')}</h3>
          <p className="text-sm opacity-70">{this.state.message}</p>
          <button
            className="rounded-btn bg-primary px-6 py-3 font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            {i18n.t('common.reload')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
