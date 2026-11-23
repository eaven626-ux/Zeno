import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Ban,
  BarChart2,
  Bell,
  BellOff,
  Calendar,
  CalendarClock,
  Check,
  CheckCheck,
  CheckSquare,
  Clock,
  Copy,
  Edit2,
  Eye,
  FileText,
  Forward,
  Image as ImageIcon,
  Info,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Mic,
  Music,
  Paperclip,
  Pause,
  Phone,
  Play,
  Plus,
  Reply,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Square,
  Sticker,
  Timer,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  ChannelComment,
  Chat,
  ChatMember,
  CustomSticker,
  LightboxState,
  Message,
  MessageReaction,
  MessageReadReceiptInfo,
  PollVote,
  PublicUser,
  ScheduledMessage,
  StickerAnimation,
  StickerPack,
  UserChatItem,
} from '../types/telegram';
import { formatAppErrorMessage } from '../lib/firebase';
import {
  AUTO_DELETE_PRESETS,
  blobToDataUrl,
  compressImageToDataUrl,
  fileToDataUrl,
  formatAudioDuration,
  formatAutoDeleteShort,
  formatChatListTime,
  formatDateSeparator,
  formatFileSize,
  formatLastSeen,
  formatMessageTime,
  getAudioDurationFromBlobOrFile,
  INLINE_FILE_MAX_BYTES,
  isSameDay,
  isUserOnline,
  MAX_FILE_BYTES,
} from '../lib/mediaUtils';
import {
  DATE_PRESET_OPTIONS,
  getTodayInputDateString,
  hasActiveAdvancedFilters,
  MESSAGE_TYPE_FILTER_OPTIONS,
  messageMatchesAdvancedFilters,
  MessageSearchDatePreset,
  MessageSearchTypeFilter,
} from '../lib/searchUtils';
import { getMicrophoneErrorMessage, getPreferredAudioMimeType } from '../lib/audioRecorder';
import { BUILTIN_STICKER_PACKS, BuiltinSticker } from '../lib/stickers';
import { Avatar } from './Avatar';
import { MessageBubble } from './MessageBubble';
import { PinnedMessagesBar } from './PinnedMessagesBar';
import { ScheduleMessageModal } from './ScheduleMessageModal';
import { StickerVisual } from './StickerArt';

interface ChatWindowProps {
  currentUser: PublicUser;
  chat: Chat | null;
  chatItem: UserChatItem | null;
  peerUser?: PublicUser;
  members: ChatMember[];
  messages: Message[];
  reactions: MessageReaction[];
  pollVotes: PollVote[];
  fontSize: 'small' | 'medium' | 'large';
  showInfoDrawer: boolean;
  onToggleInfoDrawer: () => void;
  onBackMobile: () => void;
  onSendMessage: (payload: {
    type: 'text' | 'image' | 'audio' | 'file' | 'sticker';
    text: string;
    mediaDataUrl?: string;
    mediaFile?: Blob;
    mediaDurationSec?: number;
    fileName?: string;
    fileSize?: number;
    fileMimeType?: string;
    replyTo?: Message | null;
    stickerId?: string;
    stickerPackId?: string;
    stickerAnim?: StickerAnimation;
    onProgress?: (percent: number) => void;
  }) => Promise<void>;
  onEditMessage: (messageId: string, newText: string) => Promise<void>;
  onDeleteMessage: (message: Message) => Promise<void>;
  onPinMessage: (message: Message | null) => Promise<void>;
  onUnpinAllMessages?: (pinnedMessages: Message[]) => Promise<void>;
  onForwardMessage: (message: Message) => void;
  onToggleReaction: (messageId: string, emoji: string, currentEmoji?: string) => Promise<void>;
  onCastVote: (messageId: string, optionIndex: number, alreadyVoted: boolean) => Promise<void>;
  onOpenPollModal: () => void;
  onTyping: (isTyping: boolean, targetChatId?: string) => void;
  onToggleMute: () => void;
  onOpenImage: (src: string, gallery?: LightboxState) => void;
  onJoinPublicChat?: (chat: Chat) => Promise<void>;
  isBlockedByMe?: boolean;
  isBlockedByPeer?: boolean;
  onUnblockUser?: (uid: string) => Promise<void>;
  onDeleteChatForBoth?: () => Promise<void>;
  onUpdateAutoDeleteTimer?: (seconds: number) => Promise<void>;
  onPurgeExpiredMessages?: (messages: Message[]) => Promise<void>;
  stickerPacks?: StickerPack[];
  customStickersByPack?: Record<string, CustomSticker[]>;
  onOpenStickerPackModal?: (pack?: StickerPack) => void;
  scheduledMessages?: ScheduledMessage[];
  onScheduleMessage?: (payload: {
    type: 'text' | 'image' | 'sticker';
    text: string;
    scheduledFor: number;
    replyTo?: Message | null;
  }) => Promise<void>;
  onSendScheduledNow?: (scheduled: ScheduledMessage) => Promise<void>;
  onRescheduleMessage?: (scheduledId: string, scheduledFor: number, newText?: string) => Promise<void>;
  onCancelScheduledMessage?: (scheduledId: string) => Promise<void>;
  onSendMessageToWhatsApp?: (message: Message) => void;
  draftText?: string;
  onDraftChange?: (chatId: string, text: string) => void;
  commentsByMessageId?: Record<string, ChannelComment[]>;
  onOpenComments?: (message: Message) => void;
  onBatchDeleteMessages?: (messages: Message[]) => Promise<void>;
  onBatchForwardMessages?: (messages: Message[]) => void;
  onStartCall?: (mode: 'audio' | 'video') => void;
  jumpTargetMessage?: { chatId: string; messageId: string; nonce: number } | null;
  onClearJumpTarget?: () => void;
  onOpenGlobalAdvancedSearch?: (initialQuery?: string, chatId?: string) => void;
}

const EMOJI_GRID = [
  '😀', '😂', '🥹', '😍', '🤩', '😎', '🤔', '🙏',
  '👍', '👏', '🔥', '❤️', '💯', '🎉', '✨', '🚀',
  '✅', '⚡', '📌', '💡', '📷', '🎙️', '☕', '🌙',
];

