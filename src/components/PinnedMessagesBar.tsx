import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpLeft,
  BarChart2,
  ChevronDown,
  ChevronUp,
  FileText,
  Mic,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
import { Message } from '../types/telegram';
import { formatAudioDuration, formatDateSeparator, formatMessageTime } from '../lib/mediaUtils';
import { Avatar } from './Avatar';
import { StickerVisual } from './StickerArt';

interface PinnedMessagesBarProps {
  chatId: string;
  pinnedMessages: Message[];
  fallbackPinnedId?: string;
  fallbackPinnedText?: string;
  canPin: boolean;
  onJumpToMessage: (messageId: string) => void;
  onUnpinMessage: (message: Message) => Promise<void> | void;
  onUnpinAll: () => Promise<void> | void;
}

function getPinnedPreviewLabel(msg: Message): string {
  if (msg.text.trim()) return msg.text.trim();
  if (msg.type === 'image') return 'صورة';
  if (msg.type === 'sticker') return 'ملصق متحرك';
  if (msg.type === 'audio') {
    const dur = msg.mediaDurationSec ? ` (${formatAudioDuration(msg.mediaDurationSec)})` : '';
    return msg.fileName ? `${msg.fileName}${dur}` : `رسالة صوتية${dur}`;
  }
  if (msg.type === 'file') return msg.fileName ? `ملف: ${msg.fileName}` : 'ملف مرفق';
  if (msg.type === 'poll') return msg.pollQuestion ? `استطلاع: ${msg.pollQuestion}` : 'استطلاع رأي';
  return 'رسالة مثبتة';
}

