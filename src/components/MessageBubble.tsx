import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit2,
  ExternalLink,
  Eye,
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Forward,
  Globe,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  Reply,
  SmilePlus,
  Square,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  ChatType,
  LightboxState,
  Message,
  MessageReaction,
  MessageReadReceiptInfo,
  PollVote,
} from '../types/telegram';
import { getMessageDownloadUrl } from '../lib/chatService';
import {
  formatFileSize,
  formatMessageTime,
  formatRemainingCountdown,
  triggerFileDownload,
} from '../lib/mediaUtils';
import { extractUrlsFromText } from '../lib/searchUtils';
import { Avatar } from './Avatar';
import { StickerVisual } from './StickerArt';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';

interface MessageBubbleProps {
  message: Message;
  groupedImageMessages?: Message[];
  chatType: ChatType;
  isOwn: boolean;
  isAdminOrOwner: boolean;
  showSenderInfo: boolean;
  isHighlighted: boolean;
  isReadByPeer: boolean;
  readReceipt?: MessageReadReceiptInfo;
  showReadReceiptBelow?: boolean;
  onOpenReadReceiptDetails?: (message: Message) => void;
  currentUid: string;
  reactions: MessageReaction[];
  pollVotes: PollVote[];
  fontSize: 'small' | 'medium' | 'large';
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  onDeleteMessages?: (messages: Message[]) => void;
  onPin: (message: Message) => void;
  onForward: (message: Message) => void;
  onForwardMessages?: (messages: Message[]) => void;
  onSendToWhatsApp?: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string, currentEmoji?: string) => void;
  onCastVote: (messageId: string, optionIndex: number, alreadyVoted: boolean) => void;
  onJumpToMessage: (messageId: string) => void;
  onOpenImage: (src: string, gallery?: LightboxState) => void;
  remainingSec?: number | null;
  canReply?: boolean;
  isFirstMessage?: boolean;
  isPinned?: boolean;
  isActionMenuOpen?: boolean;
  onToggleActionMenu?: (messageId: string | null) => void;
  protectContent?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (message: Message) => void;
  onToggleSelectMessages?: (messages: Message[]) => void;
  commentCount?: number;
  allowComments?: boolean;
  onOpenComments?: (message: Message) => void;
  currentUsername?: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '😮', '😢', '👏'];
const EXTRA_REACTIONS = [
  '😍', '🥳', '🎉', '🙏', '💯', '🤩',
  '😭', '😡', '🤯', '🤔', '👀', '✨',
  '⚡', '💪', '🤝', '💔', '🫡', '🌹',
];

