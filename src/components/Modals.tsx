import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Ban,
  Bell,
  BellRing,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Moon,
  Plus,
  QrCode,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { Chat, LightboxState, Message, PrivateUser, PublicUser, UserChatItem } from '../types/telegram';
import { Avatar } from './Avatar';
import { HighlightText } from './UserSearchHighlight';
import { formatAppErrorMessage } from '../lib/firebase';
import { compressAvatarToDataUrl, isUserOnline, triggerFileDownload } from '../lib/mediaUtils';
import {
  checkUsernameAvailability,
  findUserByExactUsername,
  normalizeUsernameInput,
} from '../lib/chatService';
import {
  AppNotificationPermission,
  getNotificationPermission,
  playNotificationChime,
  requestAppNotificationPermission,
  showAppNotification,
} from '../lib/notifications';
import { PWAInstallButton } from './PWAComponents';

function useEscapeKey(onClose: () => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}

interface NewChatModalProps {
  currentUser: PublicUser;
  allUsers: PublicUser[];
  initialTab?: 'direct' | 'group' | 'channel';
  blockedByMeIds?: Set<string>;
  onClose: () => void;
  onStartDirect: (peer: PublicUser) => Promise<void>;
  onCreateGroupOrChannel: (params: {
    type: 'group' | 'channel';
    title: string;
    description: string;
    isPublic: boolean;
    username?: string;
    photoURL?: string;
    members: PublicUser[];
  }) => Promise<void>;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  currentUser,
  allUsers,
  initialTab = 'direct',
  blockedByMeIds,
  onClose,
  onStartDirect,
  onCreateGroupOrChannel,
}) => {
  const [tab, setTab] = useState<'direct' | 'group' | 'channel'>(initialTab);
  const [search, setSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [username, setUsername] = useState('');
  const [groupPhotoURL, setGroupPhotoURL] = useState<string | undefined>(undefined);
  const [pickingGroupPhoto, setPickingGroupPhoto] = useState(false);
  const groupPhotoInputRef = useRef<HTMLInputElement>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [selectedUsersMap, setSelectedUsersMap] = useState<Record<string, PublicUser>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exactMatchUser, setExactMatchUser] = useState<PublicUser | null>(null);
  const [searchingExact, setSearchingExact] = useState(false);

  const [memberExactMatch, setMemberExactMatch] = useState<PublicUser | null>(null);
  const [searchingMemberExact, setSearchingMemberExact] = useState(false);

  useEscapeKey(onClose);

  const normalizedQuery = useMemo(() => normalizeUsernameInput(search), [search]);
  const normalizedMemberQuery = useMemo(() => normalizeUsernameInput(memberSearch), [memberSearch]);

  useEffect(() => {
    let cancelled = false;
    const canSearchUsername = normalizedQuery.length >= 3;

    if (tab !== 'direct' || !canSearchUsername) {
      setExactMatchUser(null);
      setSearchingExact(false);
      return;
    }

    const alreadyListed = allUsers.some(
      (u) => u.uid !== currentUser.uid && u.username.toLowerCase() === normalizedQuery
    );
    if (alreadyListed) {
      setExactMatchUser(null);
      setSearchingExact(false);
      return;
    }

    setSearchingExact(true);
    const timer = window.setTimeout(async () => {
      const found = await findUserByExactUsername(normalizedQuery);
      if (!cancelled) {
        setExactMatchUser(found && found.uid !== currentUser.uid ? found : null);
        setSearchingExact(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, search, normalizedQuery, allUsers, currentUser.uid]);

  useEffect(() => {
    let cancelled = false;
    const canSearchUsername = normalizedMemberQuery.length >= 3;

    if (tab === 'direct' || !canSearchUsername) {
      setMemberExactMatch(null);
      setSearchingMemberExact(false);
      return;
    }

    setSearchingMemberExact(true);
    const timer = window.setTimeout(async () => {
      const found = await findUserByExactUsername(normalizedMemberQuery);
      if (!cancelled) {
        setMemberExactMatch(found && found.uid !== currentUser.uid ? found : null);
        setSearchingMemberExact(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, memberSearch, normalizedMemberQuery, currentUser.uid]);

  const discoverableList = useMemo(
    () =>
      allUsers
        .filter((u) => u.uid !== currentUser.uid && u.isDiscoverable !== false)
        .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0)),
    [allUsers, currentUser.uid]
  );

  const directSearchResults = useMemo(() => {
    const rawQ = search.trim().toLowerCase();
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

    const filtered = pool.filter((u) => {
      if (u.uid === currentUser.uid) return false;
      if (exactMatchUser && u.uid === exactMatchUser.uid) return true;
      const nameMatch = u.displayName.toLowerCase().includes(rawQ);
      const userMatch = cleanQ ? u.username.toLowerCase().includes(cleanQ) : false;
      return nameMatch || userMatch;
    });

    return filtered.sort((a, b) => {
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
    });
  }, [allUsers, exactMatchUser, currentUser.uid, search]);

  const memberSearchResults = useMemo(() => {
    const rawQ = memberSearch.trim().toLowerCase();
    if (!rawQ) return [];
    const cleanQ = rawQ.replace(/^@+/, '');

    const pool = [...allUsers];
    if (
      memberExactMatch &&
      memberExactMatch.uid !== currentUser.uid &&
      !pool.some((u) => u.uid === memberExactMatch.uid)
    ) {
      pool.unshift(memberExactMatch);
    }

    return pool.filter((u) => {
      if (u.uid === currentUser.uid) return false;
      if (memberExactMatch && u.uid === memberExactMatch.uid) return true;
      return (
        u.displayName.toLowerCase().includes(rawQ) ||
        (cleanQ ? u.username.toLowerCase().includes(cleanQ) : false)
      );
    });
  }, [allUsers, memberExactMatch, currentUser.uid, memberSearch]);

  const selectedMembers = useMemo(
    () => Object.values(selectedUsersMap),
    [selectedUsersMap]
  );

  const toggleMember = (user: PublicUser) => {
    setSelectedUsersMap((prev) => {
      const next = { ...prev };
      if (next[user.uid]) {
        delete next[user.uid];
      } else {
        next[user.uid] = user;
      }
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || tab === 'direct') return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreateGroupOrChannel({
        type: tab,
        title: title.trim(),
        description: description.trim(),
        isPublic,
        username: username.trim() || undefined,
        photoURL: groupPhotoURL,
        members: selectedMembers,
      });
      onClose();
    } catch (err) {
      setError(formatAppErrorMessage(err, 'تعذر الإنشاء'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">بدء محادثة جديدة</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#242f3d]">
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'direct'
                  ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>محادثة خاصة</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('group')}
              className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'group'
                  ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>مجموعة</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('channel')}
              className={`py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                tab === 'channel'
                  ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Megaphone className="w-3.5 h-3.5" />
              <span>قناة</span>
            </button>
          </div>
        </div>

        {tab === 'direct' ? (
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالاسم أو اليوزر (@username)..."
                autoFocus
                className="w-full h-10 ps-9 pe-8 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="مسح البحث"
                  className="absolute top-1/2 -translate-y-1/2 end-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {search.trim() ? (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                <span>نتائج البحث ({directSearchResults.length})</span>
                {searchingExact && (
                  <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>جاري البحث...</span>
                  </span>
                )}
              </div>
            ) : discoverableList.length > 0 ? (
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
                <span>مستخدمو ZENO المتاحون ({discoverableList.length})</span>
              </div>
            ) : null}

            {error && (
              <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-600 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="max-h-72 overflow-y-auto slim-scroll space-y-1.5">
              {!search.trim() ? (
                discoverableList.length === 0 ? (
                  <div className="py-8 px-4 text-center space-y-1.5">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                      ابحث لبدء محادثة جديدة
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      أدخل الاسم أو اليوزر (<span dir="ltr">@username</span>) للوصول المباشر ومراسلة أي مستخدم على ZENO.
                    </p>
                  </div>
                ) : (
                  discoverableList.map((user) => {
                    const isBlocked = Boolean(blockedByMeIds?.has(user.uid));
                    const online = !isBlocked && isUserOnline(user.lastSeen);
                    return (
                      <button
                        key={user.uid}
                        type="button"
                        onClick={async () => {
                          setError(null);
                          try {
                            await onStartDirect(user);
                            onClose();
                          } catch (err) {
                            setError(formatAppErrorMessage(err, 'تعذر بدء المحادثة'));
                          }
                        }}
                        className="tap-press w-full px-3 py-2.5 rounded-xl flex items-center gap-3 bg-slate-50/70 dark:bg-[#202b36]/60 hover:bg-sky-50 dark:hover:bg-[#202b36] border border-transparent hover:border-sky-200 dark:hover:border-sky-800/60 text-start cursor-pointer"
                      >
                        <Avatar
                          name={user.displayName}
                          seed={user.uid}
                          photoURL={user.photoURL}
                          size="md"
                          isOnline={online}
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {user.displayName}
                            </span>
                            {isBlocked ? (
                              <span className="text-[10px] font-semibold text-red-500 shrink-0">
                                محظور
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-medium shrink-0 ${
                                  online
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-400 dark:text-slate-500'
                                }`}
                              >
                                {online ? 'متصل الآن' : 'ZENO'}
                              </span>
                            )}
                          </div>
                          {user.username && (
                            <div className="flex items-center gap-1.5" dir="ltr">
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-500/10 dark:bg-sky-400/15 text-xs font-mono text-sky-700 dark:text-sky-300 truncate">
                                @{user.username}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })
                )
              ) : directSearchResults.length === 0 && !searchingExact ? (
                <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                  لم يتم العثور على مستخدم مطابق. تأكد من كتابة الاسم أو اليوزر بشكل صحيح.
                </div>
              ) : (
                directSearchResults.map((user) => {
                  const isBlocked = Boolean(blockedByMeIds?.has(user.uid));
                  const online = !isBlocked && isUserOnline(user.lastSeen);
                  return (
                    <button
                      key={user.uid}
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try {
                          await onStartDirect(user);
                          onClose();
                        } catch (err) {
                          setError(formatAppErrorMessage(err, 'تعذر بدء المحادثة'));
                        }
                      }}
                      className="tap-press w-full px-3 py-2.5 rounded-xl flex items-center gap-3 bg-slate-50/70 dark:bg-[#202b36]/60 hover:bg-sky-50 dark:hover:bg-[#202b36] border border-transparent hover:border-sky-200 dark:hover:border-sky-800/60 text-start cursor-pointer"
                    >
                      <Avatar
                        name={user.displayName}
                        seed={user.uid}
                        photoURL={user.photoURL}
                        size="md"
                        isOnline={online}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <HighlightText
                            text={user.displayName}
                            query={search}
                            className="text-sm font-semibold text-slate-900 dark:text-white truncate"
                          />
                          {isBlocked ? (
                            <span className="text-[10px] font-semibold text-red-500 shrink-0">
                              محظور
                            </span>
                          ) : (
                            <span
                              className={`text-[10px] font-medium shrink-0 ${
                                online
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {online ? 'متصل الآن' : 'ZENO'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5" dir="ltr">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-sky-500/10 dark:bg-sky-400/15 text-xs font-mono text-sky-700 dark:text-sky-300 truncate">
                            <HighlightText
                              text={`@${user.username}`}
                              query={search}
                              stripAtFromQuery
                            />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-4 space-y-3.5 max-h-[75vh] overflow-y-auto slim-scroll">
            <div className="flex items-center gap-3.5">
              <input
                ref={groupPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setPickingGroupPhoto(true);
                  setError(null);
                  try {
                    const dataUrl = await compressAvatarToDataUrl(file);
                    setGroupPhotoURL(dataUrl);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'تعذر معالجة الصورة');
                  } finally {
                    setPickingGroupPhoto(false);
                  }
                }}
              />
              <button
                type="button"
                disabled={pickingGroupPhoto}
                onClick={() => groupPhotoInputRef.current?.click()}
                title={tab === 'channel' ? 'اختيار صورة القناة' : 'اختيار صورة المجموعة'}
                className="relative group shrink-0 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              >
                <Avatar
                  name={title.trim() || (tab === 'channel' ? 'قناة' : 'مجموعة')}
                  seed={tab}
                  photoURL={groupPhotoURL}
                  type={tab}
                  size="xl"
                />
                <span className="absolute bottom-0 end-0 w-6 h-6 rounded-full bg-sky-600 text-white ring-2 ring-white dark:ring-[#17212b] flex items-center justify-center shadow-sm">
                  {pickingGroupPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {tab === 'channel' ? 'صورة القناة (اختياري)' : 'صورة المجموعة (اختياري)'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pickingGroupPhoto}
                    onClick={() => groupPhotoInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/12 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 text-[11px] font-semibold cursor-pointer"
                  >
                    {groupPhotoURL ? 'تغيير الصورة' : 'اختيار صورة'}
                  </button>
                  {groupPhotoURL && (
                    <button
                      type="button"
                      onClick={() => setGroupPhotoURL(undefined)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 hover:text-red-500 text-[11px] font-medium cursor-pointer"
                    >
                      إزالة
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                {tab === 'channel' ? 'اسم القناة' : 'اسم المجموعة'}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={tab === 'channel' ? 'مثال: أخبار التقنية' : 'مثال: فريق التطوير'}
                className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                الوصف (اختياري)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="نبذة مختصرة..."
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="rounded accent-sky-600"
                />
                <span>عامة (يمكن لأي مستخدم الانضمام)</span>
              </label>
            </div>

            {isPublic && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  المعرّف العام (اختياري، أحرف إنجليزية وأرقام)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="tech_news"
                  className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                إضافة أعضاء بالبحث ({selectedMembers.length})
              </label>

              {selectedMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedMembers.map((m) => (
                    <button
                      key={m.uid}
                      type="button"
                      onClick={() => toggleMember(m)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300 text-xs font-medium cursor-pointer"
                    >
                      <span className="truncate max-w-[120px]">{m.displayName}</span>
                      <X className="w-3 h-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو اليوزر (@username)..."
                  className="w-full h-9 ps-8 pe-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {memberSearch.trim() && (
                <div className="max-h-32 overflow-y-auto slim-scroll space-y-1 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5">
                  {searchingMemberExact && memberSearchResults.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-slate-400">
                      جاري البحث...
                    </div>
                  ) : memberSearchResults.length === 0 ? (
                    <div className="py-3 text-center text-[11px] text-slate-400">
                      لم يتم العثور على مستخدم مطابق
                    </div>
                  ) : (
                    memberSearchResults.map((u) => {
                      const picked = Boolean(selectedUsersMap[u.uid]);
                      return (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => toggleMember(u)}
                          className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer ${
                            picked
                              ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                              : 'hover:bg-slate-100 dark:hover:bg-[#242f3d]'
                          }`}
                        >
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="truncate font-medium">{u.displayName}</span>
                            <span
                              dir="ltr"
                              className="text-[11px] font-mono text-sky-600 dark:text-sky-400 shrink-0"
                            >
                              @{u.username}
                            </span>
                          </div>
                          {picked && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {submitting ? 'جاري الإنشاء...' : tab === 'channel' ? 'إنشاء القناة' : 'إنشاء المجموعة'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

interface DiscoverModalProps {
  publicChats: Chat[];
  joinedChatIds: Set<string>;
  onClose: () => void;
  onJoinOrOpen: (chat: Chat) => Promise<void>;
}

export const DiscoverModal: React.FC<DiscoverModalProps> = ({
  publicChats,
  joinedChatIds,
  onClose,
  onJoinOrOpen,
}) => {
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEscapeKey(onClose);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return publicChats.filter((c) => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.username || '').toLowerCase().includes(q)
      );
    });
  }, [publicChats, search]);

  return (
    <div
      onClick={onClose}
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-sky-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              القنوات والمجموعات العامة
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن قناة أو مجموعة عامة..."
              className="w-full h-10 ps-9 pe-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="max-h-80 overflow-y-auto slim-scroll divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                لا توجد قنوات أو مجموعات عامة متاحة حالياً. أنشئ أول قناة عامة من زر "+"!
              </div>
            ) : (
              filtered.map((chat) => {
                const isJoined = joinedChatIds.has(chat.id);
                return (
                  <div key={chat.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={chat.title}
                        seed={chat.id}
                        photoURL={chat.photoURL}
                        type={chat.type}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {chat.title}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {chat.type === 'channel' ? 'قناة عامة' : 'مجموعة عامة'} ·{' '}
                          <span className="tabular-nums">{chat.memberCount}</span>{' '}
                          {chat.type === 'channel' ? 'مشترك' : 'عضو'}
                          {chat.username ? ` · @${chat.username}` : ''}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busyId === chat.id}
                      onClick={async () => {
                        setBusyId(chat.id);
                        try {
                          await onJoinOrOpen(chat);
                          onClose();
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className={`px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        isJoined
                          ? 'bg-slate-100 dark:bg-[#242f3d] text-slate-700 dark:text-slate-200 hover:bg-slate-200'
                          : 'bg-sky-600 hover:bg-sky-700 text-white'
                      }`}
                    >
                      {busyId === chat.id
                        ? 'جاري...'
                        : isJoined
                        ? 'فتح'
                        : chat.type === 'channel'
                        ? 'اشتراك'
                        : 'انضمام'}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PollModalProps {
  onClose: () => void;
  onCreatePoll: (question: string, options: string[]) => Promise<void>;
}

export const PollModal: React.FC<PollModalProps> = ({ onClose, onCreatePoll }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);

  useEscapeKey(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;
    setSubmitting(true);
    try {
      await onCreatePoll(question.trim(), cleanOptions);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">استطلاع رأي جديد</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              السؤال
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="اطرح سؤالاً على الأعضاء..."
              className="w-full h-10 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
              خيارات التصويت
            </label>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  required={idx < 2}
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[idx] = e.target.value;
                    setOptions(next);
                  }}
                  placeholder={`خيار ${idx + 1}`}
                  className="flex-1 h-9 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setOptions(options.filter((_, i) => i !== idx))}
                    className="p-1.5 text-slate-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {options.length < 8 && (
              <button
                type="button"
                onClick={() => setOptions([...options, ''])}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline pt-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة خيار</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !question.trim() || options.filter((o) => o.trim()).length < 2}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            {submitting ? 'جاري النشر...' : 'نشر الاستطلاع'}
          </button>
        </form>
      </div>
    </div>
  );
};

interface ForwardModalProps {
  message?: Message | null;
  messages?: Message[];
  chatItems: UserChatItem[];
  chatsById: Record<string, Chat>;
  onClose: () => void;
  onForwardTo: (targetChat: Chat) => Promise<void>;
}

export const ForwardModal: React.FC<ForwardModalProps> = ({
  messages,
  chatItems,
  chatsById,
  onClose,
  onForwardTo,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const count = messages?.length || 1;

  useEscapeKey(onClose);

  return (
    <div
      onClick={onClose}
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-sm bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {count > 1 ? `تحويل ${count} رسائل إلى...` : 'تحويل الرسالة إلى...'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 max-h-80 overflow-y-auto slim-scroll space-y-1">
          {chatItems.map((item) => {
            const chat = chatsById[item.chatId];
            if (!chat) return null;
            return (
              <button
                key={item.chatId}
                type="button"
                disabled={busyId === item.chatId}
                onClick={async () => {
                  setBusyId(item.chatId);
                  try {
                    await onForwardTo(chat);
                    onClose();
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-[#202b36] transition-colors text-start cursor-pointer"
              >
                <Avatar
                  name={chat.type === 'saved' ? 'الرسائل المحفوظة' : chat.title}
                  seed={chat.id}
                  photoURL={item.photoURL || chat.photoURL}
                  type={chat.type}
                  size="sm"
                />
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate flex-1">
                  {chat.type === 'saved' ? 'الرسائل المحفوظة' : chat.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  publicUser: PublicUser;
  privateUser: PrivateUser;
  blockedUsers?: PublicUser[];
  onUnblockUser?: (uid: string) => Promise<void>;
  onClose: () => void;
  onSaveProfile: (updates: { displayName: string; username: string; bio: string }) => Promise<void>;
  onUpdatePhoto: (photoDataUrl: string | null) => Promise<void>;
  onUpdatePrefs: (updates: Partial<Pick<PrivateUser, 'theme' | 'fontSize' | 'notificationsEnabled'>>) => Promise<void>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onOpenPrivacy: () => void;
  onOpenMyQR?: () => void;
  passcodeEnabled?: boolean;
  onOpenPasscodeSetup?: () => void;
  onLockApp?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  publicUser,
  privateUser,
  blockedUsers = [],
  onUnblockUser,
  onClose,
  onSaveProfile,
  onUpdatePhoto,
  onUpdatePrefs,
  onSignOut,
  onDeleteAccount,
  onOpenPrivacy,
  onOpenMyQR,
  passcodeEnabled = false,
  onOpenPasscodeSetup,
  onLockApp,
}) => {
  const [displayName, setDisplayName] = useState(publicUser.displayName);
  const [username, setUsername] = useState(publicUser.username);
  const [usernameStatus, setUsernameStatus] = useState<{
    state: 'idle' | 'checking' | 'own' | 'available' | 'unavailable' | 'invalid';
    message?: string;
  }>({ state: 'own', message: 'يوزرك المحمي الحالي' });
  const [bio, setBio] = useState(
    publicUser.bio === 'متاح على تبليغات هندسة النفط' || publicUser.bio === 'متاح على برقية'
      ? 'متاح على ZENO'
      : (publicUser.bio || '')
  );
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [unblockingUid, setUnblockingUid] = useState<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<AppNotificationPermission>(() => getNotificationPermission());
  const [notifTestMessage, setNotifTestMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUpdatingPhoto(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      const dataUrl = await compressAvatarToDataUrl(file);
      await onUpdatePhoto(dataUrl);
      setPhotoNotice('تم تحديث الصورة الشخصية بنجاح');
      window.setTimeout(() => setPhotoNotice(null), 2500);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'تعذر تحديث الصورة الشخصية');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setUpdatingPhoto(true);
    setPhotoError(null);
    setPhotoNotice(null);
    try {
      await onUpdatePhoto(null);
      setPhotoNotice('تمت إزالة الصورة الشخصية');
      window.setTimeout(() => setPhotoNotice(null), 2500);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'تعذر إزالة الصورة');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  useEffect(() => {
    const clean = normalizeUsernameInput(username);
    if (!clean || clean.length < 3) {
      setUsernameStatus({
        state: 'invalid',
        message: 'يجب أن يتكون من 3 إلى 32 حرفاً إنجليزياً أو رقماً أو _',
      });
      return;
    }
    if (clean === publicUser.username.toLowerCase()) {
      setUsernameStatus({ state: 'own', message: 'هذا هو يوزرك المحمي الحالي' });
      return;
    }

    let cancelled = false;
    setUsernameStatus({ state: 'checking', message: 'جاري التحقق من توفر اليوزر...' });
    const timer = window.setTimeout(async () => {
      try {
        const res = await checkUsernameAvailability(clean, publicUser.uid);
        if (cancelled) return;
        if (!res.valid) {
          setUsernameStatus({ state: 'invalid', message: res.reason });
        } else if (res.isOwn) {
          setUsernameStatus({ state: 'own', message: 'هذا هو يوزرك المحمي الحالي' });
        } else if (res.available) {
          setUsernameStatus({ state: 'available', message: 'متاح للحجز — سيكون خاصاً بك وحدك' });
        } else {
          setUsernameStatus({ state: 'unavailable', message: res.reason || 'هذا اليوزر محجوز لمستخدم آخر' });
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus({ state: 'idle' });
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [username, publicUser.username, publicUser.uid]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usernameStatus.state === 'unavailable' || usernameStatus.state === 'invalid') {
      setError(usernameStatus.message || 'يرجى اختيار يوزر صالح ومتاح');
      return;
    }
    setSaving(true);
    setError(null);
    setSavedNotice(false);
    try {
      await onSaveProfile({ displayName, username, bio });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      setError(formatAppErrorMessage(err, 'تعذر حفظ الملف الشخصي'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">الإعدادات والملف الشخصي</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-[80vh] overflow-y-auto slim-scroll space-y-6">
          <div className="space-y-2.5">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoFileChange}
              className="hidden"
            />
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                disabled={updatingPhoto}
                onClick={() => photoInputRef.current?.click()}
                title="تغيير الصورة الشخصية"
                className="relative shrink-0 rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              >
                <Avatar
                  name={publicUser.displayName}
                  seed={publicUser.uid}
                  photoURL={publicUser.photoURL}
                  size="xl"
                />
                <span className="absolute bottom-0 end-0 w-6 h-6 rounded-full bg-sky-600 text-white ring-2 ring-white dark:ring-[#17212b] flex items-center justify-center shadow-sm">
                  {updatingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {publicUser.displayName}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-sky-600 dark:text-sky-400" dir="ltr">
                    @{publicUser.username}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <Lock className="w-3 h-3" />
                    <span>محمي</span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <button
                    type="button"
                    disabled={updatingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    className="min-h-[34px] px-3 py-1 rounded-xl bg-sky-500/12 hover:bg-sky-500/20 disabled:opacity-50 text-sky-600 dark:text-sky-400 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>
                      {updatingPhoto
                        ? 'جاري التحديث...'
                        : publicUser.photoURL
                        ? 'تغيير الصورة'
                        : 'إضافة صورة'}
                    </span>
                  </button>
                  {publicUser.photoURL && (
                    <button
                      type="button"
                      disabled={updatingPhoto}
                      onClick={handleRemovePhoto}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>إزالة الصورة</span>
                    </button>
                  )}
                  {onOpenMyQR && (
                    <button
                      type="button"
                      onClick={onOpenMyQR}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-600 dark:text-sky-400 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>رمز QR</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            {photoError && <p className="text-xs text-red-500">{photoError}</p>}
            {photoNotice && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{photoNotice}</p>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                الاسم الظاهر
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  اليوزر الخاص بك (@username)
                </label>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3 h-3" />
                  <span>حماية حصرية</span>
                </span>
              </div>
              <div className="relative" dir="ltr">
                <AtSign className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 left-3 pointer-events-none" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
                  placeholder="your_username"
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                {usernameStatus.state === 'checking' && (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-sky-500 shrink-0" />
                    <span className="text-sky-600 dark:text-sky-400">{usernameStatus.message}</span>
                  </>
                )}
                {usernameStatus.state === 'available' && (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-emerald-600 dark:text-emerald-400">{usernameStatus.message}</span>
                  </>
                )}
                {usernameStatus.state === 'own' && (
                  <>
                    <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-slate-500 dark:text-slate-400">{usernameStatus.message}</span>
                  </>
                )}
                {(usernameStatus.state === 'unavailable' || usernameStatus.state === 'invalid') && (
                  <span className="text-red-500">{usernameStatus.message}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                يوزرك محمي ومخصص لك وحدك، ويمكن للآخرين البحث عنك والعثور عليك بكتابته.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                النبذة التعريفية
              </label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="متاح على ZENO"
                className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
            {savedNotice && <p className="text-xs text-emerald-600 dark:text-emerald-400">تم حفظ التغييرات واليوزر بنجاح</p>}

            <button
              type="submit"
              disabled={
                saving ||
                usernameStatus.state === 'checking' ||
                usernameStatus.state === 'unavailable' ||
                usernameStatus.state === 'invalid'
              }
              className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ الملف الشخصي'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">المظهر</span>
              <button
                type="button"
                onClick={() =>
                  onUpdatePrefs({ theme: privateUser.theme === 'dark' ? 'light' : 'dark' })
                }
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {privateUser.theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>نهاري</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-sky-600" />
                    <span>ليلي</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">حجم خط الرسائل</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-[#242f3d]">
                {(['small', 'medium', 'large'] as const).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => onUpdatePrefs({ fontSize: sz })}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                      privateUser.fontSize === sz
                        ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {sz === 'small' ? 'صغير' : sz === 'medium' ? 'متوسط' : 'كبير'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Bell className="w-4 h-4 text-sky-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      الإشعارات وأصوات التنبيه
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {notifPerm === 'granted'
                        ? 'صلاحية النظام: مسموح بها'
                        : notifPerm === 'denied'
                        ? 'صلاحية النظام: محظورة من إعدادات الجهاز'
                        : notifPerm === 'unsupported'
                        ? 'المتصفح الحالي لا يدعم إشعارات النظام'
                        : 'صلاحية النظام: بانتظار السماح'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const nextEnabled = !privateUser.notificationsEnabled;
                    await onUpdatePrefs({ notificationsEnabled: nextEnabled });
                    if (nextEnabled) {
                      const perm = await requestAppNotificationPermission();
                      setNotifPerm(perm);
                    }
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer shrink-0 ${
                    privateUser.notificationsEnabled
                      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                      : 'bg-slate-200/70 dark:bg-[#242f3d] text-slate-500'
                  }`}
                >
                  {privateUser.notificationsEnabled ? 'مفعّلة' : 'معطّلة'}
                </button>
              </div>

              {privateUser.notificationsEnabled && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {notifPerm === 'default' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const perm = await requestAppNotificationPermission();
                        setNotifPerm(perm);
                        if (perm === 'granted') {
                          setNotifTestMessage('تم تفعيل إذن الإشعارات بنجاح');
                        }
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>السماح بإشعارات الجهاز</span>
                    </button>
                  )}

                  {notifPerm === 'granted' && (
                    <button
                      type="button"
                      onClick={async () => {
                        playNotificationChime();
                        const ok = await showAppNotification({
                          title: 'ZENO',
                          body: 'إشعار تجريبي — التنبيهات تعمل بنجاح على جهازك!',
                        });
                        setNotifTestMessage(
                          ok ? 'تم إرسال إشعار تجريبي إلى شريط الإشعارات' : 'تعذر عرض الإشعار'
                        );
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <BellRing className="w-3.5 h-3.5 text-sky-500" />
                      <span>اختبار الإشعار</span>
                    </button>
                  )}

                  {notifPerm === 'denied' && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                      لتشغيل الإشعارات، افتح إعدادات التطبيق في Android أو المتصفح وفعّل الإشعارات لـ ZENO.
                    </p>
                  )}
                </div>
              )}

              {notifTestMessage && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {notifTestMessage}
                </p>
              )}
            </div>

            {onOpenPasscodeSetup && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        قفل التطبيق برمز سري (PIN)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {passcodeEnabled ? 'مفعّل — يحمي حسابك على هذا الجهاز' : 'غير مفعّل'}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      passcodeEnabled
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-200/70 dark:bg-[#242f3d] text-slate-500'
                    }`}
                  >
                    {passcodeEnabled ? 'مفعّل' : 'متوقف'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onOpenPasscodeSetup}
                    className="flex-1 py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {passcodeEnabled ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>{passcodeEnabled ? 'تعديل / إلغاء الرمز' : 'تعيين رمز سري'}</span>
                  </button>
                  {passcodeEnabled && onLockApp && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLockApp();
                      }}
                      className="py-2 px-3 rounded-xl bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-sky-500" />
                      <span>قفل الآن</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Blocked Users Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <Ban className="w-3.5 h-3.5 text-red-500" />
                <span>المستخدمون المحظورون</span>
              </span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {blockedUsers.length}
              </span>
            </div>

            {blockedUsers.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                لا يوجد مستخدمون محظورون حالياً.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto slim-scroll space-y-1.5">
                {blockedUsers.map((bu) => (
                  <div
                    key={bu.uid}
                    className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-[#202b36]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        name={bu.displayName}
                        seed={bu.uid}
                        photoURL={bu.photoURL}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {bu.displayName}
                        </div>
                        {bu.username && (
                          <div className="text-[10px] font-mono text-slate-400 truncate" dir="ltr">
                            @{bu.username}
                          </div>
                        )}
                      </div>
                    </div>
                    {onUnblockUser && (
                      <button
                        type="button"
                        disabled={unblockingUid === bu.uid}
                        onClick={async () => {
                          setUnblockingUid(bu.uid);
                          try {
                            await onUnblockUser(bu.uid);
                          } finally {
                            setUnblockingUid(null);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0 cursor-pointer"
                      >
                        {unblockingUid === bu.uid ? '...' : 'إلغاء الحظر'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <PWAInstallButton variant="card" />

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <button
              type="button"
              onClick={onOpenPrivacy}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-sky-500" />
              <span>سياسة الخصوصية وشروط الاستخدام</span>
            </button>

            <button
              type="button"
              disabled={signingOut || deletingAccount}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await onSignOut();
                } finally {
                  setSigningOut(false);
                }
              }}
              className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {signingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogOut className="w-4 h-4" />
              )}
              <span>{signingOut ? 'جاري تسجيل الخروج...' : 'تسجيل الخروج'}</span>
            </button>

            {!confirmDeleteAccount ? (
              <button
                type="button"
                disabled={signingOut || deletingAccount}
                onClick={() => {
                  setDeleteAccountError(null);
                  setConfirmDeleteAccount(true);
                }}
                className="w-full py-2 rounded-xl flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف الحساب نهائياً</span>
              </button>
            ) : (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-2 text-center">
                <p className="text-[11px] text-red-700 dark:text-red-300 leading-relaxed">
                  سيتم حذف بيانات ملفك الشخصي وإعداداتك والرسائل المحفوظة نهائياً. هل تريد المتابعة؟
                </p>
                {deleteAccountError && (
                  <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                    {deleteAccountError}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={async () => {
                      setDeletingAccount(true);
                      setDeleteAccountError(null);
                      try {
                        await onDeleteAccount();
                      } catch (err) {
                        setDeleteAccountError(
                          err instanceof Error ? err.message : 'تعذر حذف الحساب، يرجى المحاولة مرة أخرى'
                        );
                      } finally {
                        setDeletingAccount(false);
                      }
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {deletingAccount ? 'جاري الحذف...' : 'تأكيد الحذف'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={() => {
                      setDeleteAccountError(null);
                      setConfirmDeleteAccount(false);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-50 text-xs font-medium cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface PrivacyModalProps {
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  useEscapeKey(onClose);

  return (
    <div
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-sky-500" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              سياسة الخصوصية وشروط الاستخدام
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 max-h-[70vh] overflow-y-auto slim-scroll space-y-3.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            يلتزم تطبيق <strong>ZENO</strong> بحماية خصوصية المستخدمين وعزل بياناتهم الشخصية.
          </p>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">1. البيانات المستخدمة</h4>
            <p>
              يتم استخدام الاسم الظاهر، اسم المستخدم، والصورة الشخصية لإظهار هويتك في المحادثات والمجموعات، بينما يُحفظ رقم الهاتف وإعدادات المظهر في سجل خاص لصاحب الحساب فقط.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">2. الرسائل والمرفقات</h4>
            <p>
              تُخزَّن الرسائل والملفات والوسائط ضمن محادثاتك المعتمدة فقط، ولا يُسمح لغير أعضاء المحادثة أو القناة بالوصول إليها.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">3. الأذونات الاختيارية</h4>
            <p>
              يُطلب إذن الميكروفون فقط عند اختيار تسجيل رسالة صوتية، ويمكنك رفضه أو إلغاؤه في أي وقت من إعدادات جهازك.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-white mb-1">4. حذف الحساب</h4>
            <p>
              يمكنك حذف حسابك وبياناتك الشخصية في أي وقت مباشرة من داخل الإعدادات عبر خيار «حذف الحساب نهائياً».
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

interface ImageLightboxProps {
  gallery: LightboxState;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ gallery, onClose }) => {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.min(Math.max(0, gallery.index), Math.max(0, gallery.images.length - 1))
  );
  const images = gallery.images;
  const total = images.length;
  const current = images[activeIndex] || images[0];

  useEffect(() => {
    setActiveIndex(Math.min(Math.max(0, gallery.index), Math.max(0, gallery.images.length - 1)));
  }, [gallery]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (total > 1 && e.key === 'ArrowLeft') {
        setActiveIndex((prev) => (prev + 1) % total);
      } else if (total > 1 && e.key === 'ArrowRight') {
        setActiveIndex((prev) => (prev - 1 + total) % total);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, total]);

  if (!current) return null;

  return (
    <div
      onClick={onClose}
      dir="rtl"
      className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/92 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 select-none"
    >
      {/* Top Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between gap-3 z-10"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق الصورة"
            className="tap-press min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => triggerFileDownload(current.src, `zeno_image_${activeIndex + 1}.jpg`)}
            aria-label="تنزيل الصورة"
            title="تنزيل الصورة"
            className="tap-press min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>

        {total > 1 && (
          <div className="text-xs sm:text-sm font-semibold text-white/90 tabular-nums">
            {activeIndex + 1} / {total}
          </div>
        )}
      </div>

      {/* Main Image Viewport */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center my-2">
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((prev) => (prev - 1 + total) % total);
            }}
            aria-label="الصورة السابقة"
            className="tap-press absolute start-1 sm:start-3 z-10 min-w-[44px] min-h-[44px] rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        <img
          src={current.src}
          alt={current.caption || 'معاينة الصورة'}
          referrerPolicy="no-referrer"
          onClick={(e) => e.stopPropagation()}
          className="animate-zeno-modal max-w-full max-h-[74vh] rounded-2xl object-contain shadow-2xl"
        />

        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((prev) => (prev + 1) % total);
            }}
            aria-label="الصورة التالية"
            className="tap-press absolute end-1 sm:end-3 z-10 min-w-[44px] min-h-[44px] rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Caption & Thumbnail Strip */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-2.5 z-10"
      >
        {current.caption && (
          <p className="max-w-xl px-4 py-2 rounded-xl bg-black/55 backdrop-blur-md text-white text-xs sm:text-sm text-center leading-relaxed">
            {current.caption}
          </p>
        )}
        {total > 1 && (
          <div className="max-w-full overflow-x-auto slim-scroll flex items-center gap-1.5 px-2 py-1">
            {images.map((item, idx) => (
              <button
                key={`${idx}-${item.src.slice(0, 24)}`}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`عرض الصورة ${idx + 1}`}
                className={`w-12 h-12 rounded-lg overflow-hidden shrink-0 transition-all cursor-pointer ${
                  idx === activeIndex
                    ? 'ring-2 ring-sky-400 scale-105 opacity-100'
                    : 'opacity-55 hover:opacity-90'
                }`}
              >
                <img
                  src={item.src}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
