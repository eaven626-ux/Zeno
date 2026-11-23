import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  Calendar,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Music,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Chat, Message, PublicUser, UserChatItem } from '../types/telegram';
import { fetchMessagesForAdvancedSearch } from '../lib/chatService';
import {
  formatAudioDuration,
  formatChatListTime,
  formatFileSize,
  formatMessageTime,
} from '../lib/mediaUtils';
import {
  DATE_PRESET_OPTIONS,
  extractUrlsFromText,
  getLocalDayBounds,
  getTodayInputDateString,
  hasActiveAdvancedFilters,
  MESSAGE_TYPE_FILTER_OPTIONS,
  messageMatchesAdvancedFilters,
  MessageSearchDatePreset,
  MessageSearchTypeFilter,
} from '../lib/searchUtils';
import { Avatar } from './Avatar';
import { HighlightText } from './UserSearchHighlight';

interface AdvancedSearchModalProps {
  currentUser: PublicUser;
  chatItems: UserChatItem[];
  chatsById: Record<string, Chat>;
  usersById: Record<string, PublicUser>;
  initialQuery?: string;
  initialChatId?: string;
  onClose: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectMessage: (chatId: string, messageId: string) => void;
}

const TYPE_ICONS: Record<MessageSearchTypeFilter, React.ReactNode> = {
  all: <Search className="w-3.5 h-3.5" />,
  image: <ImageIcon className="w-3.5 h-3.5" />,
  file: <FileText className="w-3.5 h-3.5" />,
  links: <Link2 className="w-3.5 h-3.5" />,
  audio: <Music className="w-3.5 h-3.5" />,
  poll: <BarChart2 className="w-3.5 h-3.5" />,
  text: <MessageSquare className="w-3.5 h-3.5" />,
};

