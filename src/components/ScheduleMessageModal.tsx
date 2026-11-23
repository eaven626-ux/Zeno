import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  Clock,
  Edit3,
  Loader2,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Message, ScheduledMessage } from '../types/telegram';
import { formatRemainingCountdown } from '../lib/mediaUtils';
import { formatAppErrorMessage } from '../lib/firebase';
import { StickerVisual } from './StickerArt';

interface ScheduleMessageModalProps {
  mode: 'compose' | 'queue';
  initialText: string;
  replyTo?: Message | null;
  scheduledMessages: ScheduledMessage[];
  onClose: () => void;
  onSchedule: (scheduledFor: number, finalText: string) => Promise<void>;
  onSendNow: (scheduled: ScheduledMessage) => Promise<void>;
  onReschedule: (scheduledId: string, scheduledFor: number, newText?: string) => Promise<void>;
  onCancelScheduled: (scheduledId: string) => Promise<void>;
}

function toLocalDateStr(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalTimeStr(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function combineLocalDateTime(dateStr: string, timeStr: string): number {
  if (!dateStr || !timeStr) return NaN;
  const parsed = new Date(`${dateStr}T${timeStr}:00`);
  return parsed.getTime();
}

function formatArabicDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export const ScheduleMessageModal: React.FC<ScheduleMessageModalProps> = ({
  mode: initialMode,
  initialText,
  replyTo,
  scheduledMessages,
  onClose,
  onSchedule,
  onSendNow,
  onReschedule,
  onCancelScheduled,
}) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'queue'>(initialMode);
  const [messageText, setMessageText] = useState(initialText);

  const defaultTargetMs = useMemo(() => {
    const t = Date.now() + 15 * 60 * 1000;
    return Math.ceil(t / 60000) * 60000;
  }, []);

  const [dateStr, setDateStr] = useState(() => toLocalDateStr(defaultTargetMs));
  const [timeStr, setTimeStr] = useState(() => toLocalTimeStr(defaultTargetMs));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Inline edit state inside Queue tab
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDateStr, setEditDateStr] = useState('');
  const [editTimeStr, setEditTimeStr] = useState('');
  const [editText, setEditText] = useState('');
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedMs = useMemo(() => combineLocalDateTime(dateStr, timeStr), [dateStr, timeStr]);
  const isSelectedValid = Number.isFinite(selectedMs) && selectedMs >= nowMs + 15000;
  const remainingSec = isSelectedValid ? Math.ceil((selectedMs - nowMs) / 1000) : 0;

  const applyPreset = (targetMs: number) => {
    setError(null);
    setDateStr(toLocalDateStr(targetMs));
    setTimeStr(toLocalTimeStr(targetMs));
  };

  const getTomorrowNineMs = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.getTime();
  };

  const getTonightEightMs = () => {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    if (d.getTime() <= Date.now() + 60000) {
      d.setDate(d.getDate() + 1);
    }
    return d.getTime();
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed) {
      setError('يرجى كتابة نص الرسالة المراد جدولتها');
      return;
    }
    const targetMs = combineLocalDateTime(dateStr, timeStr);
    if (!Number.isFinite(targetMs) || targetMs < Date.now() + 15000) {
      setError('يرجى اختيار تاريخ ووقت مستقبلي بعد 15 ثانية على الأقل من الآن');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSchedule(targetMs, trimmed);
      onClose();
    } catch (err) {
      setError(formatAppErrorMessage(err, 'تعذر جدولة الرسالة'));
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingItem = (item: ScheduledMessage) => {
    setError(null);
    setEditingId(item.id);
    const baseMs = Math.max(item.scheduledFor, Date.now() + 5 * 60 * 1000);
    setEditDateStr(toLocalDateStr(baseMs));
    setEditTimeStr(toLocalTimeStr(baseMs));
    setEditText(item.text);
  };

  const saveEditingItem = async (item: ScheduledMessage) => {
    const nextMs = combineLocalDateTime(editDateStr, editTimeStr);
    if (!Number.isFinite(nextMs) || nextMs < Date.now() + 15000) {
      setError('يرجى اختيار وقت مستقبلي بعد 15 ثانية على الأقل');
      return;
    }
    if (item.type === 'text' && !editText.trim()) {
      setError('نص الرسالة لا يمكن أن يكون فارغاً');
      return;
    }
    setBusyItemId(item.id);
    setError(null);
    try {
      await onReschedule(item.id, nextMs, item.type === 'text' ? editText.trim() : undefined);
      setEditingId(null);
    } catch (err) {
      setError(formatAppErrorMessage(err, 'تعذر تعديل موعد الرسالة'));
    } finally {
      setBusyItemId(null);
    }
  };

  const sortedQueue = useMemo(
    () =>
      [...scheduledMessages]
        .filter((s) => s.status === 'pending')
        .sort((a, b) => a.scheduledFor - b.scheduledFor),
    [scheduledMessages]
  );

  return (
    <div
      onClick={onClose}
      dir="rtl"
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                جدولة الرسائل
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                أرسل رسائلك تلقائياً في الوقت الذي تحدده
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 pt-3 shrink-0">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#202b36]">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveTab('compose');
              }}
              className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'compose'
                  ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              جدولة رسالة جديدة
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveTab('queue');
              }}
              className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span>الرسائل المجدولة</span>
              {sortedQueue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[10px] tabular-nums">
                  {sortedQueue.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto slim-scroll space-y-4">
          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          {activeTab === 'compose' ? (
            <form onSubmit={handleScheduleSubmit} className="space-y-4">
              {replyTo && (
                <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/80 dark:border-slate-700/70 text-xs">
                  <div className="font-semibold text-sky-600 dark:text-sky-400 truncate">
                    رداً على {replyTo.senderName}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 truncate">
                    {replyTo.text || 'رسالة'}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                  نص الرسالة
                </label>
                <textarea
                  rows={3}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="اكتب الرسالة التي ترغب في جدولتها..."
                  className="w-full p-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 resize-none"
                />
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                  اختيار سريع للوقت
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset(Date.now() + 5 * 60 * 1000)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-transparent hover:border-sky-300 dark:hover:border-sky-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    بعد 5 دقائق
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(Date.now() + 15 * 60 * 1000)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-transparent hover:border-sky-300 dark:hover:border-sky-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    بعد 15 دقيقة
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(Date.now() + 60 * 60 * 1000)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-transparent hover:border-sky-300 dark:hover:border-sky-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    بعد ساعة
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(getTomorrowNineMs())}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-transparent hover:border-sky-300 dark:hover:border-sky-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    غداً 9:00 صباحاً
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset(getTonightEightMs())}
                    className="col-span-2 min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 border border-transparent hover:border-sky-300 dark:hover:border-sky-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    الساعة 8:00 مساءً
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    dir="ltr"
                    required
                    min={toLocalDateStr(Date.now())}
                    value={dateStr}
                    onChange={(e) => {
                      setError(null);
                      setDateStr(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    الوقت
                  </label>
                  <input
                    type="time"
                    dir="ltr"
                    required
                    value={timeStr}
                    onChange={(e) => {
                      setError(null);
                      setTimeStr(e.target.value);
                    }}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-xl bg-sky-50/90 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-900/50 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0 text-slate-700 dark:text-slate-200">
                  <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span className="truncate">
                    {isSelectedValid
                      ? `الإرسال: ${formatArabicDateTime(selectedMs)}`
                      : 'الوقت المختار في الماضي — اختر وقتاً مستقبلياً'}
                  </span>
                </div>
                {isSelectedValid && (
                  <span className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                    خلال {formatRemainingCountdown(remainingSec)}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !isSelectedValid || !messageText.trim()}
                className="w-full min-h-[46px] rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CalendarClock className="w-4 h-4" />
                )}
                <span>{submitting ? 'جاري الجدولة...' : 'تأكيد جدولة الرسالة'}</span>
              </button>
            </form>
          ) : sortedQueue.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <CalendarClock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                لا توجد رسائل مجدولة في هذه المحادثة
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                انتقل إلى تبويب «جدولة رسالة جديدة» لتحديد موعد إرسال رسالة.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedQueue.map((item) => {
                const secLeft = Math.max(0, Math.ceil((item.scheduledFor - nowMs) / 1000));
                const isEditing = editingId === item.id;
                const isBusy = busyItemId === item.id;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/80 dark:border-slate-700/70 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-sky-600 dark:text-sky-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatArabicDateTime(item.scheduledFor)}</span>
                      </span>
                      <span className="font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                        {secLeft <= 0 ? 'جاري الإرسال...' : `بعد ${formatRemainingCountdown(secLeft)}`}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2.5 pt-1">
                        {item.type === 'text' && (
                          <textarea
                            rows={2}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2.5 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 resize-none"
                          />
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            dir="ltr"
                            min={toLocalDateStr(Date.now())}
                            value={editDateStr}
                            onChange={(e) => setEditDateStr(e.target.value)}
                            className="min-h-[40px] px-2.5 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                          />
                          <input
                            type="time"
                            dir="ltr"
                            value={editTimeStr}
                            onChange={(e) => setEditTimeStr(e.target.value)}
                            className="min-h-[40px] px-2.5 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                          >
                            إلغاء
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => saveEditingItem(item)}
                            className="min-h-[38px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            <span>حفظ</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {item.type === 'sticker' ? (
                          <div className="flex items-center gap-2.5">
                            <StickerVisual
                              stickerId={item.stickerId}
                              mediaDataUrl={item.mediaDataUrl}
                              animation="none"
                              label="ملصق"
                              className="w-11 h-11"
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              ملصق متحرك مجدول
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed">
                            {item.text}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyItemId(item.id);
                              setError(null);
                              try {
                                await onSendNow(item);
                              } catch (err) {
                                setError(formatAppErrorMessage(err, 'تعذر الإرسال الآن'));
                              } finally {
                                setBusyItemId(null);
                              }
                            }}
                            className="min-h-[40px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {isBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5 -translate-x-0.5" />
                            )}
                            <span>إرسال الآن</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => startEditingItem(item)}
                            className="min-h-[40px] px-3 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل الموعد</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={async () => {
                              setBusyItemId(item.id);
                              setError(null);
                              try {
                                await onCancelScheduled(item.id);
                              } catch (err) {
                                setError(formatAppErrorMessage(err, 'تعذر إلغاء الجدولة'));
                              } finally {
                                setBusyItemId(null);
                              }
                            }}
                            className="min-h-[40px] px-3 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1.5 ms-auto cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>إلغاء</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