export const PinnedMessagesBar: React.FC<PinnedMessagesBarProps> = ({
  chatId,
  pinnedMessages,
  fallbackPinnedId,
  fallbackPinnedText,
  canPin,
  onJumpToMessage,
  onUnpinMessage,
  onUnpinAll,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [confirmUnpinAll, setConfirmUnpinAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveIndex(0);
    setIsDrawerOpen(false);
    setConfirmUnpinAll(false);
    setBusyId(null);
  }, [chatId]);

  useEffect(() => {
    if (pinnedMessages.length === 0) {
      setActiveIndex(0);
      setIsDrawerOpen(false);
      setConfirmUnpinAll(false);
      return;
    }
    if (activeIndex >= pinnedMessages.length) {
      setActiveIndex(0);
    }
  }, [pinnedMessages.length, activeIndex]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDrawerOpen(false);
        setConfirmUnpinAll(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false);
        setConfirmUnpinAll(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isDrawerOpen]);

  const hasRichList = pinnedMessages.length > 0;
  const hasFallback = !hasRichList && Boolean(fallbackPinnedId && fallbackPinnedText);

  const visibleSegments = useMemo(() => {
    const total = Math.min(pinnedMessages.length, 4);
    if (total <= 1) return [];
    const activeSegment =
      pinnedMessages.length <= 4
        ? activeIndex
        : Math.min(total - 1, Math.floor((activeIndex / pinnedMessages.length) * total));
    return Array.from({ length: total }, (_, idx) => idx === activeSegment);
  }, [pinnedMessages.length, activeIndex]);

  if (!hasRichList && !hasFallback) return null;

  const currentMsg = hasRichList ? pinnedMessages[activeIndex] || pinnedMessages[0] : null;
  const totalCount = pinnedMessages.length;

  const handleBannerJump = () => {
    if (currentMsg) {
      onJumpToMessage(currentMsg.id);
      if (totalCount > 1) {
        setActiveIndex((prev) => (prev + 1) % totalCount);
      }
    } else if (fallbackPinnedId) {
      onJumpToMessage(fallbackPinnedId);
    }
  };

  const handleUnpinSingle = async (msg: Message) => {
    if (busyId) return;
    setBusyId(msg.id);
    try {
      await onUnpinMessage(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleUnpinAllConfirm = async () => {
    if (busyId) return;
    setBusyId('__all__');
    try {
      await onUnpinAll();
      setConfirmUnpinAll(false);
      setIsDrawerOpen(false);
    } finally {
      setBusyId(null);
    }
  };

  const renderThumb = (msg: Message, size: 'sm' | 'md') => {
    const boxClass = size === 'sm' ? 'w-8 h-8 rounded-lg' : 'w-10 h-10 rounded-xl';
    if (msg.type === 'image' && (msg.mediaUrl || msg.mediaDataUrl)) {
      return (
        <img
          src={msg.mediaUrl || msg.mediaDataUrl}
          alt={msg.text || 'صورة مثبتة'}
          referrerPolicy="no-referrer"
          className={`${boxClass} object-cover shrink-0 bg-slate-200 dark:bg-slate-800`}
        />
      );
    }
    if (msg.type === 'sticker') {
      return (
        <div className={`${boxClass} shrink-0 bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center p-0.5`}>
          <StickerVisual
            stickerId={msg.stickerId}
            mediaDataUrl={msg.mediaDataUrl}
            animation="none"
            label="ملصق"
            className="w-full h-full"
          />
        </div>
      );
    }
    if (size === 'md') {
      if (msg.type === 'audio') {
        return (
          <div className={`${boxClass} shrink-0 bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center`}>
            <Mic className="w-4 h-4" />
          </div>
        );
      }
      if (msg.type === 'file') {
        return (
          <div className={`${boxClass} shrink-0 bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center`}>
            <FileText className="w-4 h-4" />
          </div>
        );
      }
      if (msg.type === 'poll') {
        return (
          <div className={`${boxClass} shrink-0 bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center`}>
            <BarChart2 className="w-4 h-4" />
          </div>
        );
      }
      return (
        <Avatar
          name={msg.senderName}
          seed={msg.senderId}
          photoURL={msg.senderPhotoURL}
          size="sm"
        />
      );
    }
    return null;
  };

  return (
    <div ref={containerRef} className="relative z-20 shrink-0">
      {/* Compact Top Pinned Message Strip */}
      <div className="animate-zeno-slide-down px-3 sm:px-4 min-h-[48px] bg-white/95 dark:bg-[#17212b]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleBannerJump}
          title="اضغط للانتقال إلى موقع الرسالة في المحادثة"
          className="flex items-center gap-2.5 min-w-0 flex-1 min-h-[44px] py-1.5 text-start hover:opacity-90 transition-opacity cursor-pointer"
        >
          {/* Multi-message vertical segment tracker + Pin icon */}
          <div className="flex items-center gap-1.5 shrink-0">
            {visibleSegments.length > 0 && (
              <div className="flex flex-col gap-0.5" aria-hidden="true">
                {visibleSegments.map((isActive, idx) => (
                  <span
                    key={idx}
                    className={`w-0.5 rounded-full transition-colors duration-150 ${
                      visibleSegments.length <= 2 ? 'h-3' : visibleSegments.length === 3 ? 'h-2' : 'h-1.5'
                    } ${
                      isActive
                        ? 'bg-sky-600 dark:bg-sky-400'
                        : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            )}
            <div className="w-7 h-7 rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Pin className="w-3.5 h-3.5" />
            </div>
          </div>

          {currentMsg && renderThumb(currentMsg, 'sm')}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400 leading-tight">
              <span className="whitespace-nowrap">
                {totalCount > 1 ? 'الرسائل المثبتة' : 'رسالة مثبتة'}
              </span>
              {totalCount > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {activeIndex + 1} من {totalCount}
                  </span>
                </>
              )}
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-200 truncate mt-0.5">
              {currentMsg ? (
                <>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {currentMsg.senderName}:{' '}
                  </span>
                  <span>{getPinnedPreviewLabel(currentMsg)}</span>
                </>
              ) : (
                <span>{fallbackPinnedText}</span>
              )}
            </div>
          </div>
        </button>

        {/* Right Controls: Expand All List + Quick Unpin */}
        <div className="flex items-center gap-0.5 shrink-0">
          {hasRichList && (
            <button
              type="button"
              onClick={() => {
                setIsDrawerOpen((v) => !v);
                setConfirmUnpinAll(false);
              }}
              aria-expanded={isDrawerOpen}
              aria-label="عرض جميع الرسائل المثبتة"
              title={isDrawerOpen ? 'إخفاء القائمة' : 'عرض جميع الرسائل المثبتة'}
              className={`tap-press min-h-[44px] min-w-[44px] px-2 rounded-xl inline-flex items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                isDrawerOpen
                  ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {totalCount > 1 && <span className="tabular-nums">{totalCount}</span>}
              {isDrawerOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          )}

          {canPin && totalCount <= 1 && (
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => {
                if (currentMsg) {
                  handleUnpinSingle(currentMsg);
                } else {
                  onUnpinAll();
                }
              }}
              title="إلغاء التثبيت"
              aria-label="إلغاء تثبيت الرسالة"
              className="tap-press min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Pinned Messages Drawer Panel */}
      {isDrawerOpen && hasRichList && (
        <div
          role="region"
          aria-label="قائمة الرسائل المثبتة"
          className="animate-zeno-slide-down absolute top-full inset-x-0 bg-white/98 dark:bg-[#17212b]/98 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xl max-h-[55vh] flex flex-col"
        >
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Pin className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                الرسائل المثبتة
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                · {totalCount}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {canPin && totalCount > 1 && (
                !confirmUnpinAll ? (
                  <button
                    type="button"
                    onClick={() => setConfirmUnpinAll(true)}
                    className="tap-press min-h-[36px] px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 whitespace-nowrap cursor-pointer"
                  >
                    إلغاء تثبيت الكل
                  </button>
                ) : (
                  <div className="flex items-center gap-1 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg px-2 py-1 text-[11px]">
                    <span className="text-red-700 dark:text-red-300 font-medium whitespace-nowrap">
                      إلغاء الكل؟
                    </span>
                    <button
                      type="button"
                      disabled={busyId === '__all__'}
                      onClick={handleUnpinAllConfirm}
                      className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer disabled:opacity-50"
                    >
                      تأكيد
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnpinAll(false)}
                      className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )
              )}
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(false);
                  setConfirmUnpinAll(false);
                }}
                aria-label="إغلاق قائمة الرسائل المثبتة"
                className="tap-press min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto slim-scroll divide-y divide-slate-100 dark:divide-slate-800/70">
            {pinnedMessages.map((msg, idx) => {
              const isCurrent = idx === activeIndex;
              return (
                <div
                  key={msg.id}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-2 transition-colors ${
                    isCurrent
                      ? 'bg-sky-500/[0.06] dark:bg-sky-400/[0.08]'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIndex(idx);
                      setIsDrawerOpen(false);
                      setConfirmUnpinAll(false);
                      onJumpToMessage(msg.id);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 min-h-[48px] text-start cursor-pointer"
                  >
                    {renderThumb(msg, 'md')}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-900 dark:text-white truncate">
                          {msg.senderName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums shrink-0">
                          {formatDateSeparator(msg.createdAt)} · {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 mt-0.5 leading-relaxed">
                        {getPinnedPreviewLabel(msg)}
                      </p>
                    </div>
                    <span
                      title="الانتقال إلى الرسالة"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 shrink-0 whitespace-nowrap"
                    >
                      <ArrowUpLeft className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">انتقال</span>
                    </span>
                  </button>

                  {canPin && (
                    <button
                      type="button"
                      disabled={busyId === msg.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnpinSingle(msg);
                      }}
                      title="إلغاء تثبيت هذه الرسالة"
                      aria-label="إلغاء تثبيت هذه الرسالة"
                      className="tap-press min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 shrink-0 cursor-pointer"
                    >
                      <PinOff className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
