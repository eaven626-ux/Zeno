import React, { useEffect, useRef, useState } from 'react';
import { signInWithPopup, type User } from 'firebase/auth';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth, googleProvider } from '../lib/firebase';
import { PWAInstallButton } from './PWAComponents';
import { PrivacyModal } from './Modals';

interface AuthScreenProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  syncError?: string | null;
  onRetrySync?: () => void;
  onSignOutSync?: () => void;
  onSignedInUser?: (user: User) => void;
  notice?: string | null;
  onDismissNotice?: () => void;
}

function mapGoogleAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'تم إلغاء نافذة تسجيل الدخول بحساب Google. يمكنك المحاولة مرة أخرى.';
  }
  if (code === 'auth/popup-blocked') {
    return 'قام المتصفح بحظر نافذة تسجيل الدخول المنبثقة. يرجى السماح بالنوافذ المنبثقة لهذا الموقع ثم المحاولة مجدداً.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return host
      ? `هذا النطاق (${host}) غير مضاف إلى النطاقات المصرح بها في Firebase Authentication (Authorized domains).`
      : 'هذا النطاق غير مضاف إلى النطاقات المصرح بها في Firebase Authentication (Authorized domains).';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول بحساب Google غير مفعّل في إعدادات Firebase Authentication.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بالشبكة. تحقق من اتصال الإنترنت وحاول مرة أخرى.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'يوجد حساب مسجل مسبقاً بطريقة دخول أخرى.';
  }
  return 'تعذر إتمام تسجيل الدخول بحساب Google. يرجى المحاولة مرة أخرى.';
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  onToggleTheme,
  syncError,
  onRetrySync,
  onSignOutSync,
  onSignedInUser,
  notice,
  onDismissNotice,
}) => {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    setErrorCode(null);
    onDismissNotice?.();
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (credential.user && isMountedRef.current) {
        onSignedInUser?.(credential.user);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : null;
      setErrorCode(code);
      setError(mapGoogleAuthError(err));
    } finally {
      if (isMountedRef.current) {
        setGoogleLoading(false);
      }
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-slate-50 dark:bg-[#0e1621] text-slate-900 dark:text-slate-100 flex flex-col justify-between overflow-y-auto"
      dir="rtl"
    >
      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <img
            src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
            alt="شعار ZENO"
            className="w-10 h-10 rounded-xl object-cover shadow-xs shrink-0"
          />
          <div className="min-w-0">
            <span className="block font-display text-lg sm:text-xl font-bold tracking-tight">
              ZENO
            </span>
            <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              التطبيق بإدارة المهندس أمير
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
        </button>
      </header>

      <main className="w-full max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight [text-wrap:balance] mb-4">
            تواصل فوري، قنوات عامة، ومجموعات سحابية متزامنة.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl mb-6">
            سجّل الدخول فوراً بحساب Google للوصول إلى محادثاتك ومجموعاتك وقنواتك السحابية في الوقت الحقيقي.
          </p>

          <div className="rounded-2xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 shadow-sm p-5 mb-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    دخول فوري ومجاني بحساب Google
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    اضغط أدناه للمتابعة مباشرة إلى محادثاتك وحفظها سحابياً
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="flex-1 min-h-[46px] inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap shadow-xs"
                >
                  {googleLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                        />
                      </svg>
                    </span>
                  )}
                  <span>{googleLoading ? 'جاري تسجيل الدخول...' : 'المتابعة باستخدام حساب Google'}</span>
                </button>
                <PWAInstallButton variant="button" />
              </div>
            </div>

            {notice && !error && !syncError && (
              <div className="mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {(error || syncError) && (
              <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs sm:text-sm text-red-700 dark:text-red-300 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="font-medium leading-relaxed">{error || syncError}</span>
                  {!error && syncError && (onRetrySync || onSignOutSync) && (
                    <div className="flex items-center gap-2 shrink-0">
                      {onRetrySync && (
                        <button
                          type="button"
                          onClick={onRetrySync}
                          className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          إعادة المحاولة
                        </button>
                      )}
                      {onSignOutSync && (
                        <button
                          type="button"
                          onClick={onSignOutSync}
                          className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-xs font-semibold cursor-pointer"
                        >
                          تسجيل الخروج
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {!error && syncError && syncError.includes('الحد اليومي') && (
                  <div className="pt-2 border-t border-red-200/80 dark:border-red-800/70 text-xs space-y-2 text-red-800 dark:text-red-200">
                    <p className="leading-relaxed">
                      تُعاد تعبئة الحصة المجانية تلقائياً في اليوم التالي، ويمكنك الاطلاع على تفاصيل حدود خطة Spark (Enterprise edition) أو إدارة قاعدة البيانات من وحدة التحكم:
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح قاعدة البيانات في Firebase Console</span>
                      </a>
                      <a
                        href="https://firebase.google.com/pricing#cloud-firestore"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>تفاصيل حدود خطة Spark</span>
                      </a>
                    </div>
                  </div>
                )}

                {error && errorCode === 'auth/unauthorized-domain' && typeof window !== 'undefined' && (
                  <div className="pt-2 border-t border-red-200/80 dark:border-red-800/70 text-xs space-y-2 text-red-800 dark:text-red-200">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>إضافة النطاق في Firebase Console</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(window.location.hostname).then(() => {
                            setCopiedDomain(true);
                            window.setTimeout(() => setCopiedDomain(false), 2000);
                          }).catch(() => {});
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-xs font-semibold cursor-pointer"
                      >
                        {copiedDomain ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedDomain ? 'تم نسخ النطاق' : 'نسخ النطاق الحالي'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-slate-200 dark:border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                <Users className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>مجموعات وقنوات</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                أدوار المالك والمشرفين، استطلاعات الرأي، وتثبيت الرسائل.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>مزامنة فورية</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                وصول فوري للرسائل والوسائط والرسائل المحفوظة عبر جلساتك.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>خصوصية محكمة</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                دخول موثق وعزل تام لبيانات الحساب والرسائل السحابية.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex items-stretch">
          <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-[#0b0c10] min-h-[300px] flex items-center justify-center p-4">
            <img
              src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
              alt="شعار تطبيق ZENO للمراسلة السحابية"
              className="w-full max-w-[420px] aspect-square object-contain rounded-2xl"
            />
          </div>
        </div>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-6 py-4 text-xs text-slate-500 dark:text-slate-500 flex items-center justify-between gap-4">
        <span>التطبيق بإدارة المهندس أمير</span>
        <button
          type="button"
          onClick={() => setShowPrivacy(true)}
          className="hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
        >
          سياسة الخصوصية وشروط الاستخدام
        </button>
      </footer>
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
    </div>
  );
};
