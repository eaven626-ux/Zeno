import React, { useState } from 'react';
import { CheckCircle2, Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  variant?: 'button' | 'icon' | 'rail' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'button' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [guideMode, setGuideMode] = useState<'ios' | 'android' | null>(null);

  if (isInstalled && variant !== 'card') {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    if (isIOS) {
      setGuideMode('ios');
      return;
    }
    setGuideMode('android');
  };

  // On desktop browsers where beforeinstallprompt isn't available, keep header/rail clean
  const showTrigger = isInstallable || isIOS || isAndroid;

  const modal = guideMode && (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      onClick={() => setGuideMode(null)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
              alt="شعار ZENO"
              className="w-9 h-9 rounded-xl object-cover shrink-0 shadow-xs"
            />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {guideMode === 'ios' ? 'تثبيت ZENO على آيفون' : 'تثبيت ZENO كتطبيق'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setGuideMode(null)}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          {guideMode === 'ios' ? (
            <ol className="space-y-3 text-xs leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>
                  افتح التطبيق في متصفح <strong>Safari</strong> ثم اضغط على أيقونة{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#242f3d] font-semibold">
                    <Share className="w-3.5 h-3.5 text-sky-500" />
                    مشاركة
                  </span>{' '}
                  في شريط المتصفح بالأسفل.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>
                  مرّر القائمة للأسفل واختر <strong>«إضافة إلى الشاشة الرئيسية»</strong> (Add to Home Screen).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>
                  اضغط <strong>«إضافة»</strong> ليظهر تطبيق <strong>ZENO</strong> بملء الشاشة على هاتفك.
                </span>
              </li>
            </ol>
          ) : (
            <ol className="space-y-3 text-xs leading-relaxed">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  1
                </span>
                <span>
                  افتح قائمة متصفح <strong>Chrome</strong> بالضغط على{' '}
                  <span className="inline-flex items-center px-1 py-0.5 rounded bg-slate-100 dark:bg-[#242f3d]">
                    <MoreVertical className="w-3.5 h-3.5 text-sky-500" />
                  </span>{' '}
                  في الزاوية العلوية.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  2
                </span>
                <span>
                  اختر <strong>«تثبيت التطبيق»</strong> أو <strong>«الإضافة إلى الشاشة الرئيسية»</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                  3
                </span>
                <span>
                  سيُثبّت تطبيق <strong>ZENO</strong> على جهاز الأندرويد ويعمل كتطبيق مستقل.
                </span>
              </li>
            </ol>
          )}

          <button
            type="button"
            onClick={() => setGuideMode(null)}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            فهمت
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === 'card') {
    return (
      <>
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
                alt="شعار ZENO"
                className="w-10 h-10 rounded-xl object-cover shrink-0 shadow-xs"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  تطبيق الهاتف (أندرويد وآيفون)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isInstalled
                    ? 'التطبيق مثبّت ويعمل كتطبيق مستقل'
                    : 'ثبّت ZENO على شاشتك الرئيسية للوصول السريع'}
                </div>
              </div>
            </div>
            {isInstalled && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
          </div>

          {!isInstalled && (
            <div className="flex flex-wrap items-center gap-2">
              {isInstallable ? (
                <button
                  type="button"
                  onClick={handleAction}
                  className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تثبيت التطبيق الآن</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setGuideMode('android')}
                    className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تثبيت للأندرويد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideMode('ios')}
                    className="flex-1 py-2 px-3 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Share className="w-3.5 h-3.5" />
                    <span>تثبيت للآيفون</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {modal}
      </>
    );
  }

  if (!showTrigger) {
    return null;
  }

  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={handleAction}
          title={isIOS ? 'تثبيت على آيفون' : 'تثبيت التطبيق على الهاتف'}
          className="p-2 rounded-xl text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors cursor-pointer"
        >
          <Download className="w-4.5 h-4.5" />
        </button>
        {modal}
      </>
    );
  }

  if (variant === 'rail') {
    return (
      <>
        <button
          type="button"
          onClick={handleAction}
          title="تثبيت التطبيق"
          className="w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 transition-colors cursor-pointer"
        >
          <Download className="w-4.5 h-4.5" />
          <span className="text-[10px] font-medium leading-none whitespace-nowrap">تثبيت</span>
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleAction}
        className="inline-flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#17212b] hover:bg-slate-100 dark:hover:bg-[#202b36] text-slate-800 dark:text-slate-100 font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4 text-sky-600 dark:text-sky-400" />
        <span>{isIOS ? 'تثبيت على الآيفون' : 'تثبيت التطبيق على الهاتف'}</span>
      </button>
      {modal}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-4 start-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg"
    >
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      <span>وضع عدم الاتصال — يتم استخدام البيانات المحفوظة</span>
    </div>
  );
};
