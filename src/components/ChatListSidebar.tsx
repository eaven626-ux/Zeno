import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowRight,
  Ban,
  BellOff,
  ChevronLeft,
  Compass,
  Loader2,
  Lock,
  MailCheck,
  Megaphone,
  Menu,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Chat, FolderKey, PublicUser, Story, StoryView, UserChatItem } from '../types/telegram';
import { formatChatListTime, isUserOnline } from '../lib/mediaUtils';
import { findUserByExactUsername, normalizeUsernameInput } from '../lib/chatService';
import { Avatar } from './Avatar';
import { HighlightText } from './UserSearchHighlight';
import { PWAInstallButton } from './PWAComponents';
import { StoriesBar } from './StoriesBar';

interface ChatListSidebarProps {
  currentUser: PublicUser;
  allUsers: PublicUser[];
  chatItems: UserChatItem[];
  chatsById: Record<string, Chat>;
  usersById: Record<string, PublicUser>;
  activeChatId: string | null;
  activeFolder: FolderKey;
  onSelectFolder: (folder: FolderKey) => void;
  onSelectChat: (chatId: string) => void;
  onStartDirectUser: (user: PublicUser) => Promise<void>;
  onTogglePin: (item: UserChatItem) => void;
  onToggleMute: (item: UserChatItem) => void;
  onToggleArchive: (item: UserChatItem) => void;
  onOpenNewChat: () => void;
  onOpenNewChannel: () => void;
  onOpenDiscover: () => void;
  onOpenSettings: () => void;
  blockedByMeIds?: Set<string>;
  onBlockUser?: (uid: string) => Promise<void>;
  onUnblockUser?: (uid: string) => Promise<void>;
  onDeleteDirectChatForBoth?: (chat: Chat, peerUid?: string) => Promise<void>;
  draftsByChatId?: Record<string, string>;
  passcodeEnabled?: boolean;
  onLockApp?: () => void;
  stories?: Story[];
  onCreateStory?: (payload: {
    type: 'text' | 'image' | 'video';
    text: string;
    mediaDataUrl?: string;
    mediaFile?: Blob;
    fileMimeType?: string;
    mediaDurationSec?: number;
    thumbnailDataUrl?: string;
    bgColor?: string;
    onProgress?: (percent: number) => void;
  }) => Promise<void>;
  onDeleteStory?: (storyId: string) => Promise<void>;
  onMarkStoryViewed?: (story: Story) => Promise<void>;
  onLoadStoryViews?: (storyId: string) => Promise<StoryView[]>;
  onReplyToStory?: (story: Story, replyText: string) => Promise<void>;
  onOpenAdvancedSearch?: (initialQuery?: string) => void;
}

const MOBILE_FOLDERS: { key: FolderKey; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'personal', label: 'الخاصة' },
  { key: 'groups', label: 'المجموعات' },
  { key: 'channels', label: 'القنوات' },
  { key: 'archived', label: 'الأرشيف' },
];