const EMPTY_REACTIONS: MessageReaction[] = [];
const EMPTY_VOTES: PollVote[] = [];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  currentUser,
  chat,
  chatItem,
  peerUser,
  members,
  messages,
  reactions,
  pollVotes,
  fontSize,
  showInfoDrawer,
  onToggleInfoDrawer,
  onBackMobile,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onPinMessage,
  onUnpinAllMessages,
  onForwardMessage,
  onToggleReaction,
  onCastVote,
  onOpenPollModal,
  onTyping,
  onToggleMute,
  onOpenImage,
  onJoinPublicChat,
  isBlockedByMe = false,
  isBlockedByPeer = false,
  onUnblockUser,
  onDeleteChatForBoth,
  onUpdateAutoDeleteTimer,
  onPurgeExpiredMessages,
  stickerPacks = [],
  customStickersByPack = {},
  onOpenStickerPackModal,
  scheduledMessages = [],
  onScheduleMessage,
  onSendScheduledNow,
  onRescheduleMessage,
  onCancelScheduledMessage,
  onSendMessageToWhatsApp,
  draftText = '',
  onDraftChange,
  commentsByMessageId = {},
  onOpenComments,
  onBatchDeleteMessages,
  onBatchForwardMessages,
  onStartCall,
  jumpTargetMessage,
  onClearJumpTarget,
  onOpenGlobalAdvancedSearch,
}) => {
  const [text, setText] = useState(draftText);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [activeStickerTab, setActiveStickerTab] = useState<string>(BUILTIN_STICKER_PACKS[0].id);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [inChatSearch, setInChatSearch] = useState('');
  const [searchTypeFilter, setSearchTypeFilter] = useState<MessageSearchTypeFilter>('all');
  const [searchDatePreset, setSearchDatePreset] = useState<MessageSearchDatePreset>('all');
  const [searchCustomDate, setSearchCustomDate] = useState<string>(() => getTodayInputDateString());
  const [searchSenderFilter, setSearchSenderFilter] = useState<string>('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadWhileScrolledUp, setUnreadWhileScrolledUp] = useState(0);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [batchUploadLabel, setBatchUploadLabel] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false);
  const [blockActionBusy, setBlockActionBusy] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [timerBusy, setTimerBusy] = useState(false);
  const [activeMessageMenuId, setActiveMessageMenuId] = useState<string | null>(null);
  const [readReceiptMessageId, setReadReceiptMessageId] = useState<string | null>(null);
  const [scheduleModalMode, setScheduleModalMode] = useState<'compose' | 'queue' | null>(null);

  // Voice Recording & Preview State
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [micLevels, setMicLevels] = useState<number[]>(() => Array(24).fill(22));
  const [recordedPreview, setRecordedPreview] = useState<{
    blob: Blob;
    url: string;
    duration: number;
    mimeType: string;
  } | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTypingPingRef = useRef<number>(0);
  const composerPopoverRef = useRef<HTMLDivElement | null>(null);
  const timerPopoverRef = useRef<HTMLDivElement | null>(null);
  const purgedIdsRef = useRef<Set<string>>(new Set());
  const highlightTimerRef = useRef<number | null>(null);
  const prevChatIdRef = useRef<string | undefined>(chat?.id);
  const prevMsgCountRef = useRef<number>(messages.length);
  const needsInstantScrollRef = useRef<boolean>(true);
  const isTypingActiveRef = useRef<boolean>(false);
  const typingStopTimerRef = useRef<number | null>(null);
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;
  const typingSeenAtRef = useRef<Record<string, { serverTs: number; seenLocalAt: number }>>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const latestDraftRef = useRef(draftText);
  latestDraftRef.current = draftText;
  const lastLocalSendByChatRef = useRef<Record<string, number>>({});

  const TYPING_TTL_MS = 8500;

  const stopTypingNow = useCallback((targetChatId?: string) => {
    if (typingStopTimerRef.current) {
      window.clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      lastTypingPingRef.current = 0;
      onTypingRef.current(false, targetChatId);
    }
  }, []);

  const triggerTypingPing = useCallback(
    (targetChatId?: string) => {
      if (!targetChatId || chat?.type === 'saved' || members.length <= 1) return;
      const currentTime = Date.now();
      if (!isTypingActiveRef.current || currentTime - lastTypingPingRef.current > 6000) {
        isTypingActiveRef.current = true;
        lastTypingPingRef.current = currentTime;
        onTypingRef.current(true, targetChatId);
      }
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
      }
      typingStopTimerRef.current = window.setTimeout(() => {
        stopTypingNow(targetChatId);
      }, 4500);
    },
    [stopTypingNow, chat?.type, members.length]
  );

  useEffect(() => {
    setReplyTo(null);
    setEditingMsg(null);
    setSelectedMessageIds(new Set());
    setBatchBusy(false);
    setText(latestDraftRef.current || '');
    setShowSearchBar(false);
    setInChatSearch('');
    setSearchTypeFilter('all');
    setSearchDatePreset('all');
    setSearchSenderFilter('');
    setShowEmojiPicker(false);
    setShowStickerPicker(false);
    setShowAttachMenu(false);
    setShowTimerMenu(false);
    setTimerBusy(false);
    setActiveMessageMenuId(null);
    setReadReceiptMessageId(null);
    setScheduleModalMode(null);
    setErrorBanner(null);
    setConfirmDeleteChat(false);
    setBlockActionBusy(false);
    setUnreadWhileScrolledUp(0);
    purgedIdsRef.current.clear();
    typingSeenAtRef.current = {};

    // Stop any active microphone recording when switching chats
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    if (meterRafRef.current) window.cancelAnimationFrame(meterRafRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordSeconds(0);
    setMicLevels(Array(24).fill(22));
    setRecordedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setIsPreviewPlaying(false);
    setPreviewProgress(0);

    const activeId = chat?.id;
    return () => {
      if (typingStopTimerRef.current) {
        window.clearTimeout(typingStopTimerRef.current);
        typingStopTimerRef.current = null;
      }
      if (isTypingActiveRef.current && activeId) {
        isTypingActiveRef.current = false;
        lastTypingPingRef.current = 0;
        onTypingRef.current(false, activeId);
      }
    };
  }, [chat?.id]);

  useEffect(() => {
    if (!activeMessageMenuId) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(`[data-msg-bubble="${activeMessageMenuId}"]`)) return;
      setActiveMessageMenuId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveMessageMenuId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeMessageMenuId]);

  useEffect(() => {
    if (!showTimerMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (timerPopoverRef.current && !timerPopoverRef.current.contains(e.target as Node)) {
        setShowTimerMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTimerMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showTimerMenu]);

  useEffect(() => {
    if (!showEmojiPicker && !showAttachMenu && !showStickerPicker) return;
    const onPointerDown = (e: PointerEvent) => {
      if (composerPopoverRef.current && !composerPopoverRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
        setShowStickerPicker(false);
        setShowAttachMenu(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false);
        setShowStickerPicker(false);
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showEmojiPicker, showAttachMenu, showStickerPicker]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const switchedChat = prevChatIdRef.current !== chat?.id;
    if (switchedChat) {
      prevChatIdRef.current = chat?.id;
      prevMsgCountRef.current = messages.length;
      needsInstantScrollRef.current = true;
      setUnreadWhileScrolledUp(0);
    }

    if (jumpTargetMessage && chat?.id === jumpTargetMessage.chatId) {
      needsInstantScrollRef.current = false;
      prevMsgCountRef.current = messages.length;
      return;
    }

    const delta = messages.length - prevMsgCountRef.current;
    prevMsgCountRef.current = messages.length;

    if (needsInstantScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      setIsAtBottom(true);
      setUnreadWhileScrolledUp(0);
      if (messages.length > 0) {
        needsInstantScrollRef.current = false;
      }
    } else if (isAtBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setUnreadWhileScrolledUp(0);
    } else if (!switchedChat && delta > 0) {
      setUnreadWhileScrolledUp((prev) => prev + delta);
    }
  }, [messages.length, chat?.id, isAtBottom, jumpTargetMessage]);

  useEffect(() => {
    if (!jumpTargetMessage || !chat || chat.id !== jumpTargetMessage.chatId) return;
    const exists = messages.some((m) => m.id === jumpTargetMessage.messageId && !m.isDeleted);
    if (!exists) return;

    setShowSearchBar(false);
    setInChatSearch('');
    setSearchTypeFilter('all');
    setSearchDatePreset('all');
    setSearchSenderFilter('');

    const raf = requestAnimationFrame(() => {
      const target = document.getElementById(`msg-${jumpTargetMessage.messageId}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(jumpTargetMessage.messageId);
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 2200);
        onClearJumpTarget?.();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [jumpTargetMessage, chat?.id, messages, onClearJumpTarget]);

  useEffect(() => {
    if (!showSearchBar && selectedMessageIds.size === 0 && !readReceiptMessageId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (readReceiptMessageId) {
        setReadReceiptMessageId(null);
      } else if (selectedMessageIds.size > 0) {
        setSelectedMessageIds(new Set());
      } else if (showSearchBar) {
        setShowSearchBar(false);
        setInChatSearch('');
        setSearchTypeFilter('all');
        setSearchDatePreset('all');
        setSearchSenderFilter('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showSearchBar, selectedMessageIds.size, readReceiptMessageId]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (meterRafRef.current) window.cancelAnimationFrame(meterRafRef.current);
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio || !recordedPreview) return;
    const onTime = () => {
      const dur =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : recordedPreview.duration;
      if (dur > 0) {
        setPreviewProgress(Math.min(100, (audio.currentTime / dur) * 100));
      }
    };
    const onEnded = () => {
      setIsPreviewPlaying(false);
      setPreviewProgress(0);
    };
    const onPause = () => setIsPreviewPlaying(false);
    const onPlay = () => setIsPreviewPlaying(true);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
    };
  }, [recordedPreview]);

  useEffect(() => {
    const localNow = Date.now();
    const activeIds = new Set<string>();
    for (const m of members) {
      if (m.uid === currentUser.uid) continue;
      activeIds.add(m.uid);
      if (typeof m.typingAt === 'number' && m.typingAt > 0) {
        const prev = typingSeenAtRef.current[m.uid];
        if (!prev) {
          // First snapshot for this member: accept within +-3 min to absorb clock skew while ignoring stale abandoned flags
          const skewOk = Math.abs(localNow - m.typingAt) <= 180_000;
          typingSeenAtRef.current[m.uid] = {
            serverTs: m.typingAt,
            seenLocalAt: skewOk ? localNow : m.typingAt,
          };
        } else if (prev.serverTs !== m.typingAt) {
          // Live update observed during this session — always timestamp with local clock (100% clock-skew immune)
          typingSeenAtRef.current[m.uid] = {
            serverTs: m.typingAt,
            seenLocalAt: localNow,
          };
        }
      } else {
        delete typingSeenAtRef.current[m.uid];
      }
    }
    for (const uid of Object.keys(typingSeenAtRef.current)) {
      if (!activeIds.has(uid)) {
        delete typingSeenAtRef.current[uid];
      }
    }
    setNowMs(localNow);
  }, [members, currentUser.uid]);

  useEffect(() => {
    const activeExpiries = members
      .filter((m) => m.uid !== currentUser.uid && typeof m.typingAt === 'number' && m.typingAt > 0)
      .map((m) => {
        const tracked = typingSeenAtRef.current[m.uid];
        const refTs = tracked ? tracked.seenLocalAt : (m.typingAt as number);
        const age = nowMs - refTs;
        if (age >= TYPING_TTL_MS) return null;
        return age < 0 ? TYPING_TTL_MS : TYPING_TTL_MS - age;
      })
      .filter((r): r is number => r !== null);

    if (activeExpiries.length === 0) return;

    const nextTimeoutMs = Math.max(120, Math.min(...activeExpiries) + 60);
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, nextTimeoutMs);

    return () => window.clearTimeout(timer);
  }, [members, currentUser.uid, nowMs]);

  const hasTimedMessages = useMemo(
    () => messages.some((m) => !m.isDeleted && Boolean(m.ttlSeconds)),
    [messages]
  );

  useEffect(() => {
    if (!hasTimedMessages) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [hasTimedMessages]);

  useEffect(() => {
    if (!chat || !onPurgeExpiredMessages || messages.length === 0) return;
    const expired = messages.filter(
      (m) =>
        !m.isDeleted &&
        Boolean(m.ttlSeconds) &&
        m.createdAt > 0 &&
        nowMs >= m.createdAt + (m.ttlSeconds as number) * 1000 &&
        !purgedIdsRef.current.has(m.id)
    );
    if (expired.length === 0) return;
    for (const m of expired) {
      purgedIdsRef.current.add(m.id);
    }
    onPurgeExpiredMessages(expired).catch(() => {
      for (const m of expired) {
        purgedIdsRef.current.delete(m.id);
      }
    });
  }, [chat?.id, messages, nowMs, onPurgeExpiredMessages]);

  const myMembership = useMemo(
    () => members.find((m) => m.uid === currentUser.uid),
    [members, currentUser.uid]
  );

  const isAdminOrOwner = useMemo(() => {
    if (!chat) return false;
    if (chat.ownerId === currentUser.uid) return true;
    return myMembership?.role === 'owner' || myMembership?.role === 'admin';
  }, [chat, currentUser.uid, myMembership]);

  const isDirectBlocked = chat?.type === 'direct' && (isBlockedByMe || isBlockedByPeer);

  const canPost = useMemo(() => {
    if (!chat) return false;
    if (isDirectBlocked) return false;
    if (!myMembership && chat.type !== 'saved') return false;
    if (chat.type === 'channel') return isAdminOrOwner;
    return true;
  }, [chat, isDirectBlocked, myMembership, isAdminOrOwner]);

  const slowModeLimitSec =
    chat?.type === 'group' && !isAdminOrOwner && (chat.slowModeSeconds || 0) > 0
      ? (chat.slowModeSeconds as number)
      : 0;

  const lastMySentAtMs = useMemo(() => {
    if (!chat || slowModeLimitSec <= 0) return 0;
    let latest = lastLocalSendByChatRef.current[chat.id] || 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!m.isDeleted && m.type !== 'system' && m.senderId === currentUser.uid && m.createdAt > 0) {
        if (m.createdAt > latest) latest = m.createdAt;
        break;
      }
    }
    return latest;
  }, [chat, slowModeLimitSec, messages, currentUser.uid]);

  const slowModeRemainingSec = useMemo(() => {
    if (slowModeLimitSec <= 0 || !lastMySentAtMs || editingMsg) return 0;
    const elapsedSec = Math.floor((nowMs - lastMySentAtMs) / 1000);
    return Math.max(0, slowModeLimitSec - elapsedSec);
  }, [slowModeLimitSec, lastMySentAtMs, nowMs, editingMsg]);

  useEffect(() => {
    if (slowModeRemainingSec <= 0) return;
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [slowModeRemainingSec]);

  const mentionMatch = useMemo(() => {
    if (chat?.type !== 'group' || isRecording || recordedPreview) return null;
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9_]{0,32})$/);
    if (!match) return null;
    return match[1].toLowerCase();
  }, [chat?.type, isRecording, recordedPreview, text]);

  const mentionSuggestions = useMemo(() => {
    if (mentionMatch === null) return [];
    return members
      .filter((m) => {
        if (m.uid === currentUser.uid) return false;
        const uname = (m.username || '').toLowerCase();
        const dname = m.displayName.toLowerCase();
        if (!mentionMatch) return Boolean(uname);
        return uname.includes(mentionMatch) || dname.includes(mentionMatch);
      })
      .slice(0, 6);
  }, [mentionMatch, members, currentUser.uid]);

  const selectedMessagesList = useMemo(
    () => messages.filter((m) => !m.isDeleted && selectedMessageIds.has(m.id)),
    [messages, selectedMessageIds]
  );
  const selectionMode = selectedMessageIds.size > 0;
  const restrictContentActions = Boolean(chat?.protectContent && !isAdminOrOwner);

  const toggleSelectMessage = useCallback((msg: Message) => {
    if (msg.isDeleted) return;
    setActiveMessageMenuId(null);
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) {
        next.delete(msg.id);
      } else {
        next.add(msg.id);
      }
      return next;
    });
  }, []);

  const toggleSelectMessages = useCallback((msgs: Message[]) => {
    const valid = msgs.filter((m) => !m.isDeleted);
    if (valid.length === 0) return;
    setActiveMessageMenuId(null);
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      const allAlreadySelected = valid.every((m) => next.has(m.id));
      for (const m of valid) {
        if (allAlreadySelected) {
          next.delete(m.id);
        } else {
          next.add(m.id);
        }
      }
      return next;
    });
  }, []);

  const typingMembers = useMemo(() => {
    return members.filter((m) => {
      if (m.uid === currentUser.uid || !m.typingAt) return false;
      const tracked = typingSeenAtRef.current[m.uid];
      const refTs = tracked ? tracked.seenLocalAt : m.typingAt;
      const age = nowMs - refTs;
      return age < TYPING_TTL_MS && age > -180_000;
    });
  }, [members, currentUser.uid, nowMs]);

  useEffect(() => {
    if (typingMembers.length === 0 || !isAtBottom) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, [typingMembers.length, isAtBottom]);

  const otherMembers = useMemo(
    () => members.filter((m) => m.uid !== currentUser.uid),
    [members, currentUser.uid]
  );

  const reactionsByMsg = useMemo(() => {
    const map: Record<string, MessageReaction[]> = {};
    for (const r of reactions) {
      if (!map[r.messageId]) map[r.messageId] = [];
      map[r.messageId].push(r);
    }
    return map;
  }, [reactions]);

  const votesByMsg = useMemo(() => {
    const map: Record<string, PollVote[]> = {};
    for (const v of pollVotes) {
      if (!map[v.messageId]) map[v.messageId] = [];
      map[v.messageId].push(v);
    }
    return map;
  }, [pollVotes]);

  const inChatSearchFilters = useMemo(
    () => ({
      query: inChatSearch,
      typeFilter: searchTypeFilter,
      datePreset: searchDatePreset,
      customDate: searchCustomDate,
      senderId: searchSenderFilter || undefined,
    }),
    [inChatSearch, searchTypeFilter, searchDatePreset, searchCustomDate, searchSenderFilter]
  );

  const hasInChatFilters =
    Boolean(inChatSearch.trim()) || hasActiveAdvancedFilters(inChatSearchFilters);

  const filteredMessages = useMemo(() => {
    const visibleMessages = messages.filter(
      (m) => !(m.ttlSeconds && m.createdAt > 0 && nowMs >= m.createdAt + m.ttlSeconds * 1000)
    );
    if (!hasInChatFilters) return visibleMessages;
    return visibleMessages.filter((m) =>
      messageMatchesAdvancedFilters(m, inChatSearchFilters, nowMs)
    );
  }, [messages, hasInChatFilters, inChatSearchFilters, nowMs]);

  type TimelineEntry =
    | { kind: 'single'; msg: Message; index: number }
    | { kind: 'album'; items: Message[]; anchorMsg: Message; firstIndex: number; lastIndex: number };

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    const canGroupImage = (m: Message) =>
      m.type === 'image' &&
      !m.isDeleted &&
      Boolean(m.mediaUrl || m.mediaDataUrl) &&
      !m.ttlSeconds &&
      !m.isPinned;

    let i = 0;
    while (i < filteredMessages.length) {
      const current = filteredMessages[i];
      if (!canGroupImage(current)) {
        entries.push({ kind: 'single', msg: current, index: i });
        i += 1;
        continue;
      }

      const group: Message[] = [current];
      let j = i + 1;
      while (j < filteredMessages.length && group.length < 10) {
        const candidate = filteredMessages[j];
        const prev = group[group.length - 1];
        if (
          !canGroupImage(candidate) ||
          candidate.senderId !== prev.senderId ||
          candidate.replyToId ||
          (candidate.forwardedFromName || '') !== (prev.forwardedFromName || '') ||
          !isSameDay(prev.createdAt, candidate.createdAt) ||
          Math.abs((candidate.createdAt || 0) - (prev.createdAt || 0)) > 3 * 60 * 1000
        ) {
          break;
        }
        group.push(candidate);
        j += 1;
      }

      if (group.length >= 2) {
        entries.push({
          kind: 'album',
          items: group,
          anchorMsg: group[group.length - 1],
          firstIndex: i,
          lastIndex: j - 1,
        });
      } else {
        entries.push({ kind: 'single', msg: current, index: i });
      }
      i = j;
    }

    return entries;
  }, [filteredMessages]);

  const readReceiptsByMsgId = useMemo(() => {
    const map: Record<string, MessageReadReceiptInfo> = {};
    if (!chat) return map;

    const totalRecipients =
      chat.type === 'saved'
        ? 0
        : chat.type === 'direct'
        ? Math.max(otherMembers.length, 1)
        : Math.max(otherMembers.length, Math.max(0, (chat.memberCount || 1) - 1));

    for (const m of filteredMessages) {
      if (m.senderId !== currentUser.uid || m.isDeleted || m.type === 'system') continue;

      if (chat.type === 'saved') {
        map[m.id] = {
          state: 'saved',
          readBy: [],
          unreadBy: [],
          totalRecipients: 0,
        };
        continue;
      }

      if (m.createdAt <= 0) {
        map[m.id] = {
          state: 'sending',
          readBy: [],
          unreadBy: otherMembers,
          totalRecipients,
        };
        continue;
      }

      const readBy = otherMembers
        .filter((mem) => typeof mem.lastReadAt === 'number' && mem.lastReadAt > 0 && mem.lastReadAt >= m.createdAt)
        .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));

      const unreadBy = otherMembers
        .filter((mem) => !mem.lastReadAt || mem.lastReadAt < m.createdAt)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'ar'));

      let state: MessageReadReceiptInfo['state'] = 'sent';
      if (readBy.length > 0) {
        if (chat.type === 'direct') {
          state = 'all';
        } else {
          state = totalRecipients > 0 && readBy.length >= totalRecipients ? 'all' : 'partial';
        }
      }

      map[m.id] = {
        state,
        readBy,
        unreadBy,
        totalRecipients,
        latestReadAt: readBy[0]?.lastReadAt,
      };
    }

    return map;
  }, [chat, filteredMessages, otherMembers, currentUser.uid]);

  const readReceiptModalMsg = useMemo(
    () => (readReceiptMessageId ? filteredMessages.find((m) => m.id === readReceiptMessageId) || null : null),
    [readReceiptMessageId, filteredMessages]
  );

  const readReceiptModalInfo = readReceiptModalMsg
    ? readReceiptsByMsgId[readReceiptModalMsg.id] || null
    : null;

  const pinnedMessages = useMemo(() => {
    const list = messages.filter(
      (m) =>
        !m.isDeleted &&
        !(m.ttlSeconds && m.createdAt > 0 && nowMs >= m.createdAt + m.ttlSeconds * 1000) &&
        (m.isPinned === true || m.id === chat?.pinnedMessageId)
    );
    return [...list].sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt));
  }, [messages, chat?.pinnedMessageId, nowMs]);

  const pinnedMessageIds = useMemo(
    () => new Set(pinnedMessages.map((m) => m.id)),
    [pinnedMessages]
  );

  const pendingScheduledCount = useMemo(
    () => scheduledMessages.filter((s) => s.status === 'pending').length,
    [scheduledMessages]
  );

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 80;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setUnreadWhileScrolledUp(0);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setUnreadWhileScrolledUp(0);
  }, []);

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const highlightTarget = (el: HTMLElement) => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedId(messageId);
        if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = window.setTimeout(() => setHighlightedId(null), 1800);
      };

      const target = document.getElementById(`msg-${messageId}`);
      if (target) {
        highlightTarget(target);
        return;
      }

      const existsInChat = messages.some((m) => m.id === messageId && !m.isDeleted);
      if (existsInChat && hasInChatFilters) {
        setInChatSearch('');
        setSearchTypeFilter('all');
        setSearchDatePreset('all');
        setSearchSenderFilter('');
        setShowSearchBar(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const restored = document.getElementById(`msg-${messageId}`);
            if (restored) highlightTarget(restored);
          });
        });
        return;
      }

      setErrorBanner('الرسالة الأصلية غير موجودة أو تم حذفها');
    },
    [messages, hasInChatFilters]
  );

  const handleReplyMsg = useCallback((m: Message) => {
    if (!canPost || m.isDeleted) return;
    setActiveMessageMenuId(null);
    setEditingMsg(null);
    setReplyTo(m);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [canPost]);

  const handleEditMsg = useCallback((m: Message) => {
    setActiveMessageMenuId(null);
    setReplyTo(null);
    setEditingMsg(m);
    setText(m.text);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const handlePinMsg = useCallback((m: Message) => {
    onPinMessage(m);
  }, [onPinMessage]);

  const handleSendText = async () => {
    const trimmed = text.trim();
    if (!trimmed || !chat || sending) return;
    if (!editingMsg && slowModeRemainingSec > 0) {
      setErrorBanner(`الوضع البطيء مفعّل: يرجى الانتظار ${slowModeRemainingSec} ثانية قبل الإرسال.`);
      return;
    }

    setSending(true);
    setErrorBanner(null);
    stopTypingNow(chat.id);
    try {
      if (editingMsg) {
        await onEditMessage(editingMsg.id, trimmed);
        setEditingMsg(null);
      } else {
        await onSendMessage({
          type: 'text',
          text: trimmed,
          replyTo,
        });
        lastLocalSendByChatRef.current[chat.id] = Date.now();
        setNowMs(Date.now());
        setReplyTo(null);
      }
      setText('');
      onDraftChange?.(chat.id, '');
      setShowEmojiPicker(false);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      setIsAtBottom(true);
    } catch (err) {
      setErrorBanner(formatAppErrorMessage(err, 'تعذر إرسال الرسالة'));
    } finally {
      setSending(false);
    }
  };

  const handleSendBuiltinSticker = async (sticker: BuiltinSticker) => {
    if (!chat || sending) return;
    setSending(true);
    setErrorBanner(null);
    setShowStickerPicker(false);
    try {
      await onSendMessage({
        type: 'sticker',
        text: '',
        stickerId: sticker.id,
        stickerPackId: sticker.packId,
        stickerAnim: sticker.animation,
        replyTo,
      });
      setReplyTo(null);
      setIsAtBottom(true);
    } catch (err) {
      setErrorBanner(formatAppErrorMessage(err, 'تعذر إرسال الملصق'));
    } finally {
      setSending(false);
    }
  };

  const handleSendCustomSticker = async (sticker: CustomSticker) => {
    if (!chat || sending) return;
    setSending(true);
    setErrorBanner(null);
    setShowStickerPicker(false);
    try {
      await onSendMessage({
        type: 'sticker',
        text: '',
        mediaDataUrl: sticker.mediaDataUrl,
        fileMimeType: sticker.mimeType,
        stickerId: sticker.id,
        stickerPackId: sticker.packId,
        stickerAnim: sticker.animation,
        replyTo,
      });
      setReplyTo(null);
      setIsAtBottom(true);
    } catch (err) {
      setErrorBanner(formatAppErrorMessage(err, 'تعذر إرسال الملصق'));
    } finally {
      setSending(false);
    }
  };

  const sendSingleAttachment = async (
    file: File,
    forcedKind: 'image' | 'audio' | 'file' | undefined,
    captionText: string,
    replyTarget: Message | null
  ) => {
    if (!chat) return;
    const kind =
      forcedKind ||
      (file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file');

    if (kind === 'image') {
      const dataUrl = await compressImageToDataUrl(file);
      await onSendMessage({
        type: 'image',
        text: captionText,
        mediaDataUrl: dataUrl,
        replyTo: replyTarget,
      });
    } else if (kind === 'audio') {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_FILE_BYTES)})`);
      }
      const duration = await getAudioDurationFromBlobOrFile(file);
      const isInline = file.size <= INLINE_FILE_MAX_BYTES;
      const dataUrl = isInline ? await fileToDataUrl(file) : undefined;
      await onSendMessage({
        type: 'audio',
        text: captionText,
        mediaDataUrl: dataUrl,
        mediaFile: isInline ? undefined : file,
        mediaDurationSec: duration,
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type || 'audio/mpeg',
        replyTo: replyTarget,
        onProgress: isInline ? undefined : (pct) => setUploadProgress(pct),
      });
    } else {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_FILE_BYTES)})`);
      }
      const isInline = file.size <= INLINE_FILE_MAX_BYTES;
      const dataUrl = isInline ? await fileToDataUrl(file) : undefined;
      await onSendMessage({
        type: 'file',
        text: captionText,
        mediaDataUrl: dataUrl,
        mediaFile: isInline ? undefined : file,
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type || 'application/octet-stream',
        replyTo: replyTarget,
        onProgress: isInline ? undefined : (pct) => setUploadProgress(pct),
      });
    }
  };

  const processAndSendAttachments = async (
    rawFiles: File[],
    forcedKind?: 'image' | 'audio' | 'file'
  ) => {
    if (!chat || rawFiles.length === 0) return;
    const files = rawFiles.slice(0, 10);
    setShowAttachMenu(false);
    setSending(true);
    setUploadProgress(null);
    setBatchUploadLabel(files.length > 1 ? `جاري إرسال 1 من ${files.length}...` : null);
    setErrorBanner(null);
    const caption = text.trim();
    const replyTarget = replyTo;

    try {
      for (let i = 0; i < files.length; i++) {
        if (files.length > 1) {
          setBatchUploadLabel(`جاري إرسال ${i + 1} من ${files.length}...`);
          setUploadProgress(Math.round(((i + 0.2) / files.length) * 100));
        }
        await sendSingleAttachment(
          files[i],
          forcedKind,
          i === 0 ? caption : '',
          i === 0 ? replyTarget : null
        );
      }
      setText('');
      onDraftChange?.(chat.id, '');
      setReplyTo(null);
      setIsAtBottom(true);
    } catch (err) {
      setErrorBanner(formatAppErrorMessage(err, 'تعذر إرسال المرفق'));
    } finally {
      setSending(false);
      setUploadProgress(null);
      setBatchUploadLabel(null);
    }
  };

  const handleFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind?: 'image' | 'audio' | 'file'
  ) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;
    await processAndSendAttachments(selectedFiles, kind);
  };

  const cleanupRecordingResources = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (meterRafRef.current) {
      window.cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setMicLevels(Array(24).fill(22));
  };

  const startMicMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;

      const tick = (now: number) => {
        if (!analyserRef.current) return;
        if (now - lastUpdate > 65) {
          lastUpdate = now;
          analyserRef.current.getByteFrequencyData(data);
          // Average low-mid speech frequencies
          let sum = 0;
          const bins = Math.min(16, data.length);
          for (let i = 0; i < bins; i += 1) sum += data[i];
          const avg = bins > 0 ? sum / bins : 0;
          const normalized = Math.min(100, Math.max(16, Math.round((avg / 190) * 100)));
          setMicLevels((prev) => [...prev.slice(1), normalized]);
        }
        meterRafRef.current = window.requestAnimationFrame(tick);
      };
      meterRafRef.current = window.requestAnimationFrame(tick);
    } catch {
      // Fallback safely without breaking recording if AudioContext is blocked
    }
  };

  const getCurrentRecordedDurationSec = (): number => {
    const activeMs =
      mediaRecorderRef.current?.state === 'recording'
        ? Date.now() - recordStartRef.current
        : 0;
    return Math.max(1, Math.round((accumulatedMsRef.current + activeMs) / 1000));
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorBanner('متصفحك لا يدعم تسجيل الصوت عبر الميكروفون');
      return;
    }
    setErrorBanner(null);
    setShowEmojiPicker(false);
    setShowStickerPicker(false);
    setShowAttachMenu(false);

    if (recordedPreview) {
      URL.revokeObjectURL(recordedPreview.url);
      setRecordedPreview(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;

      const mimeType = getPreferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) audioChunksRef.current.push(evt.data);
      };
      recorder.onstop = () => {
        cleanupRecordingResources();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(200);
      accumulatedMsRef.current = 0;
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      setIsRecordingPaused(false);
      setIsRecording(true);
      startMicMeter(stream);

      recordTimerRef.current = window.setInterval(() => {
        if (mediaRecorderRef.current?.state !== 'recording') return;
        const elapsed = Math.floor((accumulatedMsRef.current + (Date.now() - recordStartRef.current)) / 1000);
        setRecordSeconds(elapsed);
        if (elapsed >= 300) {
          finishAndSendRecording();
        }
      }, 250);
    } catch (err) {
      cleanupRecordingResources();
      setErrorBanner(getMicrophoneErrorMessage(err));
    }
  };

  const togglePauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    if (recorder.state === 'recording') {
      accumulatedMsRef.current += Date.now() - recordStartRef.current;
      recorder.pause();
      setIsRecordingPaused(true);
      if (meterRafRef.current) {
        window.cancelAnimationFrame(meterRafRef.current);
        meterRafRef.current = null;
      }
    } else if (recorder.state === 'paused') {
      recordStartRef.current = Date.now();
      recorder.resume();
      setIsRecordingPaused(false);
      if (micStreamRef.current && !analyserRef.current) {
        startMicMeter(micStreamRef.current);
      } else if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        let lastUpdate = 0;
        const tick = (now: number) => {
          if (!analyserRef.current || mediaRecorderRef.current?.state !== 'recording') return;
          if (now - lastUpdate > 65) {
            lastUpdate = now;
            analyserRef.current.getByteFrequencyData(data);
            let sum = 0;
            const bins = Math.min(16, data.length);
            for (let i = 0; i < bins; i += 1) sum += data[i];
            const avg = bins > 0 ? sum / bins : 0;
            const normalized = Math.min(100, Math.max(16, Math.round((avg / 190) * 100)));
            setMicLevels((prev) => [...prev.slice(1), normalized]);
          }
          meterRafRef.current = window.requestAnimationFrame(tick);
        };
        meterRafRef.current = window.requestAnimationFrame(tick);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        cleanupRecordingResources();
      };
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
    }
    setIsRecording(false);
    setIsRecordingPaused(false);
    setRecordSeconds(0);
    accumulatedMsRef.current = 0;
    audioChunksRef.current = [];
  };

  const stopRecordingToPreview = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const duration = getCurrentRecordedDurationSec();
    const mimeType = recorder.mimeType || 'audio/webm';

    recorder.onstop = () => {
      cleanupRecordingResources();
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordSeconds(0);
      accumulatedMsRef.current = 0;
      audioChunksRef.current = [];

      if (blob.size < 400) {
        setErrorBanner('التسجيل قصير جداً ولم يتم التقاط صوت كافٍ');
        return;
      }

      const url = URL.createObjectURL(blob);
      setPreviewProgress(0);
      setIsPreviewPlaying(false);
      setRecordedPreview({ blob, url, duration, mimeType });
    };
    recorder.stop();
  };

  const sendAudioBlob = async (blob: Blob, duration: number, mimeType: string) => {
    if (blob.size < 400) return;
    setSending(true);
    setUploadProgress(null);
    setErrorBanner(null);
    try {
      const isInline = blob.size <= INLINE_FILE_MAX_BYTES;
      const dataUrl = isInline ? await blobToDataUrl(blob) : undefined;
      await onSendMessage({
        type: 'audio',
        text: '',
        mediaDataUrl: dataUrl,
        mediaFile: isInline ? undefined : blob,
        mediaDurationSec: duration,
        fileSize: blob.size,
        fileMimeType: mimeType || blob.type || 'audio/webm',
        replyTo,
        onProgress: isInline ? undefined : (pct) => setUploadProgress(pct),
      });
      setReplyTo(null);
      setIsAtBottom(true);
    } catch (err) {
      setErrorBanner(formatAppErrorMessage(err, 'تعذر إرسال الرسالة الصوتية'));
    } finally {
      setSending(false);
      setUploadProgress(null);
    }
  };

  const finishAndSendRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    const duration = getCurrentRecordedDurationSec();
    const mimeType = recorder.mimeType || 'audio/webm';

    recorder.onstop = async () => {
      cleanupRecordingResources();
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      setIsRecording(false);
      setIsRecordingPaused(false);
      setRecordSeconds(0);
      accumulatedMsRef.current = 0;
      audioChunksRef.current = [];
      await sendAudioBlob(blob, duration, mimeType);
    };
    recorder.stop();
  };

  const discardRecordedPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setRecordedPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setIsPreviewPlaying(false);
    setPreviewProgress(0);
  };

  const sendRecordedPreview = async () => {
    if (!recordedPreview || sending) return;
    const { blob, duration, mimeType, url } = recordedPreview;
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    setRecordedPreview(null);
    setIsPreviewPlaying(false);
    setPreviewProgress(0);
    URL.revokeObjectURL(url);
    await sendAudioBlob(blob, duration, mimeType);
  };

  if (!chat) {
    return (
      <main className="relative hidden md:flex flex-1 h-full chat-wallpaper-light items-center justify-center p-8">
        <div className="px-6 py-5 rounded-2xl bg-white/85 dark:bg-[#17212b]/90 backdrop-blur-md border border-slate-200/70 dark:border-slate-700/60 text-center max-w-sm shadow-sm">
          <img
            src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
            alt="شعار ZENO"
            className="w-20 h-20 rounded-2xl object-cover shadow-md mx-auto mb-3"
          />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
            اختر محادثة للبدء
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            حدد محادثة من القائمة الجانبية، أو أنشئ مجموعة أو قناة جديدة للتواصل الفوري.
          </p>
        </div>
        <span className="absolute bottom-3 end-4 text-xs font-medium text-slate-700/75 dark:text-slate-300/75">
          التطبيق بإدارة المهندس أمير
        </span>
      </main>
    );
  }

  const displayTitle =
    chat.type === 'saved'
      ? 'الرسائل المحفوظة'
      : peerUser?.displayName || chat.title;
  const displayPhoto = peerUser?.photoURL || chat.photoURL;
  const isOnline = peerUser && !isDirectBlocked ? isUserOnline(peerUser.lastSeen) : false;

  let typingLabel = '';
  if (typingMembers.length > 0 && !isDirectBlocked && chat.type !== 'saved') {
    if (chat.type === 'direct') {
      typingLabel = 'جاري الكتابة...';
    } else if (typingMembers.length === 1) {
      typingLabel = `${typingMembers[0].displayName.split(' ')[0]} جاري الكتابة...`;
    } else if (typingMembers.length === 2) {
      typingLabel = `${typingMembers[0].displayName.split(' ')[0]} و${typingMembers[1].displayName.split(' ')[0]} جاري الكتابة...`;
    } else {
      typingLabel = `${typingMembers[0].displayName.split(' ')[0]} و${typingMembers.length - 1} آخرون يكتبون...`;
    }
  }

  let statusLine = '';
  if (chat.type === 'saved') {
    statusLine = 'مساحتك السحابية الشخصية';
  } else if (chat.type === 'direct') {
    statusLine = isBlockedByMe
      ? 'مستخدم محظور'
      : isBlockedByPeer
      ? 'لا يمكن المراسلة'
      : formatLastSeen(peerUser?.lastSeen);
  } else if (chat.type === 'channel') {
    statusLine = `${chat.memberCount.toLocaleString('ar-EG')} مشترك`;
  } else {
    statusLine = `${chat.memberCount.toLocaleString('ar-EG')} عضو`;
  }

  if (
    (chat.type === 'direct' || chat.type === 'saved') &&
    chat.autoDeleteSeconds &&
    chat.autoDeleteSeconds > 0 &&
    !isDirectBlocked
  ) {
    statusLine = `${statusLine} · تدمير ذاتي: ${formatAutoDeleteShort(chat.autoDeleteSeconds)}`;
  }

  return (
    <main
      onDragOver={(e) => {
        if (!canPost) return;
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={async (e) => {
        if (!canPost) return;
        e.preventDefault();
        setIsDraggingFile(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length > 0) {
          await processAndSendAttachments(files);
        }
      }}
      className="relative flex-1 w-full max-w-full h-full flex flex-col min-w-0 overflow-x-hidden bg-slate-50 dark:bg-[#0e1621]"
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-40 bg-sky-600/15 backdrop-blur-xs border-2 border-dashed border-sky-500 m-3 rounded-2xl flex items-center justify-center pointer-events-none">
          <div className="px-6 py-4 rounded-2xl bg-white dark:bg-[#17212b] shadow-lg text-sm font-semibold text-sky-600 dark:text-sky-400">
            أفلت الصور أو الملفات هنا للإرسال
          </div>
        </div>
      )}
      {/* Conversation Header */}
      <header className="min-h-[calc(4rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] px-3 sm:px-4 bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="العودة للمحادثات"
            className="md:hidden tap-press min-w-[40px] min-h-[40px] flex items-center justify-center -ms-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={onToggleInfoDrawer}
            className="flex items-center gap-3 min-w-0 text-start hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Avatar
              name={displayTitle}
              seed={peerUser?.uid || chat.id}
              photoURL={displayPhoto}
              type={chat.type}
              size="md"
              isOnline={isOnline}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                  {displayTitle}
                </h2>
                {chat.protectContent && (
                  <span title="محتوى محمي (النسخ والتحويل معطّلان)">
                    <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  </span>
                )}
              </div>
              {typingMembers.length > 0 ? (
                <p
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-medium truncate"
                >
                  <span className="inline-flex items-center gap-0.5 shrink-0" aria-hidden="true">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="truncate">{typingLabel}</span>
                </p>
              ) : (
                <p
                  className={`text-xs truncate ${
                    isOnline
                      ? 'text-sky-600 dark:text-sky-400 font-medium'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {statusLine}
                </p>
              )}
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="hidden lg:inline-block text-[11px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap me-1.5">
            التطبيق بإدارة المهندس أمير
          </span>
          {chat.type === 'direct' && !isDirectBlocked && onStartCall && (
            <>
              <button
                type="button"
                onClick={() => onStartCall('audio')}
                title="مكالمة صوتية"
                aria-label="مكالمة صوتية"
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => onStartCall('video')}
                title="مكالمة فيديو"
                aria-label="مكالمة فيديو"
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
          {(chat.type === 'direct' || chat.type === 'saved') && !isDirectBlocked && onUpdateAutoDeleteTimer && (
            <div ref={timerPopoverRef} className="relative">
              <button
                type="button"
                disabled={timerBusy}
                onClick={() => setShowTimerMenu((v) => !v)}
                title="مؤقت الرسائل ذاتية التدمير"
                aria-label="مؤقت الرسائل ذاتية التدمير"
                className={`inline-flex items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer disabled:opacity-50 ${
                  (chat.autoDeleteSeconds && chat.autoDeleteSeconds > 0) || showTimerMenu
                    ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Timer className="w-5 h-5" />
                {chat.autoDeleteSeconds && chat.autoDeleteSeconds > 0 ? (
                  <span className="hidden sm:inline text-[11px] font-semibold tabular-nums">
                    {formatAutoDeleteShort(chat.autoDeleteSeconds)}
                  </span>
                ) : null}
              </button>

              {showTimerMenu && (
                <div className="animate-zeno-popover absolute end-0 top-full mt-2 w-60 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-2 z-30">
                  <div className="px-3.5 pb-2 border-b border-slate-100 dark:border-slate-700/80">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-sky-500" />
                      <span>مؤقت التدمير الذاتي</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                      تختفي الرسائل الجديدة تلقائياً بعد إرسالها بالمدة المحددة
                    </p>
                  </div>
                  <div className="py-1 max-h-72 overflow-y-auto slim-scroll">
                    {AUTO_DELETE_PRESETS.map((preset) => {
                      const isActive = (chat.autoDeleteSeconds || 0) === preset.seconds;
                      return (
                        <button
                          key={preset.seconds}
                          type="button"
                          disabled={timerBusy}
                          onClick={async () => {
                            if (isActive) {
                              setShowTimerMenu(false);
                              return;
                            }
                            setTimerBusy(true);
                            try {
                              await onUpdateAutoDeleteTimer(preset.seconds);
                              setShowTimerMenu(false);
                            } catch (err) {
                              setErrorBanner(
                                formatAppErrorMessage(err, 'تعذر تحديث مؤقت التدمير الذاتي')
                              );
                            } finally {
                              setTimerBusy(false);
                            }
                          }}
                          className={`w-full px-3.5 py-2 flex items-center justify-between text-xs cursor-pointer transition-colors disabled:opacity-50 ${
                            isActive
                              ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300 font-semibold'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                          }`}
                        >
                          <span>{preset.label}</span>
                          {isActive && <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {canPost && onScheduleMessage && pendingScheduledCount > 0 && (
            <button
              type="button"
              onClick={() => setScheduleModalMode('queue')}
              title="الرسائل المجدولة"
              aria-label="الرسائل المجدولة"
              className="inline-flex items-center gap-1 p-2 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-colors cursor-pointer"
            >
              <CalendarClock className="w-5 h-5" />
              <span className="text-[11px] font-semibold tabular-nums">
                {pendingScheduledCount}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setShowSearchBar(!showSearchBar);
              if (showSearchBar) setInChatSearch('');
            }}
            title="بحث داخل المحادثة"
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              showSearchBar
                ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onToggleInfoDrawer}
            title="معلومات المحادثة"
            aria-label="معلومات المحادثة"
            className={`tap-press min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              showInfoDrawer
                ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Info className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Multi-Select Action Bar */}
      {selectionMode && (
        <div className="animate-zeno-slide-down px-4 py-2 bg-sky-50 dark:bg-[#1e2c3a] border-b border-sky-200/80 dark:border-slate-700 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              تم تحديد {selectedMessagesList.length}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!restrictContentActions && selectedMessagesList.some((m) => m.text.trim()) && (
              <button
                type="button"
                onClick={() => {
                  const combined = selectedMessagesList
                    .filter((m) => m.text.trim())
                    .map((m) => `${m.senderName}: ${m.text}`)
                    .join('\n');
                  navigator.clipboard?.writeText(combined).catch(() => {});
                  setSelectedMessageIds(new Set());
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ</span>
              </button>
            )}
            {!restrictContentActions && onBatchForwardMessages && (
              <button
                type="button"
                onClick={() => {
                  onBatchForwardMessages(selectedMessagesList);
                  setSelectedMessageIds(new Set());
                }}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Forward className="w-3.5 h-3.5" />
                <span>تحويل</span>
              </button>
            )}
            {onBatchDeleteMessages &&
              selectedMessagesList.some(
                (m) => m.senderId === currentUser.uid || isAdminOrOwner || chat.type === 'direct'
              ) && (
                <button
                  type="button"
                  disabled={batchBusy}
                  onClick={async () => {
                    const deletable = selectedMessagesList.filter(
                      (m) => m.senderId === currentUser.uid || isAdminOrOwner || chat.type === 'direct'
                    );
                    if (deletable.length === 0) return;
                    setBatchBusy(true);
                    try {
                      await onBatchDeleteMessages(deletable);
                      setSelectedMessageIds(new Set());
                    } finally {
                      setBatchBusy(false);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              )}
            <button
              type="button"
              onClick={() => setSelectedMessageIds(new Set())}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* In-Chat Advanced Search Bar */}
      {showSearchBar && (
        <div className="animate-zeno-slide-down px-3 sm:px-4 py-2.5 bg-white/95 dark:bg-[#17212b]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={inChatSearch}
              onChange={(e) => setInChatSearch(e.target.value)}
              placeholder="ابحث بالنص، اسم الملف، أو الرابط داخل المحادثة..."
              className="flex-1 bg-transparent text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none min-w-0"
            />
            {hasInChatFilters && (
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 tabular-nums shrink-0">
                {filteredMessages.length} نتيجة
              </span>
            )}
            {hasInChatFilters && (
              <button
                type="button"
                onClick={() => {
                  setInChatSearch('');
                  setSearchTypeFilter('all');
                  setSearchDatePreset('all');
                  setSearchSenderFilter('');
                }}
                title="مسح الفلاتر"
                className="tap-press p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            {onOpenGlobalAdvancedSearch && (
              <button
                type="button"
                onClick={() => onOpenGlobalAdvancedSearch(inChatSearch, chat.id)}
                title="فتح نافذة البحث المتقدم الشامل"
                className="tap-press px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span className="hidden sm:inline">بحث شامل</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowSearchBar(false);
                setInChatSearch('');
                setSearchTypeFilter('all');
                setSearchDatePreset('all');
                setSearchSenderFilter('');
              }}
              aria-label="إغلاق البحث"
              className="tap-press p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
              {MESSAGE_TYPE_FILTER_OPTIONS.map((opt) => {
                const active = searchTypeFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSearchTypeFilter(opt.key)}
                    className={`tap-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      active
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.key === 'image' && <ImageIcon className="w-3 h-3" />}
                    {opt.key === 'file' && <FileText className="w-3 h-3" />}
                    {opt.key === 'links' && <Link2 className="w-3 h-3" />}
                    {opt.key === 'audio' && <Music className="w-3 h-3" />}
                    {opt.key === 'poll' && <BarChart2 className="w-3 h-3" />}
                    {opt.key === 'text' && <MessageSquare className="w-3 h-3" />}
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-[#242f3d] rounded-lg px-2 py-1">
              <Calendar className="w-3 h-3 text-sky-600 dark:text-sky-400 shrink-0" />
              <select
                value={searchDatePreset}
                onChange={(e) => setSearchDatePreset(e.target.value as MessageSearchDatePreset)}
                aria-label="تصفية الرسائل بالتاريخ"
                className="bg-transparent text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {DATE_PRESET_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key} className="bg-white dark:bg-[#17212b]">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {searchDatePreset === 'custom' && (
              <input
                type="date"
                value={searchCustomDate}
                max={getTodayInputDateString()}
                onChange={(e) => setSearchCustomDate(e.target.value)}
                aria-label="تحديد تاريخ معين"
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#242f3d] border border-sky-400/70 text-[11px] font-medium text-slate-800 dark:text-slate-100 focus:outline-none"
              />
            )}

            {(chat.type === 'group' || chat.type === 'direct') && (
              <select
                value={searchSenderFilter}
                onChange={(e) => setSearchSenderFilter(e.target.value)}
                aria-label="تصفية حسب المرسل"
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#242f3d] text-[11px] font-medium text-slate-700 dark:text-slate-200 focus:outline-none max-w-[140px] cursor-pointer"
              >
                <option value="" className="bg-white dark:bg-[#17212b]">
                  كل المرسلين
                </option>
                <option value={currentUser.uid} className="bg-white dark:bg-[#17212b]">
                  رسائلي فقط
                </option>
                {otherMembers.map((mem) => (
                  <option
                    key={mem.uid}
                    value={mem.uid}
                    className="bg-white dark:bg-[#17212b]"
                  >
                    {mem.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Pinned Messages Bar & Drawer */}
      <PinnedMessagesBar
        chatId={chat.id}
        pinnedMessages={pinnedMessages}
        fallbackPinnedId={chat.pinnedMessageId}
        fallbackPinnedText={chat.pinnedMessageText}
        canPin={(chat.type !== 'channel' || isAdminOrOwner) && !isDirectBlocked}
        onJumpToMessage={jumpToMessage}
        onUnpinMessage={async (msg) => {
          await onPinMessage(msg);
        }}
        onUnpinAll={async () => {
          if (onUnpinAllMessages) {
            await onUnpinAllMessages(pinnedMessages);
          } else {
            await onPinMessage(null);
          }
        }}
      />

      {/* Messages Timeline */}
      <div className="relative flex-1 min-h-0 chat-wallpaper-light">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-full w-full overflow-y-auto overflow-x-hidden slim-scroll px-3 sm:px-6 py-4 space-y-1.5"
        >
          {timelineEntries.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="px-5 py-3 rounded-2xl bg-white/80 dark:bg-[#17212b]/85 text-xs text-slate-600 dark:text-slate-300 shadow-xs">
                {hasInChatFilters ? 'لا توجد رسائل مطابقة لفلاتر البحث' : 'لا توجد رسائل بعد. ابدأ المحادثة الآن!'}
              </div>
            </div>
          ) : (
            timelineEntries.map((entry) => {
              const firstIndex = entry.kind === 'album' ? entry.firstIndex : entry.index;
              const lastIndex = entry.kind === 'album' ? entry.lastIndex : entry.index;
              const firstMsg = entry.kind === 'album' ? entry.items[0] : entry.msg;
              const msg = entry.kind === 'album' ? entry.anchorMsg : entry.msg;

              const prev = firstIndex > 0 ? filteredMessages[firstIndex - 1] : null;
              const next = lastIndex < filteredMessages.length - 1 ? filteredMessages[lastIndex + 1] : null;
              const showDateHeader = !prev || !isSameDay(prev.createdAt, firstMsg.createdAt);
              const showSenderInfo =
                !next || next.senderId !== msg.senderId || next.type === 'system';

              const msgReactions = reactionsByMsg[msg.id] || EMPTY_REACTIONS;
              const msgVotes = votesByMsg[msg.id] || EMPTY_VOTES;
              const isOwn = msg.senderId === currentUser.uid;
              const msgReadReceipt =
                isOwn && !msg.isDeleted && msg.type !== 'system'
                  ? readReceiptsByMsgId[msg.id]
                  : undefined;
              const isReadByPeer = Boolean(
                msgReadReceipt &&
                  (msgReadReceipt.state === 'all' ||
                    msgReadReceipt.state === 'partial' ||
                    msgReadReceipt.state === 'saved')
              );
              const nextReadReceipt =
                next && next.senderId === currentUser.uid && !next.isDeleted && next.type !== 'system'
                  ? readReceiptsByMsgId[next.id]
                  : undefined;
              const showReadReceiptBelow = Boolean(
                msgReadReceipt &&
                  chat.type !== 'saved' &&
                  (!nextReadReceipt ||
                    nextReadReceipt.state !== msgReadReceipt.state ||
                    nextReadReceipt.readBy.length !== msgReadReceipt.readBy.length)
              );
              const remainingSec =
                !msg.isDeleted && msg.ttlSeconds
                  ? msg.createdAt > 0
                    ? Math.max(0, Math.ceil((msg.createdAt + msg.ttlSeconds * 1000 - nowMs) / 1000))
                    : msg.ttlSeconds
                  : null;

              const isEntryHighlighted =
                entry.kind === 'album'
                  ? entry.items.some((item) => item.id === highlightedId)
                  : highlightedId === msg.id;
              const isEntrySelected =
                entry.kind === 'album'
                  ? entry.items.every((item) => selectedMessageIds.has(item.id))
                  : selectedMessageIds.has(msg.id);

              return (
                <React.Fragment key={msg.id}>
                  {showDateHeader && (
                    <div className="flex justify-center my-3">
                      <span className="px-3 py-1 rounded-full bg-slate-900/20 dark:bg-slate-950/50 text-white text-[11px] font-medium backdrop-blur-xs">
                        {formatDateSeparator(firstMsg.createdAt)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    groupedImageMessages={entry.kind === 'album' ? entry.items : undefined}
                    chatType={chat.type}
                    isOwn={isOwn}
                    isAdminOrOwner={isAdminOrOwner}
                    showSenderInfo={showSenderInfo}
                    isHighlighted={isEntryHighlighted}
                    isReadByPeer={isReadByPeer}
                    readReceipt={msgReadReceipt}
                    showReadReceiptBelow={showReadReceiptBelow}
                    onOpenReadReceiptDetails={(targetMsg) => setReadReceiptMessageId(targetMsg.id)}
                    currentUid={currentUser.uid}
                    reactions={msgReactions}
                    pollVotes={msgVotes}
                    fontSize={fontSize}
                    onReply={handleReplyMsg}
                    onEdit={handleEditMsg}
                    onDelete={onDeleteMessage}
                    onDeleteMessages={onBatchDeleteMessages}
                    onPin={handlePinMsg}
                    onForward={onForwardMessage}
                    onForwardMessages={onBatchForwardMessages}
                    onSendToWhatsApp={onSendMessageToWhatsApp}
                    onToggleReaction={onToggleReaction}
                    onCastVote={onCastVote}
                    onJumpToMessage={jumpToMessage}
                    onOpenImage={onOpenImage}
                    remainingSec={remainingSec}
                    canReply={canPost}
                    isFirstMessage={firstIndex === 0}
                    isPinned={pinnedMessageIds.has(msg.id)}
                    isActionMenuOpen={activeMessageMenuId === msg.id}
                    onToggleActionMenu={setActiveMessageMenuId}
                    protectContent={Boolean(chat.protectContent)}
                    selectionMode={selectionMode}
                    isSelected={isEntrySelected}
                    onToggleSelect={toggleSelectMessage}
                    onToggleSelectMessages={toggleSelectMessages}
                    commentCount={(commentsByMessageId[msg.id] || []).length}
                    allowComments={chat.allowComments !== false}
                    onOpenComments={onOpenComments}
                    currentUsername={currentUser.username}
                  />
                </React.Fragment>
              );
            })
          )}

          {typingMembers.length > 0 && !isDirectBlocked && chat.type !== 'saved' && (
            <div
              aria-live="polite"
              className="animate-zeno-msg flex items-end justify-end gap-2 pt-1.5"
            >
              {chat.type === 'group' && (
                <div className="w-8 shrink-0">
                  <Avatar
                    name={typingMembers[0].displayName}
                    seed={typingMembers[0].uid}
                    photoURL={typingMembers[0].photoURL}
                    size="xs"
                  />
                </div>
              )}
              <div className="px-3.5 py-2.5 rounded-2xl rounded-ee-md bg-white dark:bg-[#182533] border border-slate-200/70 dark:border-slate-800/80 shadow-xs flex items-center gap-2.5">
                <div className="flex items-center gap-1" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-bounce [animation-delay:300ms]" />
                </div>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {typingLabel}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Scroll to bottom FAB with live unread badge */}
        {!isAtBottom && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="النزول لآخر الرسائل"
            className="animate-zeno-popover tap-press absolute bottom-4 end-5 min-w-[44px] h-11 px-2.5 rounded-full bg-white/95 dark:bg-[#242f3d]/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700 text-slate-600 dark:text-slate-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer z-10"
          >
            {unreadWhileScrolledUp > 0 && (
              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-sky-600 text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
                {unreadWhileScrolledUp > 99 ? '99+' : unreadWhileScrolledUp}
              </span>
            )}
            <ArrowDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Error Toast */}
      {errorBanner && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-950/70 border-t border-red-200 dark:border-red-900 flex items-center justify-between text-xs text-red-700 dark:text-red-200">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Composer / Channel / Blocked Footer */}
      {isDirectBlocked ? (
        <div className="px-4 py-3 bg-white dark:bg-[#17212b] border-t border-slate-200 dark:border-slate-800 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                <Ban className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {isBlockedByMe ? 'لقد قمت بحظر هذا المستخدم' : 'المراسلة متوقفة'}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isBlockedByMe
                    ? 'قم بإلغاء الحظر إذا أردت استئناف إرسال الرسائل.'
                    : 'لا يمكنك إرسال رسائل لأن هذا المستخدم قام بحظرك.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isBlockedByMe && peerUser && onUnblockUser && (
                <button
                  type="button"
                  disabled={blockActionBusy}
                  onClick={async () => {
                    setBlockActionBusy(true);
                    try {
                      await onUnblockUser(peerUser.uid);
                    } finally {
                      setBlockActionBusy(false);
                    }
                  }}
                  className="tap-press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  {blockActionBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>إلغاء الحظر</span>
                </button>
              )}

              {onDeleteChatForBoth && (
                !confirmDeleteChat ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChat(true)}
                    className="tap-press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف المحادثة بين الطرفين</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-2.5 py-1.5">
                    <span className="text-[11px] font-medium text-red-700 dark:text-red-300">
                      تأكيد الحذف للطرفين؟
                    </span>
                    <button
                      type="button"
                      disabled={blockActionBusy}
                      onClick={async () => {
                        setBlockActionBusy(true);
                        try {
                          await onDeleteChatForBoth();
                        } finally {
                          setBlockActionBusy(false);
                          setConfirmDeleteChat(false);
                        }
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      {blockActionBusy ? '...' : 'تأكيد'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteChat(false)}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      ) : !myMembership && chat.isPublic && onJoinPublicChat ? (
        <div className="p-3 bg-white dark:bg-[#17212b] border-t border-slate-200 dark:border-slate-800 flex items-center justify-center">
          <button
            type="button"
            onClick={() => onJoinPublicChat(chat)}
            className="px-6 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {chat.type === 'channel' ? 'الاشتراك في القناة' : 'الانضمام إلى المجموعة'}
          </button>
        </div>
      ) : !canPost ? (
        <div className="p-3 bg-white dark:bg-[#17212b] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between px-6">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            النشر متاح لمشرفي القناة فقط
          </span>
          {chatItem && (
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {chatItem.muted ? (
                <>
                  <Bell className="w-4 h-4 text-sky-500" />
                  <span>تفعيل الإشعارات</span>
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4" />
                  <span>كتم القناة</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div
          ref={composerPopoverRef}
          className="bg-white/92 dark:bg-[#17212b]/92 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 relative pb-[env(safe-area-inset-bottom)]"
        >
          {/* File Upload Progress Bar */}
          {sending && (uploadProgress !== null || batchUploadLabel) && (
            <div className="px-4 py-2 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/50 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-sky-700 dark:text-sky-300">
                <span>{batchUploadLabel || 'جاري رفع الملف...'}</span>
                {uploadProgress !== null && (
                  <span className="tabular-nums">{uploadProgress}%</span>
                )}
              </div>
              {uploadProgress !== null && (
                <div className="h-1.5 w-full rounded-full bg-sky-200/70 dark:bg-sky-900/60 overflow-hidden">
                  <div
                    className="h-full bg-sky-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Reply or Edit Preview Bar */}
          {(replyTo || editingMsg) && (
            <div className="animate-zeno-slide-down px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2.5 bg-slate-50/90 dark:bg-[#1e2c3a]/70">
              <button
                type="button"
                onClick={() => {
                  if (replyTo) jumpToMessage(replyTo.id);
                }}
                className={`min-w-0 flex-1 flex items-center gap-2.5 text-start ${
                  replyTo ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  {editingMsg ? <Edit2 className="w-4 h-4" /> : <Reply className="w-4 h-4" />}
                </div>
                {replyTo?.type === 'image' && (replyTo.mediaUrl || replyTo.mediaDataUrl) && (
                  <img
                    src={replyTo.mediaUrl || replyTo.mediaDataUrl}
                    alt="صورة"
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-200/70 dark:border-slate-700"
                  />
                )}
                {replyTo?.type === 'sticker' && (
                  <div className="w-9 h-9 shrink-0 flex items-center justify-center">
                    <StickerVisual
                      stickerId={replyTo.stickerId}
                      mediaDataUrl={replyTo.mediaDataUrl}
                      animation="none"
                      label="ملصق"
                      className="w-9 h-9"
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-sky-600 dark:text-sky-400 truncate">
                    {editingMsg
                      ? 'تعديل الرسالة'
                      : `الرد على ${replyTo?.senderName}`}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {editingMsg
                      ? editingMsg.text
                      : replyTo?.text ||
                        (replyTo?.type === 'image'
                          ? 'صورة'
                          : replyTo?.type === 'sticker'
                          ? 'ملصق متحرك'
                          : replyTo?.type === 'audio'
                          ? replyTo.fileName || 'رسالة صوتية'
                          : replyTo?.type === 'file'
                          ? replyTo.fileName || 'ملف مرفق'
                          : replyTo?.pollQuestion || 'وسائط')}
                  </div>
                </div>
              </button>
              <button
                type="button"
                aria-label="إلغاء الرد أو التعديل"
                onClick={() => {
                  setReplyTo(null);
                  setEditingMsg(null);
                  if (editingMsg) setText('');
                }}
                className="tap-press p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Slow Mode Countdown Notice */}
          {slowModeRemainingSec > 0 && !editingMsg && (
            <div className="px-4 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/70 dark:border-amber-900/50 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              <Timer className="w-3.5 h-3.5" />
              <span>الوضع البطيء مفعّل · يمكنك الإرسال بعد {slowModeRemainingSec} ث</span>
            </div>
          )}

          {/* @mention Autocomplete Popover */}
          {mentionSuggestions.length > 0 && (
            <div className="animate-zeno-popover absolute bottom-full mb-2 start-4 end-4 sm:end-auto sm:w-72 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-1.5 z-30 max-h-56 overflow-y-auto slim-scroll">
              <div className="px-3 py-1 text-[10px] font-semibold text-slate-400">
                الإشارة إلى عضو (@mention)
              </div>
              {mentionSuggestions.map((m) => (
                <button
                  key={m.uid}
                  type="button"
                  onClick={() => {
                    const replaced = text.replace(/@([a-zA-Z0-9_]{0,32})$/, `@${m.username} `);
                    setText(replaced);
                    if (!editingMsg) {
                      onDraftChange?.(chat.id, replaced);
                    }
                    triggerTypingPing(chat.id);
                    requestAnimationFrame(() => textareaRef.current?.focus());
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2.5 text-start hover:bg-sky-50 dark:hover:bg-slate-700/60 cursor-pointer"
                >
                  <Avatar name={m.displayName} seed={m.uid} photoURL={m.photoURL} size="xs" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {m.displayName}
                    </div>
                    {m.username && (
                      <div className="text-[11px] font-mono text-sky-600 dark:text-sky-400 truncate" dir="ltr">
                        @{m.username}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Emoji Picker Popover */}
          {showEmojiPicker && (
            <div className="animate-zeno-popover absolute bottom-full mb-2 start-4 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-2xl p-3 shadow-xl grid grid-cols-8 gap-1.5 z-30">
              {EMOJI_GRID.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    const nextVal = text + emoji;
                    setText(nextVal);
                    if (!editingMsg) {
                      onDraftChange?.(chat.id, nextVal);
                    }
                    triggerTypingPing(chat.id);
                  }}
                  className="tap-press w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-lg flex items-center justify-center cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Animated Stickers Picker Popover */}
          {showStickerPicker && (() => {
            const activeBuiltinPack = BUILTIN_STICKER_PACKS.find((p) => p.id === activeStickerTab);
            const activeCustomPack = stickerPacks.find((p) => p.id === activeStickerTab);
            const fallbackPack = !activeBuiltinPack && !activeCustomPack ? BUILTIN_STICKER_PACKS[0] : activeBuiltinPack;
            const customPackStickers = activeCustomPack ? customStickersByPack[activeCustomPack.id] || [] : [];

            return (
              <div className="animate-zeno-popover absolute bottom-full mb-2 start-2 sm:start-4 w-[min(92vw,370px)] bg-white dark:bg-[#1d2733] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-30">
                {/* Picker Header */}
                <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-700/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-white">
                    <Sticker className="w-4 h-4 text-sky-500" />
                    <span>الملصقات المتحركة</span>
                  </div>
                  {onOpenStickerPackModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowStickerPicker(false);
                        onOpenStickerPackModal();
                      }}
                      className="tap-press inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/12 hover:bg-sky-500/20 text-sky-600 dark:text-sky-300 text-[11px] font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>حزمة من المعرض</span>
                    </button>
                  )}
                </div>

                {/* Pack Tabs */}
                <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {BUILTIN_STICKER_PACKS.map((pack) => {
                    const resolvedBuiltinPack = activeBuiltinPack || (!activeCustomPack ? fallbackPack : undefined);
                    const isActive = resolvedBuiltinPack?.id === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setActiveStickerTab(pack.id)}
                        title={pack.title}
                        className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pack.title}
                      </button>
                    );
                  })}

                  {stickerPacks.map((pack) => {
                    const isActive = activeCustomPack?.id === pack.id;
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setActiveStickerTab(pack.id)}
                        title={pack.title}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pack.coverDataUrl && (
                          <img
                            src={pack.coverDataUrl}
                            alt=""
                            className="w-4 h-4 rounded object-cover"
                          />
                        )}
                        <span className="max-w-[90px] truncate">{pack.title}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Sticker Grid */}
                <div className="p-2.5 max-h-64 overflow-y-auto slim-scroll">
                  {activeCustomPack ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                          {activeCustomPack.title} ({customPackStickers.length})
                        </span>
                        {onOpenStickerPackModal && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowStickerPicker(false);
                              onOpenStickerPackModal(activeCustomPack);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            <Settings2 className="w-3 h-3" />
                            <span>تعديل / إضافة</span>
                          </button>
                        )}
                      </div>

                      {customPackStickers.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          لا توجد ملصقات في هذه الحزمة بعد
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {customPackStickers.map((st) => (
                            <button
                              key={st.id}
                              type="button"
                              disabled={sending}
                              onClick={() => handleSendCustomSticker(st)}
                              title={st.label}
                              className="tap-press aspect-square p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/70 flex items-center justify-center cursor-pointer disabled:opacity-50"
                            >
                              <StickerVisual
                                mediaDataUrl={st.mediaDataUrl}
                                animation={st.animation}
                                label={st.label}
                                className="w-14 h-14"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    fallbackPack && (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {fallbackPack.stickers.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            disabled={sending}
                            onClick={() => handleSendBuiltinSticker(st)}
                            title={st.label}
                            className="tap-press aspect-square p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/70 flex items-center justify-center cursor-pointer disabled:opacity-50"
                          >
                            <StickerVisual
                              stickerId={st.id}
                              animation={st.animation}
                              label={st.label}
                              className="w-14 h-14"
                            />
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </div>
            );
          })()}

          {/* Attach Menu Popover */}
          {showAttachMenu && (
            <div className="animate-zeno-popover absolute bottom-full mb-2 start-12 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-2xl py-1.5 w-64 shadow-xl z-30">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-sky-500 shrink-0" />
                <span>إرسال صور (صورة أو ألبوم)</span>
              </button>
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
              >
                <Music className="w-4 h-4 text-amber-500 shrink-0" />
                <span>إرسال ملف صوتي</span>
                <span className="ms-auto text-[10px] text-slate-400">حتى 100 م.ب</span>
              </button>
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>إرسال ملفات / مستندات</span>
                <span className="ms-auto text-[10px] text-slate-400">حتى 100 م.ب</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(false);
                  onOpenPollModal();
                }}
                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
              >
                <BarChart2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>إنشاء استطلاع رأي</span>
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileSelected(e, 'image')}
            className="hidden"
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => handleFileSelected(e, 'audio')}
            className="hidden"
          />
          <input
            ref={docInputRef}
            type="file"
            multiple
            onChange={(e) => handleFileSelected(e, 'file')}
            className="hidden"
          />

          <div className="px-3 py-2.5 flex items-end gap-2">
            {isRecording ? (
              <div className="flex-1 flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-2xl bg-red-50/90 dark:bg-red-950/35 border border-red-200/80 dark:border-red-900/70">
                <button
                  type="button"
                  onClick={cancelRecording}
                  title="إلغاء وحذف التسجيل"
                  aria-label="إلغاء وحذف التسجيل"
                  className="tap-press min-h-[44px] min-w-[44px] rounded-xl text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isRecordingPaused ? 'bg-amber-500' : 'bg-red-500 animate-pulse'
                    }`}
                  />
                  <span className="text-xs sm:text-sm font-semibold text-red-700 dark:text-red-200 tabular-nums">
                    {formatAudioDuration(recordSeconds)}
                  </span>
                </div>

                {/* Live Microphone Waveform Meter */}
                <div
                  aria-hidden="true"
                  className="flex-1 h-8 flex items-center justify-center gap-[2.5px] overflow-hidden px-1"
                >
                  {micLevels.map((lvl, idx) => (
                    <span
                      key={idx}
                      style={{ height: `${isRecordingPaused ? 22 : lvl}%` }}
                      className={`flex-1 max-w-[4px] rounded-full transition-[height] duration-75 ${
                        isRecordingPaused
                          ? 'bg-amber-400/60 dark:bg-amber-500/40'
                          : 'bg-red-500/80 dark:bg-red-400/85'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={togglePauseRecording}
                    title={isRecordingPaused ? 'استئناف التسجيل' : 'إيقاف مؤقت'}
                    aria-label={isRecordingPaused ? 'استئناف التسجيل' : 'إيقاف مؤقت'}
                    className="tap-press min-h-[44px] min-w-[44px] rounded-xl bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    {isRecordingPaused ? (
                      <Play className="w-4 h-4 translate-x-0.5" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={stopRecordingToPreview}
                    title="إيقاف ومعاينة قبل الإرسال"
                    aria-label="إيقاف ومعاينة قبل الإرسال"
                    className="tap-press min-h-[44px] min-w-[44px] rounded-xl bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={finishAndSendRecording}
                    disabled={sending}
                    aria-label="إرسال الرسالة الصوتية"
                    className="tap-press min-h-[44px] px-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-4 h-4 -translate-x-0.5" />
                    <span className="hidden sm:inline">إرسال</span>
                  </button>
                </div>
              </div>
            ) : recordedPreview ? (
              <div className="flex-1 flex items-center gap-2 sm:gap-3 px-3 py-2 rounded-2xl bg-sky-50/80 dark:bg-[#1e2c3a] border border-sky-200/80 dark:border-slate-700">
                <audio ref={previewAudioRef} src={recordedPreview.url} preload="metadata" />
                <button
                  type="button"
                  onClick={discardRecordedPreview}
                  title="حذف التسجيل"
                  aria-label="حذف التسجيل"
                  className="tap-press min-h-[44px] min-w-[44px] rounded-xl text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/50 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const audio = previewAudioRef.current;
                    if (!audio) return;
                    if (audio.paused) {
                      audio.play().catch(() => {});
                    } else {
                      audio.pause();
                    }
                  }}
                  aria-label={isPreviewPlaying ? 'إيقاف المعاينة' : 'استماع للتسجيل'}
                  className="tap-press min-h-[44px] min-w-[44px] rounded-full bg-sky-600 hover:bg-sky-700 text-white flex items-center justify-center shrink-0 cursor-pointer"
                >
                  {isPreviewPlaying ? (
                    <Pause className="w-4.5 h-4.5" />
                  ) : (
                    <Play className="w-4.5 h-4.5 translate-x-0.5" />
                  )}
                </button>

                <div className="flex-1 min-w-0">
                  <div dir="ltr" className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-100"
                      style={{ width: `${previewProgress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                    <span>معاينة التسجيل الصوتي</span>
                    <span>{formatAudioDuration(recordedPreview.duration)}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={sendRecordedPreview}
                  disabled={sending}
                  aria-label="إرسال الرسالة الصوتية"
                  className="tap-press min-h-[44px] px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 -translate-x-0.5" />
                  )}
                  <span>إرسال</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setShowStickerPicker(false);
                    setShowAttachMenu(false);
                  }}
                  title="رموز تعبيرية"
                  className={`tap-press p-2.5 rounded-xl shrink-0 cursor-pointer ${
                    showEmojiPicker
                      ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Smile className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowStickerPicker(!showStickerPicker);
                    setShowEmojiPicker(false);
                    setShowAttachMenu(false);
                  }}
                  title="ملصقات متحركة"
                  aria-label="ملصقات متحركة"
                  className={`tap-press p-2.5 rounded-xl shrink-0 cursor-pointer ${
                    showStickerPicker
                      ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Sticker className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAttachMenu(!showAttachMenu);
                    setShowEmojiPicker(false);
                    setShowStickerPicker(false);
                  }}
                  title="إرفاق ملف أو صوتية أو صورة"
                  className={`tap-press p-2.5 rounded-xl shrink-0 cursor-pointer ${
                    showAttachMenu
                      ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={text}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setText(nextVal);
                    if (!editingMsg) {
                      onDraftChange?.(chat.id, nextVal);
                    }
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;

                    if (!nextVal.trim()) {
                      stopTypingNow(chat.id);
                      return;
                    }

                    triggerTypingPing(chat.id);
                  }}
                  onBlur={() => stopTypingNow(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText();
                    } else if (e.key === 'Escape' && (replyTo || editingMsg)) {
                      e.preventDefault();
                      setReplyTo(null);
                      setEditingMsg(null);
                      if (editingMsg) setText('');
                    }
                  }}
                  placeholder={
                    editingMsg
                      ? 'عدّل رسالتك...'
                      : chat.autoDeleteSeconds && chat.autoDeleteSeconds > 0
                      ? 'اكتب رسالة ذاتية التدمير...'
                      : 'اكتب رسالة...'
                  }
                  className="flex-1 min-w-0 max-h-[140px] py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-[#242f3d] text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40 leading-relaxed transition-[box-shadow,background-color] duration-150"
                />

                {canPost && onScheduleMessage && !editingMsg && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker(false);
                      setShowStickerPicker(false);
                      setShowAttachMenu(false);
                      setScheduleModalMode(
                        !text.trim() && pendingScheduledCount > 0 ? 'queue' : 'compose'
                      );
                    }}
                    disabled={sending}
                    title={
                      text.trim()
                        ? 'جدولة إرسال الرسالة لاحقاً'
                        : pendingScheduledCount > 0
                        ? `الرسائل المجدولة (${pendingScheduledCount})`
                        : 'جدولة رسالة'
                    }
                    aria-label="جدولة رسالة"
                    className={`tap-press p-2.5 rounded-xl shrink-0 cursor-pointer relative ${
                      pendingScheduledCount > 0
                        ? 'bg-sky-500/12 text-sky-600 dark:text-sky-400'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <CalendarClock className="w-5 h-5" />
                    {pendingScheduledCount > 0 && (
                      <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                        {pendingScheduledCount}
                      </span>
                    )}
                  </button>
                )}

                {text.trim() ? (
                  <button
                    type="button"
                    onClick={handleSendText}
                    disabled={sending || (!editingMsg && slowModeRemainingSec > 0)}
                    aria-label="إرسال"
                    className="tap-press p-2.5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white shrink-0 cursor-pointer"
                  >
                    <Send className="w-5 h-5 -translate-x-0.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    disabled={sending || slowModeRemainingSec > 0}
                    title="تسجيل رسالة صوتية"
                    className="tap-press p-2.5 rounded-full bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-500 hover:text-white text-slate-600 dark:text-slate-300 shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {scheduleModalMode && onScheduleMessage && (
        <ScheduleMessageModal
          mode={scheduleModalMode}
          initialText={text}
          replyTo={replyTo}
          scheduledMessages={scheduledMessages}
          onClose={() => setScheduleModalMode(null)}
          onSchedule={async (scheduledFor, finalText) => {
            await onScheduleMessage({
              type: 'text',
              text: finalText,
              scheduledFor,
              replyTo,
            });
            setText('');
            onDraftChange?.(chat.id, '');
            setReplyTo(null);
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
            }
          }}
          onSendNow={async (sched) => {
            if (onSendScheduledNow) await onSendScheduledNow(sched);
          }}
          onReschedule={async (scheduledId, scheduledFor, newText) => {
            if (onRescheduleMessage) await onRescheduleMessage(scheduledId, scheduledFor, newText);
          }}
          onCancelScheduled={async (scheduledId) => {
            if (onCancelScheduledMessage) await onCancelScheduledMessage(scheduledId);
          }}
        />
      )}
      {readReceiptModalMsg && readReceiptModalInfo && (
        <div
          onClick={() => setReadReceiptMessageId(null)}
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-zeno-fade"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-zeno-modal w-full sm:max-w-md bg-white dark:bg-[#17212b] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden max-h-[82vh] flex flex-col"
          >
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    readReceiptModalInfo.state === 'all'
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300'
                      : readReceiptModalInfo.state === 'partial'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                  }`}
                >
                  {readReceiptModalInfo.state === 'all' || readReceiptModalInfo.state === 'partial' ? (
                    <CheckCheck className="w-5 h-5" />
                  ) : readReceiptModalInfo.state === 'sending' ? (
                    <Clock className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    معلومات القراءة
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {chat.type === 'direct'
                      ? readReceiptModalInfo.state === 'all'
                        ? 'تمت رؤية الرسالة من قبل الطرف الآخر'
                        : 'لم يقرأ الطرف الآخر هذه الرسالة بعد'
                      : readReceiptModalInfo.state === 'all'
                      ? `تمت الرؤية من الجميع (${readReceiptModalInfo.readBy.length})`
                      : readReceiptModalInfo.state === 'partial'
                      ? `قراءة جزئية · ${readReceiptModalInfo.readBy.length} من ${readReceiptModalInfo.totalRecipients} عضو`
                      : 'لم يقرأ أحد هذه الرسالة بعد'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReadReceiptMessageId(null)}
                aria-label="إغلاق"
                className="tap-press min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message Snippet Preview */}
            <div className="px-4 py-2.5 bg-slate-50/80 dark:bg-[#0e1621]/60 border-b border-slate-200/70 dark:border-slate-800">
              <div className="px-3 py-2 rounded-xl bg-[#effdde] dark:bg-[#2b5278] text-xs text-slate-800 dark:text-slate-100 flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {readReceiptModalMsg.text ||
                    (readReceiptModalMsg.type === 'image'
                      ? 'صورة مرفقة'
                      : readReceiptModalMsg.type === 'audio'
                      ? 'رسالة صوتية'
                      : readReceiptModalMsg.type === 'sticker'
                      ? 'ملصق متحرك'
                      : readReceiptModalMsg.type === 'poll'
                      ? readReceiptModalMsg.pollQuestion || 'استطلاع رأي'
                      : readReceiptModalMsg.fileName || 'ملف مرفق')}
                </span>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-300 shrink-0 tabular-nums">
                  {readReceiptModalMsg.createdAt > 0
                    ? formatMessageTime(readReceiptModalMsg.createdAt)
                    : 'الآن'}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto slim-scroll p-4 space-y-4">
              {chat.type === 'direct' ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center gap-3">
                  <Avatar
                    name={peerUser?.displayName || chat.title}
                    seed={peerUser?.uid || chat.id}
                    photoURL={peerUser?.photoURL || chat.photoURL}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {peerUser?.displayName || chat.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {readReceiptModalInfo.state === 'all' && readReceiptModalInfo.latestReadAt
                        ? `تمت الرؤية · ${formatChatListTime(readReceiptModalInfo.latestReadAt)} (${formatMessageTime(readReceiptModalInfo.latestReadAt)})`
                        : readReceiptModalInfo.state === 'sending'
                        ? 'جاري الإرسال...'
                        : 'تم الإرسال · بانتظار فتح المحادثة'}
                    </div>
                  </div>
                  {readReceiptModalInfo.state === 'all' ? (
                    <CheckCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
                  ) : readReceiptModalInfo.state === 'sending' ? (
                    <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </div>
              ) : (
                <>
                  {/* Dual-state summary badges for groups */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-sky-500/10 dark:bg-sky-500/15 border border-sky-500/20 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
                        <CheckCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        <span>تمت الرؤية</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">
                        {readReceiptModalInfo.readBy.length}
                      </span>
                    </div>
                    <div className="rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/70 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Check className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>لم يشاهدها بعد</span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                        {readReceiptModalInfo.unreadBy.length}
                      </span>
                    </div>
                  </div>

                  {/* Section 1: Seen By */}
                  <div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                      <CheckCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>تمت الرؤية بواسطة ({readReceiptModalInfo.readBy.length})</span>
                    </div>
                    {readReceiptModalInfo.readBy.length === 0 ? (
                      <div className="text-xs text-slate-500 dark:text-slate-400 py-3 px-3 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                        لم يقرأ أي عضو هذه الرسالة بعد.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {readReceiptModalInfo.readBy.map((mem) => (
                          <div
                            key={mem.uid}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50/90 dark:bg-slate-800/45"
                          >
                            <Avatar
                              name={mem.displayName}
                              seed={mem.uid}
                              photoURL={mem.photoURL}
                              size="xs"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{mem.displayName}</span>
                                {mem.role !== 'member' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 font-medium shrink-0">
                                    {mem.role === 'owner' ? 'المالك' : 'مشرف'}
                                  </span>
                                )}
                              </div>
                              {mem.lastReadAt && (
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                  قرأها {formatChatListTime(mem.lastReadAt)} · {formatMessageTime(mem.lastReadAt)}
                                </div>
                              )}
                            </div>
                            <CheckCheck className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 2: Not Yet Seen */}
                  <div>
                    <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>لم يشاهدها بعد ({readReceiptModalInfo.unreadBy.length})</span>
                    </div>
                    {readReceiptModalInfo.unreadBy.length === 0 ? (
                      <div className="text-xs text-emerald-700 dark:text-emerald-300 py-3 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 font-medium">
                        تمت رؤية هذه الرسالة من جميع الأعضاء المتواجدين.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {readReceiptModalInfo.unreadBy.map((mem) => (
                          <div
                            key={mem.uid}
                            className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50/60 dark:bg-slate-800/30"
                          >
                            <Avatar
                              name={mem.displayName}
                              seed={mem.uid}
                              photoURL={mem.photoURL}
                              size="xs"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                <span className="truncate">{mem.displayName}</span>
                                {mem.role !== 'member' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium shrink-0">
                                    {mem.role === 'owner' ? 'المالك' : 'مشرف'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                بانتظار قراءة الرسالة
                              </div>
                            </div>
                            <Check className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