function normalizeHref(rawUrl: string): string {
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

function parseUrlDisplay(rawUrl: string): { host: string; path: string; href: string } {
  const href = normalizeHref(rawUrl);
  try {
    const parsed = new URL(href);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return {
      host: parsed.hostname.replace(/^www\./i, ''),
      path: path === '/' ? '' : path,
      href,
    };
  } catch {
    return {
      host: rawUrl,
      path: '',
      href,
    };
  }
}

function renderTextWithMentions(text: string, currentUsername?: string): React.ReactNode {
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s<>"']+|@[a-zA-Z0-9_]{3,32})/gi);
  if (parts.length <= 1) return text;
  const normalizedMe = currentUsername?.toLowerCase();
  return parts.map((part, idx) => {
    if (!part) return null;
    if (/^(?:https?:\/\/|www\.)/i.test(part)) {
      const href = normalizeHref(part);
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
          className="inline-block max-w-full underline decoration-sky-500/60 underline-offset-2 text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 break-all"
        >
          {part}
        </a>
      );
    }
    if (/^@[a-zA-Z0-9_]{3,32}$/.test(part)) {
      const isMe = normalizedMe && part.slice(1).toLowerCase() === normalizedMe;
      return (
        <span
          key={idx}
          dir="ltr"
          className={`inline-block px-1 rounded font-mono font-semibold ${
            isMe
              ? 'bg-amber-400/30 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500/40'
              : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
          }`}
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function getFileTypeVisual(fileName?: string, mimeType?: string) {
  const name = (fileName || '').toLowerCase();
  const extMatch = name.match(/\.([a-z0-9]{1,5})$/);
  const ext = (extMatch?.[1] || '').toUpperCase();

  if (ext === 'PDF' || mimeType === 'application/pdf') {
    return {
      ext: 'PDF',
      typeLabel: 'مستند PDF',
      boxClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
      Icon: FileText,
    };
  }
  if (/^(XLS|XLSX|CSV|ODS)$/.test(ext)) {
    return {
      ext: ext || 'XLS',
      typeLabel: 'جدول بيانات',
      boxClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
      Icon: FileSpreadsheet,
    };
  }
  if (/^(ZIP|RAR|7Z|TAR|GZ)$/.test(ext)) {
    return {
      ext: ext || 'ZIP',
      typeLabel: 'ملف مضغوط',
      boxClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
      Icon: FileArchive,
    };
  }
  if (/^(JS|TS|TSX|JSX|JSON|HTML|CSS|PY|JAVA|KT|SWIFT|SH|SQL|MD|YAML|YML)$/.test(ext)) {
    return {
      ext: ext.slice(0, 4) || 'CODE',
      typeLabel: 'ملف برمجي',
      boxClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-300',
      Icon: FileCode,
    };
  }
  if (/^(MP4|MOV|WEBM|MKV|AVI)$/.test(ext) || mimeType?.startsWith('video/')) {
    return {
      ext: ext || 'VID',
      typeLabel: 'ملف فيديو',
      boxClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
      Icon: Film,
    };
  }
  if (/^(DOC|DOCX|TXT|RTF|ODT)$/.test(ext)) {
    return {
      ext: ext || 'DOC',
      typeLabel: 'مستند نصي',
      boxClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
      Icon: FileText,
    };
  }
  return {
    ext: ext.slice(0, 4) || 'FILE',
    typeLabel: 'ملف مرفق',
    boxClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
    Icon: File,
  };
}

const ResilientChatImage: React.FC<{
  src: string;
  alt: string;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}> = ({ src, alt, onClick, className = '' }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center gap-1.5 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 p-3 ${className}`}>
        <ImageIcon className="w-6 h-6 opacity-70" />
        <span className="text-[11px] font-medium text-center">تعذر تحميل الصورة</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      onClick={onClick}
      className={className}
    />
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({
  message,
  groupedImageMessages,
  chatType,
  isOwn,
  isAdminOrOwner,
  showSenderInfo,
  isHighlighted,
  isReadByPeer,
  readReceipt,
  showReadReceiptBelow = false,
  onOpenReadReceiptDetails,
  currentUid,
  reactions,
  pollVotes,
  fontSize,
  onReply,
  onEdit,
  onDelete,
  onDeleteMessages,
  onPin,
  onForward,
  onForwardMessages,
  onSendToWhatsApp,
  onToggleReaction,
  onCastVote,
  onJumpToMessage,
  onOpenImage,
  remainingSec,
  canReply = true,
  isFirstMessage = false,
  isPinned = false,
  isActionMenuOpen = false,
  onToggleActionMenu,
  protectContent = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
  onToggleSelectMessages,
  commentCount = 0,
  allowComments = true,
  onOpenComments,
  currentUsername,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const [pickerOnlyMode, setPickerOnlyMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeRef = useRef<{
    startX: number;
    startY: number;
    locked: 'h' | 'v' | null;
    triggered: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  useEffect(() => {
    setConfirmDelete(false);
    setShowPicker(false);
    setShowAllEmojis(false);
    setPickerOnlyMode(false);
  }, [message.id]);

  useEffect(() => {
    if (!isActionMenuOpen) {
      setConfirmDelete(false);
      setShowPicker(false);
      setShowAllEmojis(false);
      setPickerOnlyMode(false);
    }
  }, [isActionMenuOpen]);

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-1 rounded-full bg-slate-900/20 dark:bg-slate-950/45 text-white text-xs font-medium backdrop-blur-xs">
          {message.text}
        </span>
      </div>
    );
  }

  const textSizeClass =
    fontSize === 'small' ? 'text-[13px]' : fontSize === 'large' ? 'text-[16px]' : 'text-[14.5px]';

  const myReaction = reactions.find((r) => r.uid === currentUid);
  const reactionCounts = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});
  const groupedReactions = Object.entries(reactionCounts).sort((a, b) => b[1] - a[1]);

  const myVote = pollVotes.find((v) => v.uid === currentUid);
  const totalVotes = pollVotes.length;

  const handleDownloadAttachment = async (fallbackName: string) => {
    if (loadingMedia) return;
    setLoadingMedia(true);
    setDownloadDone(false);
    setDownloadProgress(message.mediaChunkCount ? 0 : null);
    try {
      const url =
        resolvedMediaUrl || (await getMessageDownloadUrl(message, (pct) => setDownloadProgress(pct)));
      setResolvedMediaUrl(url);
      triggerFileDownload(url, message.fileName || fallbackName);
      setDownloadDone(true);
      window.setTimeout(() => setDownloadDone(false), 1800);
    } catch {
      // Download failed (e.g. offline)
    } finally {
      setLoadingMedia(false);
      setDownloadProgress(null);
    }
  };

  const isAlbum = Boolean(groupedImageMessages && groupedImageMessages.length > 1);
  const albumItems = isAlbum ? groupedImageMessages! : [];
  const primaryDisplayText = isAlbum
    ? albumItems
        .map((m) => m.text?.trim())
        .filter((t): t is string => Boolean(t))
        .join('\n')
    : message.text;
  const albumHeaderSource = isAlbum ? albumItems[0] : message;

  const handleCopy = () => {
    if (!primaryDisplayText) return;
    navigator.clipboard.writeText(primaryDisplayText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const restrictContentActions = Boolean(protectContent && !isAdminOrOwner);
  const canPin = !isAlbum && (chatType !== 'channel' || isAdminOrOwner);
  const canDelete = !message.isDeleted && (isOwn || isAdminOrOwner || chatType === 'direct');
  const canEdit = !isAlbum && !message.isDeleted && isOwn && message.type === 'text';
  const allowSwipeReply = !selectionMode && canReply && !message.isDeleted;

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!allowSwipeReply || e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeRef.current = {
      startX: t.clientX,
      startY: t.clientY,
      locked: null,
      triggered: false,
    };
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const state = swipeRef.current;
    if (!state || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    if (!state.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        state.locked = 'v';
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        state.locked = 'h';
      } else {
        return;
      }
    }

    if (state.locked !== 'h') return;

    // Swipe inward toward center in RTL: own bubbles (right) swipe left (dx < 0), peer bubbles (left) swipe right (dx > 0)
    const clamped = isOwn
      ? Math.max(-60, Math.min(0, dx))
      : Math.min(60, Math.max(0, dx));

    if (Math.abs(clamped) >= 42 && !state.triggered) {
      state.triggered = true;
      try {
        navigator.vibrate?.(12);
      } catch {
        // Ignore on unsupported browsers
      }
    }
    setSwipeOffset(clamped);
  };

  const finishSwipe = () => {
    const state = swipeRef.current;
    swipeRef.current = null;
    if (state?.triggered) {
      onReply(message);
    }
    setSwipeOffset(0);
  };

  const swipeProgress = Math.min(1, Math.abs(swipeOffset) / 42);

  const isStickerMsg = message.type === 'sticker' && !message.isDeleted;
  const hasChannelCommentBar =
    chatType === 'channel' && !message.isDeleted && (allowComments || commentCount > 0) && Boolean(onOpenComments);
  const isVisualMediaOnly =
    !message.isDeleted &&
    (isAlbum || (message.type === 'image' && Boolean(message.mediaUrl || message.mediaDataUrl))) &&
    !primaryDisplayText &&
    !albumHeaderSource.replyToId &&
    !albumHeaderSource.forwardedFromName &&
    !(!isOwn && showSenderInfo && chatType === 'group') &&
    !hasChannelCommentBar;

  const handleSelectTarget = () => {
    if (isAlbum && onToggleSelectMessages) {
      onToggleSelectMessages(albumItems);
    } else {
      onToggleSelect?.(message);
    }
  };

  return (
    <div
      id={`msg-${message.id}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={finishSwipe}
      onTouchCancel={finishSwipe}
      onClick={() => {
        if (selectionMode && !message.isDeleted && (onToggleSelect || onToggleSelectMessages)) {
          handleSelectTarget();
        }
      }}
      className={`group animate-zeno-msg relative flex items-end gap-2 touch-pan-y transition-colors duration-300 ${
        isOwn ? 'justify-start' : 'justify-end'
      } ${
        selectionMode && !message.isDeleted ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'bg-sky-500/15 dark:bg-sky-400/15 rounded-2xl py-1 px-1.5'
          : isHighlighted
          ? 'bg-sky-500/20 dark:bg-sky-400/20 ring-2 ring-sky-500/55 rounded-2xl py-1 px-1.5'
          : ''
      }`}
    >
      {isAlbum &&
        albumItems.map((item) =>
          item.id !== message.id ? (
            <span key={item.id} id={`msg-${item.id}`} className="sr-only" aria-hidden="true" />
          ) : null
        )}
      {/* Multi-Select Checkbox */}
      {selectionMode && !message.isDeleted && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleSelectTarget();
          }}
          aria-label={isSelected ? 'إلغاء تحديد الرسالة' : 'تحديد الرسالة'}
          className="self-center p-1 text-sky-600 dark:text-sky-400 shrink-0 cursor-pointer"
        >
          {isSelected ? <CheckSquare className="w-4.5 h-4.5" /> : <Square className="w-4.5 h-4.5 text-slate-400" />}
        </button>
      )}

      {/* Swipe-to-Reply Indicator */}
      {Math.abs(swipeOffset) > 6 && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${
            isOwn ? 'start-2' : 'end-2'
          } w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150 ${
            swipeProgress >= 1
              ? 'bg-sky-600 text-white shadow-md'
              : 'bg-white/90 dark:bg-[#242f3d]/90 text-sky-600 dark:text-sky-300 shadow-xs'
          }`}
          style={{
            opacity: swipeProgress,
            transform: `translate3d(0, -50%, 0) scale(${0.7 + swipeProgress * 0.35})`,
          }}
        >
          <Reply className="w-4 h-4" />
        </div>
      )}

      {/* Avatar for incoming group messages */}
      {!isOwn && chatType === 'group' && (
        <div className="w-8 shrink-0">
          {showSenderInfo && (
            <Avatar
              name={message.senderName}
              seed={message.senderId}
              photoURL={message.senderPhotoURL}
              size="xs"
            />
          )}
        </div>
      )}

      <div
        className={`flex flex-col ${
          isOwn ? 'items-start' : 'items-end'
        } max-w-[82%] sm:max-w-[70%] lg:max-w-[60%]`}
      >
        <div
          data-msg-bubble={message.id}
          onPointerDown={(e) => {
            if (message.isDeleted || selectionMode) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('button, a, audio, input, textarea, [data-msg-actions], [data-no-bubble-toggle]')) {
              return;
            }
            clearLongPressTimer();
            longPressTriggeredRef.current = false;
            longPressOriginRef.current = { x: e.clientX, y: e.clientY };
            longPressTimerRef.current = window.setTimeout(() => {
              longPressTimerRef.current = null;
              longPressOriginRef.current = null;
              longPressTriggeredRef.current = true;
              try {
                navigator.vibrate?.(16);
              } catch {
                // Ignore unsupported vibration
              }
              setPickerOnlyMode(true);
              setShowAllEmojis(false);
              setShowPicker(true);
              onToggleActionMenu?.(message.id);
              window.setTimeout(() => {
                longPressTriggeredRef.current = false;
              }, 400);
            }, 420);
          }}
          onPointerMove={(e) => {
            const origin = longPressOriginRef.current;
            if (!origin) return;
            if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) {
              clearLongPressTimer();
            }
          }}
          onPointerUp={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
          onContextMenu={(e) => {
            if (message.isDeleted) return;
            e.preventDefault();
            clearLongPressTimer();
            if (selectionMode && onToggleSelect) {
              onToggleSelect(message);
              return;
            }
            setPickerOnlyMode(false);
            setShowPicker(true);
            onToggleActionMenu?.(message.id);
          }}
          onClick={(e) => {
            if (message.isDeleted) return;
            if (longPressTriggeredRef.current) {
              e.stopPropagation();
              return;
            }
            if (selectionMode && (onToggleSelect || onToggleSelectMessages)) {
              e.stopPropagation();
              handleSelectTarget();
              return;
            }
            const target = e.target as HTMLElement;
            if (
              target.closest('button, a, audio, input, textarea, [data-msg-actions], [data-no-bubble-toggle]') ||
              (!isStickerMsg && target.closest('img'))
            ) {
              return;
            }
            if (window.getSelection()?.toString()?.trim()) return;
            setPickerOnlyMode(false);
            onToggleActionMenu?.(isActionMenuOpen ? null : message.id);
          }}
          style={
            swipeOffset !== 0
              ? { transform: `translate3d(${swipeOffset}px, 0, 0)` }
              : undefined
          }
          className={`relative max-w-full rounded-2xl ${
            restrictContentActions ? 'select-none' : ''
          } ${
            swipeOffset === 0
              ? 'transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]'
              : ''
          } ${
            isStickerMsg
              ? 'px-1.5 py-1 bg-transparent shadow-none'
              : isVisualMediaOnly
              ? isOwn
                ? 'p-1 shadow-xs hover:shadow-sm bg-[#effdde] dark:bg-[#2b5278] text-slate-900 dark:text-slate-100 rounded-se-sm'
                : 'p-1 shadow-xs hover:shadow-sm bg-white dark:bg-[#182533] text-slate-900 dark:text-slate-100 rounded-es-sm'
              : isOwn
              ? 'px-3.5 py-2 shadow-xs hover:shadow-sm bg-[#effdde] dark:bg-[#2b5278] text-slate-900 dark:text-slate-100 rounded-se-sm'
              : 'px-3.5 py-2 shadow-xs hover:shadow-sm bg-white dark:bg-[#182533] text-slate-900 dark:text-slate-100 rounded-es-sm'
          } ${isActionMenuOpen ? 'ring-1 ring-sky-500/40' : ''}`}
        >
        {/* Sender Name in Groups */}
        {!isOwn && showSenderInfo && chatType === 'group' && (
          <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 mb-0.5">
            {message.senderName}
          </div>
        )}

        {/* Forwarded Attribution */}
        {albumHeaderSource.forwardedFromName && !message.isDeleted && (
          <div className="text-[11px] text-sky-600 dark:text-sky-300 mb-1 flex items-center gap-1">
            <Forward className="w-3 h-3" />
            <span>رسالة محولة من {albumHeaderSource.forwardedFromName}</span>
          </div>
        )}

        {/* Reply Quote */}
        {albumHeaderSource.replyToId && !message.isDeleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onJumpToMessage(albumHeaderSource.replyToId!);
            }}
            className="w-full text-start mb-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/[0.06] dark:bg-white/[0.09] hover:bg-slate-900/10 dark:hover:bg-white/15 border border-slate-900/5 dark:border-white/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 truncate">
              <Reply className="w-3 h-3 shrink-0" />
              <span className="truncate">{albumHeaderSource.replyToSenderName}</span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 truncate mt-0.5">
              {albumHeaderSource.replyToText}
            </div>
          </button>
        )}

        {/* Deleted State */}
        {message.isDeleted ? (
          <p className="text-xs italic text-slate-500 dark:text-slate-400 py-0.5">
            تم حذف هذه الرسالة
          </p>
        ) : (
          <>
            {/* Animated Sticker Message */}
            {message.type === 'sticker' && (
              <div className="py-1 flex justify-center">
                <StickerVisual
                  stickerId={message.stickerId}
                  mediaDataUrl={message.mediaDataUrl}
                  animation={message.stickerAnim}
                  label={message.text || 'ملصق متحرك'}
                  className="w-32 h-32 sm:w-36 sm:h-36 drop-shadow-sm cursor-pointer"
                />
              </div>
            )}

            {/* Grouped Photo Album Grid (2+ consecutive images) */}
            {isAlbum ? (
              (() => {
                const galleryImages = albumItems
                  .filter((m) => Boolean(m.mediaUrl || m.mediaDataUrl))
                  .map((m) => ({ src: (m.mediaUrl || m.mediaDataUrl)!, caption: m.text || undefined }));
                const count = albumItems.length;
                const openAt = (idx: number) => (e: React.MouseEvent) => {
                  if (selectionMode) return;
                  e.stopPropagation();
                  const target = albumItems[idx];
                  const targetSrc = target?.mediaUrl || target?.mediaDataUrl;
                  if (!targetSrc) return;
                  onOpenImage(targetSrc, { images: galleryImages, index: idx });
                };

                const renderTile = (item: Message, idx: number, extraTileClass: string, overflowRemain = 0) => (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden bg-slate-200 dark:bg-slate-800 group/tile ${extraTileClass}`}
                  >
                    <ResilientChatImage
                      src={(item.mediaUrl || item.mediaDataUrl)!}
                      alt={item.text || `صورة ${idx + 1}`}
                      onClick={openAt(idx)}
                      className="w-full h-full object-cover cursor-pointer transition-transform duration-200 group-hover/tile:scale-[1.03]"
                    />
                    {overflowRemain > 0 && (
                      <button
                        type="button"
                        onClick={openAt(idx)}
                        aria-label={`عرض ${overflowRemain} صور إضافية`}
                        className="absolute inset-0 bg-slate-950/60 hover:bg-slate-950/70 backdrop-blur-[1px] flex flex-col items-center justify-center text-white cursor-pointer transition-colors"
                      >
                        <span className="text-lg sm:text-xl font-bold tabular-nums leading-none">
                          +{overflowRemain}
                        </span>
                        <span className="text-[11px] font-medium text-white/85 mt-1">
                          صور أخرى
                        </span>
                      </button>
                    )}
                  </div>
                );

                return (
                  <div
                    className={`relative overflow-hidden rounded-[13px] ${
                      isVisualMediaOnly ? '' : 'mb-1.5 -mx-1'
                    }`}
                  >
                    {count === 2 && (
                      <div className="grid grid-cols-2 gap-1 w-[min(264px,100%)] sm:w-[324px]">
                        {albumItems.map((item, idx) => renderTile(item, idx, 'h-40 sm:h-48'))}
                      </div>
                    )}

                    {count === 3 && (
                      <div className="grid grid-cols-2 grid-rows-2 gap-1 w-[min(264px,100%)] sm:w-[330px] h-[220px] sm:h-[252px]">
                        {renderTile(albumItems[0], 0, 'row-span-2 h-full')}
                        {renderTile(albumItems[1], 1, 'h-full')}
                        {renderTile(albumItems[2], 2, 'h-full')}
                      </div>
                    )}

                    {count === 4 && (
                      <div className="grid grid-cols-2 gap-1 w-[min(264px,100%)] sm:w-[324px]">
                        {albumItems.map((item, idx) => renderTile(item, idx, 'h-28 sm:h-34'))}
                      </div>
                    )}

                    {count === 5 && (
                      <div className="space-y-1 w-[min(272px,100%)] sm:w-[340px]">
                        <div className="grid grid-cols-2 gap-1">
                          {albumItems.slice(0, 2).map((item, idx) => renderTile(item, idx, 'h-28 sm:h-34'))}
                        </div>
                        <div className="grid grid-cols-3 gap-1">
                          {albumItems.slice(2, 5).map((item, idx) => renderTile(item, idx + 2, 'h-22 sm:h-26'))}
                        </div>
                      </div>
                    )}

                    {count >= 6 && (
                      <div className="grid grid-cols-3 gap-1 w-[min(272px,100%)] sm:w-[342px]">
                        {albumItems.slice(0, 6).map((item, idx) =>
                          renderTile(
                            item,
                            idx,
                            'h-24 sm:h-28',
                            idx === 5 && count > 6 ? count - 6 : 0
                          )
                        )}
                      </div>
                    )}

                    {isVisualMediaOnly && (
                      <div className="pointer-events-none absolute bottom-1.5 end-1.5 px-2 py-0.5 rounded-lg bg-slate-950/60 backdrop-blur-xs text-white text-[10.5px] flex items-center gap-1.5 select-none">
                        <span className="tabular-nums">{count} صور</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatMessageTime(message.createdAt)}</span>
                        {isOwn && !message.isDeleted && (
                          readReceipt?.state === 'all' || readReceipt?.state === 'saved' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                          ) : readReceipt?.state === 'partial' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                          ) : readReceipt?.state === 'sending' ? (
                            <Clock className="w-3 h-3 text-white/75" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-white/85" />
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : message.type === 'image' && (message.mediaUrl || message.mediaDataUrl) ? (
              /* Single Image Attachment */
              (() => {
                const imgSrc = (message.mediaUrl || message.mediaDataUrl)!;
                return (
              <div
                className={`relative overflow-hidden rounded-[13px] bg-slate-200 dark:bg-slate-800 group/tile ${
                  isVisualMediaOnly ? '' : 'mb-1.5 -mx-1'
                }`}
              >
                <ResilientChatImage
                  src={imgSrc}
                  alt={message.text || 'صورة مرفقة'}
                  onClick={(e) => {
                    if (selectionMode) return;
                    e.stopPropagation();
                    onOpenImage(imgSrc, {
                      images: [{ src: imgSrc, caption: message.text || undefined }],
                      index: 0,
                    });
                  }}
                  className="w-full min-w-[min(200px,100%)] max-w-[320px] max-h-[300px] object-cover cursor-pointer transition-transform duration-200 group-hover/tile:scale-[1.02]"
                />
                {!selectionMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenImage(imgSrc, {
                        images: [{ src: imgSrc, caption: message.text || undefined }],
                        index: 0,
                      });
                    }}
                    aria-label="تكبير الصورة"
                    className="opacity-0 group-hover/tile:opacity-100 transition-opacity absolute top-2 start-2 w-8 h-8 rounded-full bg-slate-950/55 hover:bg-slate-950/75 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {isVisualMediaOnly && (
                  <div className="pointer-events-none absolute bottom-1.5 end-1.5 px-2 py-0.5 rounded-lg bg-slate-950/60 backdrop-blur-xs text-white text-[10.5px] flex items-center gap-1 select-none">
                    {typeof remainingSec === 'number' && (
                      <>
                        <Timer className="w-3 h-3 text-sky-200" />
                        <span className="tabular-nums">{formatRemainingCountdown(remainingSec)}</span>
                        <span>·</span>
                      </>
                    )}
                    {isPinned && <Pin className="w-3 h-3 text-sky-300" />}
                    <span className="tabular-nums">{formatMessageTime(message.createdAt)}</span>
                    {isOwn && !message.isDeleted && (
                      readReceipt?.state === 'all' || readReceipt?.state === 'saved' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-sky-300" />
                      ) : readReceipt?.state === 'partial' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                      ) : readReceipt?.state === 'sending' ? (
                        <Clock className="w-3 h-3 text-white/75" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-white/85" />
                      )
                    )}
                  </div>
                )}
              </div>
                );
              })()
            ) : null}

            {/* Audio Voice Note or Audio File */}
            {message.type === 'audio' && (message.mediaDataUrl || message.mediaUrl || message.mediaChunkCount) && (
              <VoiceMessagePlayer message={message} isOwn={isOwn} />
            )}

            {/* Document / File Attachment (Refined Card) */}
            {message.type === 'file' && (message.mediaDataUrl || message.mediaUrl || message.mediaChunkCount) && (() => {
              const fileVisual = getFileTypeVisual(message.fileName, message.fileMimeType);
              const FileVisualIcon = fileVisual.Icon;
              return (
                <div
                  data-no-bubble-toggle="true"
                  className="flex items-center gap-3 p-2 -mx-1 rounded-xl bg-slate-900/[0.045] dark:bg-white/[0.06] border border-slate-900/[0.06] dark:border-white/[0.08] min-w-[min(220px,100%)] sm:min-w-[272px] max-w-full"
                >
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${fileVisual.boxClass}`}>
                    <FileVisualIcon className="w-5 h-5 leading-none" />
                    <span className="text-[8.5px] font-bold tracking-wide leading-none mt-0.5">
                      {fileVisual.ext}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate leading-snug">
                      {message.fileName || 'ملف مرفق'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-300/85 tabular-nums mt-0.5 flex items-center gap-1.5">
                      {loadingMedia && downloadProgress !== null ? (
                        <span className="text-sky-600 dark:text-sky-300 font-medium">
                          جاري التحميل {downloadProgress}%
                        </span>
                      ) : (
                        <>
                          <span>{formatFileSize(message.fileSize)}</span>
                          <span aria-hidden="true">·</span>
                          <span>{fileVisual.typeLabel}</span>
                        </>
                      )}
                    </div>
                    {loadingMedia && downloadProgress !== null && (
                      <div className="w-full h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1.5">
                        <div
                          className="h-full bg-sky-500 transition-[width] duration-200"
                          style={{ width: `${Math.max(5, downloadProgress)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {!restrictContentActions && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadAttachment('attachment');
                      }}
                      disabled={loadingMedia}
                      title="تنزيل الملف"
                      aria-label="تنزيل الملف"
                      className={`tap-press w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-60 ${
                        downloadDone
                          ? 'bg-emerald-500 text-white'
                          : 'bg-sky-500 hover:bg-sky-600 text-white shadow-xs'
                      }`}
                    >
                      {loadingMedia ? (
                        <Loader2 className="w-4.5 h-4.5 animate-spin" />
                      ) : downloadDone ? (
                        <Check className="w-4.5 h-4.5" />
                      ) : (
                        <Download className="w-4.5 h-4.5" />
                      )}
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Poll Message */}
            {message.type === 'poll' && message.pollQuestion && message.pollOptions && (
              <div className="min-w-[240px] sm:min-w-[280px] py-0.5 space-y-2">
                <div className="font-semibold text-sm text-slate-900 dark:text-white leading-snug">
                  {message.pollQuestion}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-300">
                  استطلاع رأي · {totalVotes} {totalVotes === 1 ? 'صوت' : 'أصوات'}
                </div>
                <div className="space-y-1.5 pt-1">
                  {message.pollOptions.map((option, idx) => {
                    const count = pollVotes.filter((v) => v.optionIndex === idx).length;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    const isSelectedOption = myVote?.optionIndex === idx;

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onCastVote(message.id, idx, Boolean(myVote))}
                        className={`relative w-full text-start rounded-xl px-3 py-2 border overflow-hidden transition-colors cursor-pointer ${
                          isSelectedOption
                            ? 'border-sky-500 bg-sky-500/10'
                            : 'border-slate-200 dark:border-slate-600/60 hover:bg-slate-100/70 dark:hover:bg-white/5'
                        }`}
                      >
                        {myVote && (
                          <div
                            className="absolute inset-y-0 start-0 bg-sky-500/15 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        )}
                        <div className="relative flex items-center justify-between gap-3 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            {isSelectedOption && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                            <span>{option}</span>
                          </span>
                          {myVote && (
                            <span className="tabular-nums text-slate-600 dark:text-slate-300 font-semibold">
                              {pct}%
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Text Content */}
            {primaryDisplayText && (
              <p className={`${textSizeClass} leading-relaxed whitespace-pre-wrap break-words ${message.type === 'file' ? 'mt-2' : ''}`}>
                {renderTextWithMentions(primaryDisplayText, currentUsername)}
              </p>
            )}

            {/* Compact Link Preview Card */}
            {primaryDisplayText &&
              (() => {
                const urls = extractUrlsFromText(primaryDisplayText);
                if (urls.length === 0) return null;
                const primary = parseUrlDisplay(urls[0]);
                return (
                  <div
                    data-no-bubble-toggle="true"
                    className="mt-2 rounded-xl bg-slate-900/[0.045] dark:bg-white/[0.08] border border-slate-900/[0.07] dark:border-white/10 p-2 flex items-center gap-2.5"
                  >
                    <a
                      href={primary.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-start group/link"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1" dir="ltr">
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover/link:text-sky-600 dark:group-hover/link:text-sky-300 truncate">
                          {primary.host}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-300/80 truncate">
                          {primary.path || primary.href}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-sky-500 shrink-0" />
                    </a>
                    {!restrictContentActions && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard?.writeText(primary.href).catch(() => {});
                          setCopiedLink(true);
                          window.setTimeout(() => setCopiedLink(false), 1500);
                        }}
                        title="نسخ الرابط"
                        aria-label="نسخ الرابط"
                        className="tap-press p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-900/10 dark:hover:bg-white/10 shrink-0 cursor-pointer"
                      >
                        {copiedLink ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })()}
          </>
        )}

        {/* Footer Timestamp, Disappearing Countdown & Read Status */}
        {!isVisualMediaOnly && (
          <div
            className={`flex items-center justify-end gap-1 mt-1 text-[10.5px] select-none ${
              isStickerMsg
                ? 'ms-auto w-fit px-2 py-0.5 rounded-full bg-slate-900/35 dark:bg-slate-950/60 text-white backdrop-blur-xs'
                : 'text-slate-500 dark:text-slate-300/80'
            }`}
          >
            {isAlbum && (
              <span className="tabular-nums">{albumItems.length} صور ·</span>
            )}
          {typeof remainingSec === 'number' && !message.isDeleted && (
            <>
              <span
                title="الوقت المتبقي قبل الحذف التلقائي"
                className={`inline-flex items-center gap-0.5 tabular-nums ${
                  isStickerMsg
                    ? 'text-sky-200'
                    : remainingSec <= 10
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-sky-600 dark:text-sky-300'
                }`}
              >
                <Timer className="w-3 h-3" />
                <span>{formatRemainingCountdown(remainingSec)}</span>
              </span>
              <span>·</span>
            </>
          )}
          {isPinned && !message.isDeleted && (
            <span title="رسالة مثبتة" className="inline-flex items-center text-sky-600 dark:text-sky-300">
              <Pin className="w-3 h-3" />
            </span>
          )}
          {message.editedAt && !message.isDeleted && <span>معدلة ·</span>}
          <span className="tabular-nums">{formatMessageTime(message.createdAt)}</span>
          {isOwn && !message.isDeleted && (() => {
            const state = readReceipt?.state ?? (isReadByPeer ? 'all' : 'sent');
            if (state === 'sending') {
              return (
                <span title="جاري الإرسال" className="inline-flex items-center">
                  <Clock className={`w-3 h-3 ${isStickerMsg ? 'text-white/75' : 'text-slate-400 dark:text-slate-300/75'}`} />
                </span>
              );
            }
            if (state === 'partial' && readReceipt) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReadReceiptDetails?.(message);
                  }}
                  title={`شوهدت من ${readReceipt.readBy.length} من ${readReceipt.totalRecipients}`}
                  className={`inline-flex items-center gap-0.5 rounded px-0.5 transition-colors cursor-pointer ${
                    isStickerMsg
                      ? 'text-emerald-300 hover:text-emerald-200'
                      : 'text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/10'
                  }`}
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="tabular-nums text-[9.5px] font-semibold leading-none">
                    {readReceipt.readBy.length}/{readReceipt.totalRecipients}
                  </span>
                </button>
              );
            }
            if (state === 'all' || state === 'saved') {
              const titleText =
                state === 'saved'
                  ? 'محفوظة'
                  : chatType === 'group' && readReceipt
                  ? `تمت الرؤية من الجميع (${readReceipt.readBy.length})`
                  : 'تمت الرؤية';
              return onOpenReadReceiptDetails && chatType !== 'saved' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReadReceiptDetails(message);
                  }}
                  title={titleText}
                  className="inline-flex items-center cursor-pointer"
                >
                  <CheckCheck
                    className={`w-3.5 h-3.5 ${
                      isStickerMsg ? 'text-sky-300' : 'text-sky-600 dark:text-sky-300'
                    }`}
                  />
                </button>
              ) : (
                <CheckCheck
                  className={`w-3.5 h-3.5 ${
                    isStickerMsg ? 'text-sky-300' : 'text-sky-600 dark:text-sky-300'
                  }`}
                />
              );
            }
            return (
              <span title="تم الإرسال · لم تُشاهد بعد" className="inline-flex items-center">
                <Check className={`w-3.5 h-3.5 ${isStickerMsg ? 'text-white/80' : 'text-slate-500 dark:text-slate-300'}`} />
              </span>
            );
          })()}
        </div>
        )}

        {/* Channel Post Comments Trigger */}
        {chatType === 'channel' && !message.isDeleted && (allowComments || commentCount > 0) && onOpenComments && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-white/10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenComments(message);
              }}
              className="w-full py-1 px-2 rounded-lg text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-500/10 flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{commentCount > 0 ? `عرض التعليقات (${commentCount})` : 'إضافة تعليق'}</span>
              </span>
              <span className="text-[10px] opacity-75">←</span>
            </button>
          </div>
        )}

        {/* Hover / Tap Action Toolbar */}
        {!message.isDeleted && !selectionMode && !(showPicker && pickerOnlyMode) && (
          <div
            data-msg-actions="true"
            onClick={(e) => e.stopPropagation()}
            className={`${
              confirmDelete || isActionMenuOpen || showPicker
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:scale-100 focus-within:pointer-events-auto'
            } transition-[opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] absolute ${
              isFirstMessage ? 'top-full mt-1.5' : '-top-10'
            } ${
              isOwn ? 'start-0' : 'end-0'
            } flex items-center gap-0.5 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-xl px-1.5 py-1 shadow-md z-20`}
          >
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 px-1 text-[11px]">
                <span className="font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                  {isAlbum ? `حذف ${albumItems.length} صور؟` : 'حذف بين الطرفين؟'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDelete(false);
                    onToggleActionMenu?.(null);
                    if (isAlbum && onDeleteMessages) {
                      onDeleteMessages(albumItems);
                    } else {
                      onDelete(message);
                    }
                  }}
                  className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                >
                  حذف
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <>
                {canReply && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPicker(false);
                      onToggleActionMenu?.(null);
                      onReply(message);
                    }}
                    title="رد على الرسالة"
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer whitespace-nowrap"
                  >
                    <Reply className="w-3.5 h-3.5" />
                    <span>رد</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPicker(!showPicker)}
                  title="تفاعل"
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                >
                  <SmilePlus className="w-3.5 h-3.5" />
                </button>
                {!restrictContentActions && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      if (isAlbum && onForwardMessages) {
                        onForwardMessages(albumItems);
                      } else {
                        onForward(message);
                      }
                    }}
                    title={isAlbum ? 'تحويل الألبوم' : 'تحويل'}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Forward className="w-3.5 h-3.5" />
                  </button>
                )}
                {!restrictContentActions && onSendToWhatsApp && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      onSendToWhatsApp(message);
                    }}
                    title="إرسال إلى واتساب"
                    className="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                {!restrictContentActions && primaryDisplayText && (
                  <button
                    type="button"
                    onClick={() => {
                      handleCopy();
                      onToggleActionMenu?.(null);
                    }}
                    title={copied ? 'تم النسخ' : 'نسخ'}
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
                {(onToggleSelect || onToggleSelectMessages) && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      handleSelectTarget();
                    }}
                    title="تحديد متعدد"
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                  </button>
                )}
                {isOwn && chatType !== 'saved' && onOpenReadReceiptDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      onOpenReadReceiptDetails(message);
                    }}
                    title="معلومات القراءة"
                    className="p-1.5 rounded-lg text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                {canPin && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      onPin(message);
                    }}
                    title={isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
                    className={`p-1.5 rounded-lg cursor-pointer ${
                      isPinned
                        ? 'text-sky-600 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50'
                        : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggleActionMenu?.(null);
                      onEdit(message);
                    }}
                    title="تعديل"
                    className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPicker(false);
                      setConfirmDelete(true);
                    }}
                    title="حذف بين الطرفين"
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Floating Emoji Picker (Long-press or SmilePlus trigger) */}
        {showPicker && !message.isDeleted && (
          <div
            data-msg-actions="true"
            onClick={(e) => e.stopPropagation()}
            className={`animate-zeno-popover absolute ${
              isFirstMessage
                ? pickerOnlyMode
                  ? 'top-full mt-2'
                  : 'top-full mt-12'
                : pickerOnlyMode
                ? '-top-14'
                : '-top-[5.4rem]'
            } ${
              isOwn ? 'start-0' : 'end-0'
            } bg-white/95 dark:bg-[#202b38]/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 rounded-2xl p-1.5 shadow-xl z-30`}
          >
            <div className="flex items-center gap-1">
              {QUICK_REACTIONS.map((emoji) => {
                const isActive = myReaction?.emoji === emoji;
                return (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onToggleReaction(message.id, emoji, myReaction?.emoji);
                      setShowPicker(false);
                      setShowAllEmojis(false);
                      setPickerOnlyMode(false);
                      onToggleActionMenu?.(null);
                    }}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-lg hover:scale-125 active:scale-95 transition-transform duration-150 cursor-pointer ${
                      isActive ? 'bg-sky-500/20 ring-1 ring-sky-500/60' : 'hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowAllEmojis((prev) => !prev)}
                title="المزيد من الإيموجي"
                aria-label="المزيد من الإيموجي"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                  showAllEmojis
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <Plus className={`w-4 h-4 transition-transform duration-150 ${showAllEmojis ? 'rotate-45' : ''}`} />
              </button>
            </div>
            {showAllEmojis && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/70 grid grid-cols-6 gap-1">
                {EXTRA_REACTIONS.map((emoji) => {
                  const isActive = myReaction?.emoji === emoji;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onToggleReaction(message.id, emoji, myReaction?.emoji);
                        setShowPicker(false);
                        setShowAllEmojis(false);
                        setPickerOnlyMode(false);
                        onToggleActionMenu?.(null);
                      }}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center text-base hover:scale-115 active:scale-95 transition-transform cursor-pointer ${
                        isActive ? 'bg-sky-500/20 ring-1 ring-sky-500/60' : 'hover:bg-slate-100 dark:hover:bg-white/10'
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Grouped Reactions Strip Underneath Message Bubble */}
        {!message.isDeleted && groupedReactions.length > 0 && (
          <div
            data-no-bubble-toggle="true"
            className={`flex flex-wrap items-center gap-1 mt-1 ${
              isOwn ? 'justify-start' : 'justify-end'
            }`}
          >
            {groupedReactions.map(([emoji, count]) => {
              const reactedByMe = myReaction?.emoji === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReaction(message.id, emoji, myReaction?.emoji);
                  }}
                  title={reactedByMe ? 'إزالة رد فعلك' : 'إضافة نفس رد الفعل'}
                  className={`tap-press inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs shadow-xs border transition-all cursor-pointer ${
                    reactedByMe
                      ? 'bg-sky-500/20 dark:bg-sky-400/20 text-sky-800 dark:text-sky-100 border-sky-500/50 font-semibold'
                      : 'bg-white/90 dark:bg-[#1d2a38] text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-slate-700/80 hover:bg-white dark:hover:bg-[#243447]'
                  }`}
                >
                  <span className="text-[13px] leading-none">{emoji}</span>
                  <span className="tabular-nums text-[11px] font-semibold leading-none">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Dedicated Read Receipts Indicator Below Sent Message */}
        {isOwn &&
          !message.isDeleted &&
          chatType !== 'saved' &&
          readReceipt &&
          (showReadReceiptBelow || isActionMenuOpen) && (
            <button
              type="button"
              data-no-bubble-toggle="true"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReadReceiptDetails?.(message);
              }}
              aria-label="عرض تفاصيل القراءة"
              className={`tap-press mt-1 px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 text-[11px] leading-tight backdrop-blur-xs transition-colors cursor-pointer select-none ${
                readReceipt.state === 'all'
                  ? 'bg-sky-500/12 dark:bg-sky-400/15 text-sky-800 dark:text-sky-200 hover:bg-sky-500/20'
                  : readReceipt.state === 'partial'
                  ? 'bg-emerald-500/12 dark:bg-emerald-400/15 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20'
                  : 'bg-white/70 dark:bg-[#17212b]/80 text-slate-600 dark:text-slate-300 hover:bg-white/90 dark:hover:bg-[#17212b]'
              }`}
            >
              {readReceipt.state === 'sending' ? (
                <>
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>جاري الإرسال...</span>
                </>
              ) : readReceipt.state === 'sent' ? (
                <>
                  <Check className="w-3 h-3 text-slate-500 dark:text-slate-400 shrink-0" />
                  <span>
                    {chatType === 'group' || chatType === 'channel'
                      ? 'تم الإرسال · لم تُشاهد بعد'
                      : 'تم الإرسال'}
                  </span>
                </>
              ) : readReceipt.state === 'partial' ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  {readReceipt.readBy.length > 0 && (
                    <span className="inline-flex items-center -space-x-1 rtl:space-x-reverse">
                      {readReceipt.readBy.slice(0, 3).map((reader) => (
                        <span
                          key={reader.uid}
                          className="rounded-full ring-1 ring-white dark:ring-[#0e1621]"
                        >
                          <Avatar
                            name={reader.displayName}
                            seed={reader.uid}
                            photoURL={reader.photoURL}
                            size="2xs"
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="font-medium">
                    شوهدت من <span className="tabular-nums font-semibold">{readReceipt.readBy.length}</span> من{' '}
                    <span className="tabular-nums font-semibold">{readReceipt.totalRecipients}</span>
                  </span>
                </>
              ) : (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  {(chatType === 'group' || chatType === 'channel') && readReceipt.readBy.length > 0 && (
                    <span className="inline-flex items-center -space-x-1 rtl:space-x-reverse">
                      {readReceipt.readBy.slice(0, 3).map((reader) => (
                        <span
                          key={reader.uid}
                          className="rounded-full ring-1 ring-white dark:ring-[#0e1621]"
                        >
                          <Avatar
                            name={reader.displayName}
                            seed={reader.uid}
                            photoURL={reader.photoURL}
                            size="2xs"
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="font-medium">
                    {chatType === 'group'
                      ? `تمت الرؤية من الجميع (${readReceipt.readBy.length})`
                      : chatType === 'channel'
                      ? `تمت الرؤية (${readReceipt.readBy.length})`
                      : readReceipt.latestReadAt
                      ? `تمت الرؤية · ${formatMessageTime(readReceipt.latestReadAt)}`
                      : 'تمت الرؤية'}
                  </span>
                </>
              )}
            </button>
          )}
      </div>
    </div>
  );
});