export const AdvancedSearchModal: React.FC<AdvancedSearchModalProps> = ({
  currentUser,
  chatItems,
  chatsById,
  usersById,
  initialQuery = '',
  initialChatId = '',
  onClose,
  onSelectChat,
  onSelectMessage,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState<MessageSearchTypeFilter>('all');
  const [datePreset, setDatePreset] = useState<MessageSearchDatePreset>('all');
  const [customDate, setCustomDate] = useState<string>(() => getTodayInputDateString());
  const [selectedChatId, setSelectedChatId] = useState<string>(initialChatId);
  const [senderScope, setSenderScope] = useState<'all' | 'me'>('all');

  const [messagesPool, setMessagesPool] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const recentCacheRef = useRef<Record<string, Message[]>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const chatIdsToSearch = useMemo(() => {
    if (selectedChatId) return [selectedChatId];
    return chatItems.map((i) => i.chatId);
  }, [selectedChatId, chatItems]);

  useEffect(() => {
    let cancelled = false;
    const isCustomDay = datePreset === 'custom';
    const dayBounds = isCustomDay ? getLocalDayBounds(customDate) : null;
    if (isCustomDay && !dayBounds) {
      setMessagesPool([]);
      setLoading(false);
      return;
    }

    const cacheKey = isCustomDay
      ? `${selectedChatId || 'all'}::day::${customDate}`
      : `${selectedChatId || 'all'}::recent`;

    if (recentCacheRef.current[cacheKey]) {
      setMessagesPool(recentCacheRef.current[cacheKey]);
      setLoading(false);
      setFetchError(null);
      return;
    }

    setLoading(true);
    setFetchError(null);

    fetchMessagesForAdvancedSearch(chatIdsToSearch, {
      startMs: dayBounds?.startMs,
      endMs: dayBounds?.endMs,
      perChatLimit: selectedChatId ? 250 : 120,
    })
      .then((msgs) => {
        if (cancelled) return;
        recentCacheRef.current[cacheKey] = msgs;
        setMessagesPool(msgs);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'تعذر تحميل نتائج البحث');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chatIdsToSearch, selectedChatId, datePreset, customDate]);

  const getChatDisplayMeta = (item: UserChatItem) => {
    const chat = chatsById[item.chatId];
    const peer = item.peerUserId ? usersById[item.peerUserId] : undefined;
    const title =
      item.type === 'saved'
        ? 'الرسائل المحفوظة'
        : peer?.displayName || chat?.title || item.title;
    const photoURL =
      item.type === 'direct'
        ? peer
          ? peer.photoURL
          : item.photoURL
        : chat
        ? chat.photoURL
        : item.photoURL;
    return { chat, peer, title, photoURL };
  };

  const chatItemById = useMemo(() => {
    const map: Record<string, UserChatItem> = {};
    for (const item of chatItems) map[item.chatId] = item;
    return map;
  }, [chatItems]);

  const filters = useMemo(
    () => ({
      query,
      typeFilter,
      datePreset,
      customDate,
      chatId: selectedChatId || undefined,
      senderId: senderScope === 'me' ? currentUser.uid : undefined,
    }),
    [query, typeFilter, datePreset, customDate, selectedChatId, senderScope, currentUser.uid]
  );

  const filtersActive = hasActiveAdvancedFilters(filters);

  const matchedChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || typeFilter !== 'all' || datePreset !== 'all' || selectedChatId || senderScope !== 'all') {
      return [];
    }
    const cleanQ = q.replace(/^@+/, '');
    return chatItems
      .filter((item) => {
        const { chat, peer, title } = getChatDisplayMeta(item);
        const username = (peer?.username || chat?.username || '').toLowerCase();
        return title.toLowerCase().includes(q) || (cleanQ ? username.includes(cleanQ) : false);
      })
      .slice(0, 6);
  }, [query, typeFilter, datePreset, selectedChatId, senderScope, chatItems, chatsById, usersById]);

  const matchedMessages = useMemo(() => {
    const hasSearchCriteria = Boolean(query.trim()) || filtersActive;
    if (!hasSearchCriteria) return [];
    const nowMs = Date.now();
    return messagesPool
      .filter((msg) => messageMatchesAdvancedFilters(msg, filters, nowMs))
      .slice(0, 120);
  }, [messagesPool, filters, filtersActive, query]);

  const resetAllFilters = () => {
    setQuery('');
    setTypeFilter('all');
    setDatePreset('all');
    setSelectedChatId('');
    setSenderScope('all');
  };

  const hasCriteria = Boolean(query.trim()) || filtersActive;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-zeno-fade"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full sm:max-w-2xl bg-white dark:bg-[#17212b] rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden h-[88vh] sm:h-[82vh] flex flex-col"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
              <SlidersHorizontal className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                البحث المتقدم في المحادثات والرسائل
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                ابحث حسب الصور، الملفات، الروابط، الصوتيات، أو التاريخ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {hasCriteria && (
              <button
                type="button"
                onClick={resetAllFilters}
                title="إعادة ضبط الفلاتر"
                className="tap-press px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">إعادة ضبط</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="tap-press min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Input + Filter Controls */}
        <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-[#0e1621]/45 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="اكتب كلمة، اسم ملف، رابط، اسم مرسل..."
              className="w-full h-10 ps-9 pe-9 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="مسح النص"
                className="absolute top-1/2 -translate-y-1/2 end-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Content Type Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {MESSAGE_TYPE_FILTER_OPTIONS.map((opt) => {
              const active = typeFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setTypeFilter(opt.key)}
                  className={`tap-press inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#17212b] border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#202b36]'
                  }`}
                >
                  {TYPE_ICONS[opt.key]}
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Date, Chat Scope & Sender Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Chat Selector */}
            <select
              value={selectedChatId}
              onChange={(e) => setSelectedChatId(e.target.value)}
              aria-label="نطاق المحادثة"
              className="h-8.5 px-2.5 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200/80 dark:border-slate-700/80 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/40 max-w-[190px]"
            >
              <option value="">جميع المحادثات ({chatItems.length})</option>
              {chatItems.map((item) => {
                const { title } = getChatDisplayMeta(item);
                return (
                  <option key={item.chatId} value={item.chatId}>
                    {title}
                  </option>
                );
              })}
            </select>

            {/* Date Preset Selector */}
            <div className="inline-flex items-center gap-1.5 bg-white dark:bg-[#17212b] border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-2.5 h-8.5">
              <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as MessageSearchDatePreset)}
                aria-label="تصفية حسب التاريخ"
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {DATE_PRESET_OPTIONS.map((opt) => (
                  <option
                    key={opt.key}
                    value={opt.key}
                    className="bg-white dark:bg-[#17212b]"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Specific Date Picker */}
            {datePreset === 'custom' && (
              <input
                type="date"
                value={customDate}
                max={getTodayInputDateString()}
                onChange={(e) => setCustomDate(e.target.value)}
                aria-label="اختيار تاريخ محدد"
                className="h-8.5 px-2.5 rounded-xl bg-white dark:bg-[#17212b] border border-sky-400 dark:border-sky-500/60 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            )}

            {/* Sender Toggle */}
            <button
              type="button"
              onClick={() => setSenderScope((prev) => (prev === 'me' ? 'all' : 'me'))}
              className={`tap-press h-8.5 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                senderScope === 'me'
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                  : 'bg-white dark:bg-[#17212b] border-slate-200/80 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#202b36]'
              }`}
            >
              رسائلي فقط
            </button>
          </div>
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto slim-scroll p-3 sm:p-4 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
              <span>جاري البحث في المحادثات والرسائل...</span>
            </div>
          ) : fetchError ? (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300 text-center">
              {fetchError}
            </div>
          ) : !hasCriteria ? (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  ابدأ بالكتابة أو اختر فلتراً للبحث
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  يمكنك استعراض جميع الصور، الملفات، الروابط، الرسائل الصوتية، أو رسائل يوم معيّن عبر كل محادثاتك فوراً.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTypeFilter('image')}
                  className="tap-press px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-sky-500" />
                  <span>عرض الصور</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('file')}
                  className="tap-press px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-500" />
                  <span>عرض الملفات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTypeFilter('links')}
                  className="tap-press px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>عرض الروابط</span>
                </button>
              </div>
            </div>
          ) : matchedChats.length === 0 && matchedMessages.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                لا توجد نتائج مطابقة للفلاتر المحددة
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                جرّب تغيير نوع المحتوى أو توسيع نطاق التاريخ أو المحادثة.
              </p>
            </div>
          ) : (
            <>
              {/* Matching Chats */}
              {matchedChats.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 px-1">
                    المحادثات المطابقة ({matchedChats.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {matchedChats.map((item) => {
                      const { title, photoURL } = getChatDisplayMeta(item);
                      return (
                        <button
                          key={item.chatId}
                          type="button"
                          onClick={() => {
                            onSelectChat(item.chatId);
                            onClose();
                          }}
                          className="tap-press p-2.5 rounded-xl bg-slate-50 dark:bg-[#202b36]/75 hover:bg-sky-50 dark:hover:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 flex items-center gap-2.5 text-start cursor-pointer"
                        >
                          <Avatar
                            name={title}
                            seed={item.peerUserId || item.chatId}
                            photoURL={photoURL}
                            type={item.type}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <HighlightText
                              text={title}
                              query={query}
                              className="block text-xs font-semibold text-slate-900 dark:text-white truncate"
                            />
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {item.type === 'saved'
                                ? 'الرسائل المحفوظة'
                                : item.type === 'group'
                                ? 'مجموعة'
                                : item.type === 'channel'
                                ? 'قناة'
                                : 'محادثة خاصة'}
                            </span>
                          </div>
                          <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Matching Messages */}
              {matchedMessages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      الرسائل المطابقة ({matchedMessages.length})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      اضغط للانتقال مباشرة للرسالة
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedMessages.map((msg) => {
                      const item = chatItemById[msg.chatId];
                      const meta = item
                        ? getChatDisplayMeta(item)
                        : {
                            title: chatsById[msg.chatId]?.title || 'محادثة',
                            photoURL: chatsById[msg.chatId]?.photoURL,
                          };
                      const urls = extractUrlsFromText(msg.text);

                      return (
                        <button
                          key={`${msg.chatId}_${msg.id}`}
                          type="button"
                          onClick={() => {
                            onSelectMessage(msg.chatId, msg.id);
                            onClose();
                          }}
                          className="tap-press w-full p-3 rounded-xl bg-slate-50/80 dark:bg-[#202b36]/60 hover:bg-sky-50/90 dark:hover:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 flex items-start gap-3 text-start cursor-pointer transition-colors"
                        >
                          <Avatar
                            name={meta.title}
                            seed={item?.peerUserId || msg.chatId}
                            photoURL={meta.photoURL}
                            type={item?.type || chatsById[msg.chatId]?.type || 'direct'}
                            size="sm"
                          />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                  {meta.title}
                                </span>
                                {item?.folder === 'archived' && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-[10px] text-slate-600 dark:text-slate-300 shrink-0">
                                    مؤرشفة
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                {formatChatListTime(msg.createdAt)} · {formatMessageTime(msg.createdAt)}
                              </span>
                            </div>

                            <div className="text-[11px] text-sky-600 dark:text-sky-400 font-medium mb-1">
                              {msg.senderId === currentUser.uid ? 'أنت' : msg.senderName}
                            </div>

                            {/* Media / Content Preview */}
                            {msg.type === 'image' && (
                              <div className="flex items-center gap-2.5 mt-1">
                                {msg.mediaDataUrl ? (
                                  <img
                                    src={msg.mediaDataUrl}
                                    alt={msg.text || 'صورة'}
                                    referrerPolicy="no-referrer"
                                    className="w-12 h-12 rounded-lg object-cover bg-slate-200 dark:bg-slate-700 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300 flex items-center justify-center shrink-0">
                                    <ImageIcon className="w-4 h-4" />
                                  </div>
                                )}
                                <span className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                  {msg.text ? (
                                    <HighlightText text={msg.text} query={query} />
                                  ) : (
                                    'صورة مرفقة'
                                  )}
                                </span>
                              </div>
                            )}

                            {msg.type === 'file' && (
                              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200/80 dark:border-slate-700/70">
                                <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <HighlightText
                                    text={msg.fileName || 'ملف مرفق'}
                                    query={query}
                                    className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate"
                                  />
                                  <span className="text-[10.5px] text-slate-400 tabular-nums">
                                    {formatFileSize(msg.fileSize)}
                                  </span>
                                </div>
                              </div>
                            )}

                            {msg.type === 'audio' && (
                              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                <Music className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                <span>
                                  {msg.fileName || 'رسالة صوتية'}
                                  {typeof msg.mediaDurationSec === 'number'
                                    ? ` · ${formatAudioDuration(msg.mediaDurationSec)}`
                                    : ''}
                                </span>
                              </div>
                            )}

                            {msg.type === 'poll' && (
                              <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 font-medium">
                                <BarChart2 className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                                <HighlightText
                                  text={msg.pollQuestion || 'استطلاع رأي'}
                                  query={query}
                                  className="truncate"
                                />
                              </div>
                            )}

                            {(msg.type === 'text' || msg.type === 'sticker') && msg.text && (
                              <p className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed">
                                <HighlightText text={msg.text} query={query} />
                              </p>
                            )}

                            {urls.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {urls.slice(0, 2).map((u, idx) => (
                                  <span
                                    key={idx}
                                    dir="ltr"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono max-w-full truncate"
                                  >
                                    <Link2 className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{u}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
