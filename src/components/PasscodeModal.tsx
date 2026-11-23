import React, { useState } from 'react';
import { Delete, KeyRound, Lock, LogOut, ShieldCheck, Unlock, X } from 'lucide-react';
import { verifyPasscode } from '../lib/draftsAndLock';

interface PasscodeLockScreenProps {
  uid: string;
  displayName: string;
  onUnlock: () => void;
  onSignOut: () => void;
}

export const PasscodeLockScreen: React.FC<PasscodeLockScreenProps> = ({
  uid,
  displayName,
  onUnlock,
  onSignOut,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleDigit = async (digit: string) => {
    if (checking || pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);

    if (next.length === 4) {
      setChecking(true);
      const ok = await verifyPasscode(uid, next);
      setChecking(false);
      if (ok) {
        setPin('');
        onUnlock();
      } else {
        setError('الرمز السري غير صحيح، حاول مرة أخرى');
        setPin('');
      }
    }
  };

  const handleBackspace = () => {
    if (checking) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-50 dark:bg-[#0e1621] flex items-center justify-center p-6"
      dir="rtl"
    >
      <div className="w-full max-w-xs bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl p-6 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">التطبيق مقفل</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            أدخل الرمز السري (4 أرقام) لفتح حساب {displayName}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 py-1" dir="ltr">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all ${
                i < pin.length
                  ? 'bg-sky-600 scale-110'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        )}

        <div className="grid grid-cols-3 gap-2.5" dir="ltr">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => void handleDigit(d)}
              className="h-12 rounded-2xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-lg font-semibold text-slate-900 dark:text-white transition-colors cursor-pointer"
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={onSignOut}
            title="تسجيل الخروج"
            className="h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-center cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-lg font-semibold text-slate-900 dark:text-white transition-colors cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            title="مسح"
            className="h-12 rounded-2xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface PasscodeSetupModalProps {
  enabled: boolean;
  onSavePin: (pin: string) => Promise<void>;
  onDisablePin: () => void;
  onClose: () => void;
}

export const PasscodeSetupModal: React.FC<PasscodeSetupModalProps> = ({
  enabled,
  onSavePin,
  onDisablePin,
  onClose,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) {
      setError('يجب أن يتكون الرمز السري من 4 أرقام');
      return;
    }
    if (pin !== confirmPin) {
      setError('الرمزان غير متطابقين');
      return;
    }
    setSaving(true);
    try {
      await onSavePin(pin);
      onClose();
    } catch {
      setError('تعذر حفظ الرمز السري');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {enabled ? 'تعديل قفل التطبيق' : 'تفعيل قفل التطبيق (PIN)'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/50 text-xs text-sky-800 dark:text-sky-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              يحمي قفل التطبيق محادثاتك على هذا الجهاز برمز مرور مكون من 4 أرقام.
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              الرمز الجديد (4 أرقام)
            </label>
            <input
              type="password"
              inputMode="numeric"
              dir="ltr"
              maxLength={4}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/[^\d]/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="••••"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-center text-lg tracking-[0.5em] font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              تأكيد الرمز
            </label>
            <input
              type="password"
              inputMode="numeric"
              dir="ltr"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/[^\d]/g, '').slice(0, 4));
                setError(null);
              }}
              placeholder="••••"
              className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-center text-lg tracking-[0.5em] font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || pin.length < 4 || confirmPin.length < 4}
              className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الرمز'}
            </button>
            {enabled && (
              <button
                type="button"
                onClick={() => {
                  onDisablePin();
                  onClose();
                }}
                className="py-2.5 px-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>إلغاء القفل</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