export const ChatListSidebar: React.FC<ChatListSidebarProps> = ({
  currentUser,
  allUsers,
  chatItems,
  chatsById,
  usersById,
  activeChatId,
  activeFolder,
  onSelectFolder,
  onSelectChat,
  onStartDirectUser,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onOpenNewChat,
  onOpenNewChannel,
  onOpenDiscover,
  onOpenSettings,
  blockedByMeIds,
  onBlockUser,
  onUnblockUser,
  onDeleteDirectChatForBoth,
  draftsByChatId,
  passcodeEnabled = false,
  onLockApp,
  stories = [],
  onCreateStory,
  onDeleteStory,
  onMarkStoryViewed,
  onLoadStoryViews,
  onReplyToStory,
  onOpenAdvancedSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [contextItemId, setContextItemId] = useState<string | null>(null);
  const [confirmDeleteChatId, setConfirmDeleteChatId] = useState<string | null>(null);
  const [exactMatchUser, setExactMatchUser] = useState<PublicUser | null>(null);
  const [searchingExact, setSearchingExact] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!contextItemId) {
      setConfirmDeleteChatId(null);
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextItemId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextItemId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [contextItemId]);

  const normalizedUsernameQuery = useMemo(() => normalizeUsernameInput(searchQuery), [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const canSearchUser = normalizedUsernameQuery.length >= 3;

    if (!canSearchUser) {
      setExactMatchUser(null);
      setSearchingExact(false);
      return;
    }

    const alreadyInList = allUsers.some(
      (u) => u.uid !== currentUser.uid && u.username.toLowerCase() === normalizedUsernameQuery
    );
    if (alreadyInList) {
      setExactMatchUser(null);
      setSearchingExact(false);
      return;
    }

    setSearchingExact(true);
    const timer = window.setTimeout(async () => {
      const found = await findUserByExactUsername(normalizedUsernameQuery);
      if (!cancelled) {
        setExactMatchUser(found && found.uid !== currentUser.uid ? found : null);
        setSearchingExact(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, normalizedUsernameQuery, allUsers, currentUser.uid]);

  const suggestedUsers = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    if (!rawQ) return [];
    const cleanQ = rawQ.replace(/^@+/, '');

    const pool = [...allUsers];
    if (
      exactMatchUser &&
      exactMatchUser.uid !== currentUser.uid &&
      !pool.some((u) => u.uid === exactMatchUser.uid)
    ) {
      pool.unshift(exactMatchUser);
    }

    return pool
      .filter((u) => {
        if (u.uid === currentUser.uid) return false;
        if (exactMatchUser && u.uid === exactMatchUser.uid) return true;
        const nameMatch = u.displayName.toLowerCase().includes(rawQ);
        const userMatch = cleanQ ? u.username.toLowerCase().includes(cleanQ) : false;
        return nameMatch || userMatch;
      })
      .sort((a, b) => {
        const score = (u: PublicUser) => {
          if (exactMatchUser && u.uid === exactMatchUser.uid) return -1;
          const uName = u.username.toLowerCase();
          const dName = u.displayName.toLowerCase();
          if (cleanQ && uName === cleanQ) return 0;
          if (dName === rawQ) return 1;
          if (cleanQ && uName.startsWith(cleanQ)) return 2;
          if (dName.startsWith(rawQ)) return 3;
          return 4;
        };
        return score(a) - score(b);
      })
      .slice(0, 6);
  }, [allUsers, exactMatchUser, currentUser.uid, searchQuery]);

  const totalFolderUnreadCount = useMemo(() => {
    let total = 0;
    for (const item of chatItems) {
      const inFolder =
        activeFolder === 'archived'
          ? item.folder === 'archived'
          : item.folder !== 'archived' &&
            (activeFolder === 'all' ||
              (activeFolder === 'personal' && (item.type === 'direct' || item.type === 'saved')) ||
              (activeFolder === 'groups' && item.type === 'group') ||
              (activeFolder === 'channels' && item.type === 'channel'));
      if (!inFolder) continue;
      const chat = chatsById[item.chatId];
      const hasUnread =
        Boolean(chat?.lastMessageAt) &&
        Boolean(chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid) &&
        (!item.lastReadAt || (chat?.lastMessageAt || 0) > item.lastReadAt);
      if (hasUnread) total += 1;
    }
    return total;
  }, [chatItems, chatsById, activeFolder, currentUser.uid]);

  const filteredItems = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    const cleanQ = rawQ.replace(/^@+/, '');

    const matchesFolder = (item: UserChatItem) => {
      if (activeFolder === 'archived') return item.folder === 'archived';
      if (item.folder === 'archived') return false;
      if (activeFolder === 'all') return true;
      if (activeFolder === 'personal') return item.type === 'direct' || item.type === 'saved';
      if (activeFolder === 'groups') return item.type === 'group';
      if (activeFolder === 'channels') return item.type === 'channel';
      return true;
    };

    return chatItems
      .filter((item) => {
        if (!matchesFolder(item)) return false;
        const chat = chatsById[item.chatId];
        if (unreadOnly) {
          const hasUnread =
            Boolean(chat?.lastMessageAt) &&
            Boolean(chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid) &&
            (!item.lastReadAt || (chat?.lastMessageAt || 0) > item.lastReadAt);
          if (!hasUnread) return false;
        }
        if (!rawQ) return true;
        const peer = item.peerUserId ? usersById[item.peerUserId] : undefined;
        const title = (peer?.displayName || chat?.title || item.title).toLowerCase();
        const username = (peer?.username || chat?.username || '').toLowerCase();
        const lastMsg = (chat?.lastMessageText || '').toLowerCase();
        return (
          title.includes(rawQ) ||
          (cleanQ ? username.includes(cleanQ) : false) ||
          lastMsg.includes(rawQ)
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aTime = chatsById[a.chatId]?.lastMessageAt || a.joinedAt;
        const bTime = chatsById[b.chatId]?.lastMessageAt || b.joinedAt;
        return bTime - aTime;
      });
  }, [chatItems, chatsById, usersById, activeFolder, searchQuery, unreadOnly, currentUser.uid]);

  const archivedSummary = useMemo(() => {
    let count = 0;
    let unreadCount = 0;
    for (const item of chatItems) {
      if (item.folder !== 'archived') continue;
      count += 1;
      const chat = chatsById[item.chatId];
      const hasUnread =
        Boolean(chat?.lastMessageAt) &&
        Boolean(chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid) &&
        (!item.lastReadAt || (chat?.lastMessageAt || 0) > item.lastReadAt);
      if (hasUnread) unreadCount += 1;
    }
    return { count, unreadCount };
  }, [chatItems, chatsById, currentUser.uid]);

  return (
    <section className="w-full max-w-full md:w-[330px] lg:w-[360px] shrink-0 h-full flex flex-col overflow-x-hidden bg-white dark:bg-[#17212b] border-e border-slate-200 dark:border-slate-800/80">
      {/* Header & Search */}
      <div className="px-3.5 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2.5 bg-white/90 dark:bg-[#17212b]/90 backdrop-blur-md border-b border-slate-100 dark:border-slate-800/70 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="الإعدادات"
              className="md:hidden tap-press p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img
              src="/assets/aistudio/0797a49f-6ad5-4b39-a144-03af011c1001_ff49981e.jpeg"
              alt="شعار ZENO"
              className="w-8 h-8 rounded-lg object-cover shadow-xs shrink-0"
            />
            <h1 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
              ZENO
            </h1>
          </div>

          <div className="flex items-center gap-1">
            {passcodeEnabled && onLockApp && (
              <button
                type="button"
                onClick={onLockApp}
                title="قفل التطبيق الآن"
                className="tap-press p-2 rounded-xl text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
              >
                <Lock className="w-4.5 h-4.5" />
              </button>
            )}
            <PWAInstallButton variant="icon" />
            <button
              type="button"
              onClick={onOpenDiscover}
              title="استكشاف القنوات والمجموعات"
              className="md:hidden tap-press p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Compass className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onOpenNewChannel}
              title="إنشاء قناة جديدة"
              className="tap-press p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Megaphone className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={onOpenNewChat}
              title="محادثة جديدة"
              className="tap-press p-2 rounded-xl text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو @username..."
              className="w-full h-9 ps-9 pe-8 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="مسح البحث"
                className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setUnreadOnly((prev) => !prev)}
            title={unreadOnly ? 'عرض كل المحادثات' : 'عرض المحادثات غير المقروءة فقط'}
            aria-pressed={unreadOnly}
            aria-label="تصفية غير المقروءة"
            className={`tap-press h-9 px-2.5 rounded-xl flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
              unreadOnly
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-300'
            }`}
          >
            <MailCheck className="w-4 h-4" />
            {totalFolderUnreadCount > 0 && (
              <span
                className={`text-[11px] font-bold tabular-nums leading-none ${
                  unreadOnly ? 'text-white' : 'text-sky-600 dark:text-sky-400'
                }`}
              >
                {totalFolderUnreadCount}
              </span>
            )}
          </button>
          {onOpenAdvancedSearch && (
            <button
              type="button"
              onClick={() => onOpenAdvancedSearch(searchQuery)}
              title="البحث المتقدم بالفلاتر (صور، ملفات، روابط، تاريخ)"
              aria-label="البحث المتقدم"
              className="tap-press h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-300 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="text-xs font-medium hidden sm:inline">فلاتر</span>
            </button>
          )}
        </div>

        {unreadOnly && (
          <div className="animate-zeno-slide-down flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/35 border border-sky-200/70 dark:border-sky-800/60 text-[11px]">
            <span className="font-semibold text-sky-700 dark:text-sky-300">
              عرض المحادثات غير المقروءة فقط ({filteredItems.length})
            </span>
            <button
              type="button"
              onClick={() => setUnreadOnly(false)}
              className="text-sky-600 dark:text-sky-400 font-semibold hover:underline cursor-pointer"
            >
              عرض الكل
            </button>
          </div>
        )}

        {/* Mobile folder tabs */}
        <div className="flex md:hidden items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {MOBILE_FOLDERS.map((folder) => {
            const active = activeFolder === folder.key;
            return (
              <button
                key={folder.key}
                type="button"
                onClick={() => onSelectFolder(folder.key)}
                className={`tap-press px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#242f3d]'
                }`}
              >
                {folder.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 24h Ephemeral Stories Bar */}
      {onCreateStory && onDeleteStory && onMarkStoryViewed && onLoadStoryViews && onReplyToStory && (
        <StoriesBar
          currentUser={currentUser}
          stories={stories}
          onCreateStory={onCreateStory}
          onDeleteStory={onDeleteStory}
          onMarkViewed={onMarkStoryViewed}
          onLoadViews={onLoadStoryViews}
          onReplyToStory={onReplyToStory}
        />
      )}

      {/* Chat List & Live User Suggestions */}
      <div className="flex-1 overflow-y-auto slim-scroll divide-y divide-slate-100/60 dark:divide-slate-800/40">
        {searchQuery.trim() && onOpenAdvancedSearch && (
          <div className="p-2 bg-sky-50/70 dark:bg-sky-950/20">
            <button
              type="button"
              onClick={() => onOpenAdvancedSearch(searchQuery)}
              className="tap-press w-full px-3 py-2 rounded-xl bg-white dark:bg-[#1e2c3a] border border-sky-200/80 dark:border-sky-800/60 hover:bg-sky-50 dark:hover:bg-[#243444] flex items-center justify-between gap-2 text-xs text-sky-700 dark:text-sky-300 font-semibold cursor-pointer"
            >
              <span className="inline-flex items-center gap-2 truncate">
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">البحث المتقدم في الرسائل والملفات عن «{searchQuery.trim()}»</span>
              </span>
              <ChevronLeft className="w-4 h-4 shrink-0" />
            </button>
          </div>
        )}
        {searchQuery.trim() && (suggestedUsers.length > 0 || searchingExact) && (
          <div className="animate-zeno-slide-down p-2.5 bg-slate-50/80 dark:bg-[#0e1621]/50 space-y-1.5">
            <div className="flex items-center justify-between px-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>اقتراحات المستخدمين ({suggestedUsers.length})</span>
              {searchingExact && (
                <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-normal">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>بحث...</span>
                </span>
              )}
            </div>
            <div className="space-y-1">
              {suggestedUsers.map((user) => {
                const isBlocked = Boolean(blockedByMeIds?.has(user.uid));
                const online = !isBlocked && isUserOnline(user.lastSeen);
                return (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={async () => {
                      setSearchQuery('');
                      await onStartDirectUser(user);
                    }}
                    className="tap-press w-full px-2.5 py-2 rounded-xl flex items-center gap-2.5 bg-white dark:bg-[#17212b] hover:bg-sky-50 dark:hover:bg-[#202b36] border border-slate-200/70 dark:border-slate-800/80 text-start cursor-pointer"
                  >
                    <Avatar
                      name={user.displayName}
                      seed={user.uid}
                      photoURL={user.photoURL}
                      size="sm"
                      isOnline={online}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <HighlightText
                          text={user.displayName}
                          query={searchQuery}
                          className="text-xs font-semibold text-slate-900 dark:text-white truncate"
                        />
                        {isBlocked ? (
                          <span className="text-[10px] text-red-500 font-semibold shrink-0">
                            محظور
                          </span>
                        ) : (
                          <span className="text-[10px] text-sky-600 dark:text-sky-400 font-medium shrink-0">
                            مراسلة
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5" dir="ltr">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-sky-500/10 dark:bg-sky-400/15 text-[11px] font-mono text-sky-700 dark:text-sky-300 truncate max-w-full">
                          <HighlightText
                            text={`@${user.username}`}
                            query={searchQuery}
                            stripAtFromQuery
                          />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeFolder === 'archived' && !searchQuery.trim() && (
          <button
            type="button"
            onClick={() => onSelectFolder('all')}
            className="tap-press w-full px-3.5 py-2.5 flex items-center justify-between gap-2 bg-slate-50/90 dark:bg-[#0e1621]/60 hover:bg-slate-100 dark:hover:bg-[#202b36] text-xs font-semibold text-sky-600 dark:text-sky-400 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4" />
              <span>العودة لجميع المحادثات</span>
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">
              {archivedSummary.count} مؤرشفة
            </span>
          </button>
        )}

        {activeFolder === 'all' && !searchQuery.trim() && archivedSummary.count > 0 && (
          <button
            type="button"
            onClick={() => onSelectFolder('archived')}
            className="tap-press w-full px-3.5 min-h-[56px] py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-[#202b36] text-start cursor-pointer"
          >
            <div className="w-11 h-11 rounded-full bg-slate-200/80 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  المحادثات المؤرشفة
                </span>
                <span className="text-[11px] font-medium text-slate-400 tabular-nums shrink-0">
                  {archivedSummary.count}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {archivedSummary.unreadCount > 0
                  ? `${archivedSummary.unreadCount} محادثة غير مقروءة`
                  : 'اضغط لعرض المحادثات المؤرشفة'}
              </p>
            </div>
            <ChevronLeft className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        )}

        {filteredItems.length === 0 && suggestedUsers.length === 0 && !searchingExact && !(activeFolder === 'all' && archivedSummary.count > 0 && !searchQuery.trim() && !unreadOnly) ? (
          <div className="p-8 text-center flex flex-col items-center justify-center h-full">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {unreadOnly
                ? 'كل المحادثات مقروءة 🎉'
                : searchQuery
                ? 'لا توجد نتائج مطابقة'
                : 'لا توجد محادثات في هذا المجلد'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              {unreadOnly
                ? 'لا توجد لديك رسائل غير مقروءة في هذا المجلد حالياً'
                : searchQuery
                ? 'جرب البحث باليوزر (@username) أو رقم الهاتف المرتبط'
                : 'ابدأ محادثة جديدة أو استكشف القنوات العامة'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {unreadOnly ? (
                <button
                  type="button"
                  onClick={() => setUnreadOnly(false)}
                  className="tap-press px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  عرض جميع المحادثات
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={activeFolder === 'channels' ? onOpenNewChannel : onOpenNewChat}
                    className="tap-press px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {activeFolder === 'channels' ? 'إنشاء قناة جديدة' : 'محادثة جديدة'}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenDiscover}
                    className="tap-press px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    استكشاف القنوات
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          filteredItems.map((item) => {
            const chat = chatsById[item.chatId];
            const peer = item.peerUserId ? usersById[item.peerUserId] : undefined;
            const displayTitle =
              item.type === 'saved'
                ? 'الرسائل المحفوظة'
                : peer?.displayName || chat?.title || item.title;
            const displayPhoto =
              item.type === 'direct'
                ? peer
                  ? peer.photoURL
                  : item.photoURL
                : chat
                ? chat.photoURL
                : item.photoURL;
            const isSelected = activeChatId === item.chatId;
            const isPeerBlocked = Boolean(item.peerUserId && blockedByMeIds?.has(item.peerUserId));
            const isOnline = peer && !isPeerBlocked ? isUserOnline(peer.lastSeen) : false;

            const lastAt = chat?.lastMessageAt || item.joinedAt;
            const hasUnread =
              Boolean(chat?.lastMessageAt) &&
              Boolean(chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid) &&
              (!item.lastReadAt || (chat?.lastMessageAt || 0) > item.lastReadAt);

            const lastSenderPrefix =
              chat?.type === 'group' && chat.lastMessageSenderName
                ? chat.lastMessageSenderId === currentUser.uid
                  ? 'أنت: '
                  : `${chat.lastMessageSenderName.split(' ')[0]}: `
                : chat?.lastMessageSenderId === currentUser.uid && chat.type === 'direct'
                ? 'أنت: '
                : '';

            return (
              <div
                key={item.chatId}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextItemId(contextItemId === item.chatId ? null : item.chatId);
                }}
                className="relative group"
              >
                <button
                  type="button"
                  onClick={() => {
                    setContextItemId(null);
                    onSelectChat(item.chatId);
                  }}
                  className={`tap-press w-full px-3.5 min-h-[62px] py-2.5 flex items-center gap-3 text-start cursor-pointer transition-colors duration-150 ${
                    isSelected
                      ? 'bg-sky-500/12 dark:bg-[#2b5278]/45'
                      : 'hover:bg-slate-50 dark:hover:bg-[#202b36]'
                  }`}
                >
                  <Avatar
                    name={displayTitle}
                    seed={item.peerUserId || item.chatId}
                    photoURL={displayPhoto}
                    type={item.type}
                    size="md"
                    isOnline={isOnline}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.type === 'channel' && (
                          <Megaphone className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        )}
                        {item.type === 'group' && (
                          <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {displayTitle}
                        </span>
                        {(item.type === 'direct' || item.type === 'saved') &&
                          chat?.autoDeleteSeconds &&
                          chat.autoDeleteSeconds > 0 && (
                            <span title="رسائل ذاتية التدمير مفعّلة" className="shrink-0">
                              <Timer className="w-3 h-3 text-sky-500" />
                            </span>
                          )}
                        {item.muted && (
                          <BellOff className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {formatChatListTime(lastAt)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {draftsByChatId?.[item.chatId] && !isSelected ? (
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">مسودة: </span>
                          {draftsByChatId[item.chatId]}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {lastSenderPrefix && (
                            <span className="text-sky-600 dark:text-sky-400 font-medium">
                              {lastSenderPrefix}
                            </span>
                          )}
                          {chat?.lastMessageText || 'لا توجد رسائل بعد'}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.pinned && (
                          <Pin className="w-3 h-3 text-slate-400 rotate-45" />
                        )}
                        {hasUnread && (
                          <span
                            aria-label="رسائل غير مقروءة"
                            className={`w-2.5 h-2.5 rounded-full ${
                              item.muted ? 'bg-slate-400' : 'bg-sky-500'
                            }`}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </button>

                {contextItemId === item.chatId && (
                  <div
                    ref={contextMenuRef}
                    className="animate-zeno-popover absolute end-3 top-11 z-30 w-52 bg-white dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onTogglePin(item);
                        setContextItemId(null);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>{item.pinned ? 'إلغاء التثبيت' : 'تثبيت في الأعلى'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleMute(item);
                        setContextItemId(null);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      <span>{item.muted ? 'تشغيل الإشعارات' : 'كتم الإشعارات'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleArchive(item);
                        setContextItemId(null);
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>{item.folder === 'archived' ? 'إلغاء الأرشفة' : 'نقل إلى الأرشيف'}</span>
                    </button>

                    {item.type === 'direct' && item.peerUserId && (onBlockUser || onUnblockUser) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const targetUid = item.peerUserId!;
                          setContextItemId(null);
                          if (isPeerBlocked) {
                            await onUnblockUser?.(targetUid);
                          } else {
                            await onBlockUser?.(targetUid);
                          }
                        }}
                        className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer ${
                          isPeerBlocked
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {isPeerBlocked ? (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Ban className="w-3.5 h-3.5" />
                        )}
                        <span>{isPeerBlocked ? 'إلغاء حظر المستخدم' : 'حظر المستخدم'}</span>
                      </button>
                    )}

                    {item.type === 'direct' && chat && onDeleteDirectChatForBoth && (
                      confirmDeleteChatId === item.chatId ? (
                        <div className="px-2.5 py-2 border-t border-slate-100 dark:border-slate-700/80 space-y-1.5">
                          <div className="text-[11px] font-medium text-red-600 dark:text-red-400">
                            حذف المحادثة بين الطرفين؟
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                setContextItemId(null);
                                setConfirmDeleteChatId(null);
                                await onDeleteDirectChatForBoth(chat, item.peerUserId);
                              }}
                              className="flex-1 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              تأكيد
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteChatId(null)}
                              className="flex-1 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteChatId(item.chatId)}
                          className="w-full px-3 py-2 flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border-t border-slate-100 dark:border-slate-700/80 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف بين الطرفين</span>
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="px-3.5 py-2 border-t border-slate-100 dark:border-slate-800/70 flex items-center justify-end shrink-0">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          التطبيق بإدارة المهندس أمير
        </span>
      </div>
    </section>
  );
};
