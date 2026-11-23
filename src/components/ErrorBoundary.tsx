import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { formatAppErrorMessage } from '../lib/firebase';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'حدث خطأ غير متوقع' };
  }

  public componentDidCatch(error: Error) {
    console.error('[ZENO ErrorBoundary]', error);
  }

  public render() {
    if (this.state.hasError) {
      const displayDetail = formatAppErrorMessage(
        this.state.errorMessage,
        'حدث خطأ غير متوقع، يرجى إعادة تحميل التطبيق.'
      );

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0e1621] p-6" dir="rtl">
          <div className="max-w-md w-full bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              تعذر إتمام العملية
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 break-words">
              {displayDetail}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
