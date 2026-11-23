import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Ban,
  Bell,
  BellOff,
  Camera,
  Check,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  Music,
  Pin,
  QrCode,
  RefreshCw,
  Shield,
  ShieldCheck,
  Timer,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { Chat, ChatMember, LightboxState, Message, PublicUser, UserChatItem } from '../types/telegram';
import {
  findUserByExactUsername,
  getMessageDownloadUrl,
  normalizeUsernameInput,
} from '../lib/chatService';
import { extractUrlsFromText } from '../lib/searchUtils';
import { formatAppErrorMessage } from '../lib/firebase';
import { HighlightText } from './UserSearchHighlight';
import {
  AUTO_DELETE_PRESETS,
  compressAvatarToDataUrl,
  formatAudioDuration,
  formatAutoDeleteLabel,
  formatFileSize,
  formatLastSeen,
  isUserOnline,
  triggerFileDownload,
} from '../lib/mediaUtils';
import { Avatar } from './Avatar';

interface ChatInfoDrawerProps {
  chat: Chat;
  chatItem: UserChatItem | null;
  currentUser: PublicUser;
  peerUser?: PublicUser;
  members: ChatMember[];
  allUsers: PublicUser[];
  messages: Message[];
  onClose: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onToggleArchive?: () => Promise<void> | void;
  onUpdateChatDetails: (updates: { title: string; description: string; isPublic: boolean }) => Promise<void>;
  onUpdateChatPhoto?: (photoDataUrl: string | null) => Promise<void>;
  onAddMember: (user: PublicUser) => Promise<void>;
  onToggleAdmin: (member: ChatMember) => Promise<void>;
  onRemoveMember: (member: ChatMember) => Promise<void>;
  onLeaveChat: () => Promise<void>;
  onOpenImage: (src: string, gallery?: LightboxState) => void;
  isBlockedByMe?: boolean;
  isBlockedByPeer?: boolean;
  onBlockUser?: (uid: string) => Promise<void>;
  onUnblockUser?: (uid: string) => Promise<void>;
  onDeleteChatForBoth?: () => Promise<void>;
  onUpdateAutoDeleteTimer?: (seconds: number) => Promise<void>;
  onCreateOrRegenerateInvite?: () => Promise<string>;
  onRevokeInvite?: () => Promise<void>;
  onOpenInviteQR?: (inviteUrl: string, title: string) => void;
  onUpdateAdvancedSettings?: (updates: {
    slowModeSeconds?: number;
    protectContent?: boolean;
    allowComments?: boolean;
  }) => Promise<void>;
}

export const ChatInfoDrawer: React.FC<ChatInfoDrawerProps> = ({
  chat,
  chatItem,
  currentUser,
  peerUser,
  members,
  allUsers,
  messages,
  onClose,
  onToggleMute,
  onTogglePin,
  onToggleArchive,
  onUpdateChatDetails,
  onUpdateChatPhoto,
  onAddMember,
  onToggleAdmin,
  onRemoveMember,
  onLeaveChat,
  onOpenImage,
  isBlockedByMe = false,
  isBlockedByPeer = false,
  onBlockUser,
  onUnblockUser,
  onDeleteChatForBoth,
  onUpdateAutoDeleteTimer,
  onCreateOrRegenerateInvite,
  onRevokeInvite,
  onOpenInviteQR,
  onUpdateAdvancedSettings,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(chat.title);
  const [editDesc, setEditDesc] = useState(chat.description || '');
  const [editPublic, setEditPublic] = useState(chat.isPublic);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberExactMatch, setMemberExactMatch] = useState<PublicUser | null>(null);
  const [searchingMemberExact, setSearchingMemberExact] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [showTimerPicker, setShowTimerPicker] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sharedTab, setSharedTab] = useState<'media' | 'files' | 'links' | 'audio'>('media');
  const [copiedSharedUrl, setCopiedSharedUrl] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [advBusy, setAdvBusy] = useState(false);
  const chatPhotoInputRef = useRef<HTMLInputElement>(null);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmLeave(false);
    setConfirmBlock(false);
    setShowTimerPicker(false);
    setActionBusy(false);
    setUpdatingPhoto(false);
    setPhotoError(null);
    setSharedTab('media');
    setCopiedSharedUrl(null);
  }, [chat.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const isOwner = chat.ownerId === currentUser.uid;
  const myMember = members.find((m) => m.uid === currentUser.uid);
  const isAdminOrOwner = isOwner || myMember?.role === 'admin';

  const mediaMessages = useMemo(
    () => messages.filter((m) => !m.isDeleted && m.type === 'image' && (m.mediaUrl || m.mediaDataUrl)),
    [messages]
  );

  const fileMessages = useMemo(
    () =>
      messages.filter(
        (m) => !m.isDeleted && m.type === 'file' && (m.mediaDataUrl || m.mediaUrl || m.mediaChunkCount)
      ),
    [messages]
  );

  const audioMessages = useMemo(
    () =>
      messages.filter(
        (m) => !m.isDeleted && m.type === 'audio' && (m.mediaDataUrl || m.mediaUrl || m.mediaChunkCount)
      ),
    [messages]
  );

  const sharedLinks = useMemo(() => {
    const list: { id: string; url: string; host: string; senderName: string; createdAt: number }[] = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.isDeleted || !m.text) continue;
      const urls = extractUrlsFromText(m.text);
      for (let uIdx = 0; uIdx < urls.length; uIdx += 1) {
        const raw = urls[uIdx];
        const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        let host = raw;
        try {
          host = new URL(href).hostname.replace(/^www\./i, '');
        } catch {
          // Keep raw fallback
        }
        list.push({
          id: `${m.id}_${uIdx}`,
          url: href,
          host,
          senderName: m.senderName,
          createdAt: m.createdAt,
        });
      }
    }
    return list;
  }, [messages]);

  const normalizedMemberUsername = useMemo(() => normalizeUsernameInput(memberSearch), [memberSearch]);

  useEffect(() => {
    let cancelled = false;
    const canSearchUser = normalizedMemberUsername.length >= 3;

    if (!showAddMember || !canSearchUser) {
      setMemberExactMatch(null);
      setSearchingMemberExact(false);
      return;
    }

    setSearchingMemberExact(true);
    const timer = window.setTimeout(async () => {
      const found = await findUserByExactUsername(normalizedMemberUsername);
      if (!cancelled) {
        setMemberExactMatch(found);
        setSearchingMemberExact(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showAddMember, memberSearch, normalizedMemberUsername]);

  const addableUsers = useMemo(() => {
    const rawQ = memberSearch.trim().toLowerCase();
    if (!rawQ) return [];
    const memberIds = new Set(members.map((m) => m.uid));
    const cleanQ = rawQ.replace(/^@+/, '');

    const pool = [...allUsers];
    if (memberExactMatch && !pool.some((u) => u.uid === memberExactMatch.uid)) {
      pool.unshift(memberExactMatch);
    }

    return pool.filter((u) => {
      if (memberIds.has(u.uid)) return false;
      if (memberExactMatch && u.uid === memberExactMatch.uid) return true;
      return (
        u.displayName.toLowerCase().includes(rawQ) ||
        (cleanQ ? u.username.toLowerCase().includes(cleanQ) : false)
      );
    });
  }, [allUsers, members, memberSearch, memberExactMatch]);

  const displayTitle =
    chat.type === 'saved'
      ? 'الرسائل المحفوظة'
      : peerUser?.displayName || chat.title;
  const displayPhoto = peerUser?.photoURL || chat.photoURL;

  const handleSaveDetails = async () => {
    if (!editTitle.trim()) return;
    await onUpdateChatDetails({
      title: editTitle.trim(),
      description: editDesc.trim(),
      isPublic: editPublic,
    });
    setIsEditing(false);
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className="animate-zeno-fade fixed inset-0 bg-slate-950/35 backdrop-blur-[1px] z-20 sm:hidden"
      />
      <aside className="animate-zeno-drawer gpu-layer w-full max-w-[340px] sm:w-[320px] shrink-0 h-full bg-white/95 dark:bg-[#17212b]/95 backdrop-blur-md border-s border-slate-200 dark:border-slate-800/80 flex flex-col z-30 fixed inset-y-0 end-0 sm:static shadow-2xl sm:shadow-none">
        <div className="h-16 px-4 bg-white/85 dark:bg-[#17212b]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {chat.type === 'direct'
              ? 'معلومات جهة الاتصال'
              : chat.type === 'channel'
              ? 'معلومات القناة'
              : chat.type === 'saved'
              ? 'الرسائل المحفوظة'
              : 'معلومات المجموعة'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="tap-press min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      <div className="flex-1 overflow-y-auto slim-scroll divide-y divide-slate-100 dark:divide-slate-800/70">
        {/* Profile Header */}
        <div className="p-5 flex flex-col items-center text-center">
          {isAdminOrOwner && (chat.type === 'group' || chat.type === 'channel') && onUpdateChatPhoto ? (
            <>
              <input
                ref={chatPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setUpdatingPhoto(true);
                  setPhotoError(null);
                  try {
                    const dataUrl = await compressAvatarToDataUrl(file);
                    await onUpdateChatPhoto(dataUrl);
                  } catch (err) {
                    setPhotoError(formatAppErrorMessage(err, 'تعذر تحديث الصورة'));
                  } finally {
                    setUpdatingPhoto(false);
                  }
                }}
              />
              <button
                type="button"
                disabled={updatingPhoto}
                onClick={() => chatPhotoInputRef.current?.click()}
                title={chat.type === 'channel' ? 'تغيير صورة القناة' : 'تغيير صورة المجموعة'}
                className="relative rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:opacity-60"
              >
                <Avatar
                  name={displayTitle}
                  seed={peerUser?.uid || chat.id}
                  photoURL={displayPhoto}
                  type={chat.type}
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
            </>
          ) : displayPhoto ? (
            <button
              type="button"
              onClick={() => onOpenImage(displayPhoto)}
              className="rounded-full cursor-pointer"
            >
              <Avatar
                name={displayTitle}
                seed={peerUser?.uid || chat.id}
                photoURL={displayPhoto}
                type={chat.type}
                size="xl"
                isOnline={peerUser && !isBlockedByMe && !isBlockedByPeer ? isUserOnline(peerUser.lastSeen) : false}
              />
            </button>
          ) : (
            <Avatar
              name={displayTitle}
              seed={peerUser?.uid || chat.id}
              photoURL={displayPhoto}
              type={chat.type}
              size="xl"
              isOnline={peerUser && !isBlockedByMe && !isBlockedByPeer ? isUserOnline(peerUser.lastSeen) : false}
            />
          )}
          <h4 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
            {displayTitle}
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {chat.type === 'direct'
              ? isBlockedByMe
                ? 'مستخدم محظور'
                : isBlockedByPeer
                ? 'لا يمكن المراسلة'
                : formatLastSeen(peerUser?.lastSeen)
              : chat.type === 'channel'
              ? `${chat.memberCount.toLocaleString('ar-EG')} مشترك`
              : chat.type === 'saved'
              ? 'مساحة تخزين سحابية خاصة'
              : `${chat.memberCount.toLocaleString('ar-EG')} عضو`}
          </p>

          {(peerUser?.username || ((chat.type === 'group' || chat.type === 'channel') && chat.username)) && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-sky-500/10 dark:bg-sky-400/15 text-xs font-mono text-sky-700 dark:text-sky-300" dir="ltr">
              <span>@{peerUser?.username || chat.username}</span>
              {peerUser?.username && <Lock className="w-3 h-3 text-emerald-500 shrink-0" />}
            </div>
          )}

          {(peerUser?.bio || chat.description) && !isEditing && (
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {peerUser?.bio === 'متاح على تبليغات هندسة النفط' || peerUser?.bio === 'متاح على برقية'
                ? 'متاح على ZENO'
                : peerUser?.bio || chat.description}
            </p>
          )}

          {photoError && (
            <p className="mt-2 text-xs text-red-500">{photoError}</p>
          )}

          {isAdminOrOwner && (chat.type === 'group' || chat.type === 'channel') && !isEditing && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {onUpdateChatPhoto && (
                <button
                  type="button"
                  disabled={updatingPhoto}
                  onClick={() => chatPhotoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 text-xs font-medium text-sky-600 dark:text-sky-400 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{updatingPhoto ? 'جاري...' : chat.photoURL ? 'تغيير الصورة' : 'إضافة صورة'}</span>
                </button>
              )}
              {onUpdateChatPhoto && chat.photoURL && (
                <button
                  type="button"
                  disabled={updatingPhoto}
                  onClick={async () => {
                    setUpdatingPhoto(true);
                    setPhotoError(null);
                    try {
                      await onUpdateChatPhoto(null);
                    } catch (err) {
                      setPhotoError(formatAppErrorMessage(err, 'تعذر إزالة الصورة'));
                    } finally {
                      setUpdatingPhoto(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#242f3d] hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-500 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>إزالة الصورة</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditTitle(chat.title);
                  setEditDesc(chat.description || '');
                  setEditPublic(chat.isPublic);
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل التفاصيل</span>
              </button>
            </div>
          )}

          {isEditing && (
            <div className="w-full mt-4 space-y-2.5 text-start">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="الاسم"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs text-slate-900 dark:text-white focus:outline-none"
              />
              <textarea
                rows={2}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                placeholder="الوصف"
                className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-xs text-slate-900 dark:text-white resize-none focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPublic}
                  onChange={(e) => setEditPublic(e.target.checked)}
                  className="rounded accent-sky-600"
                />
                <span>عامة (قابلة للاكتشاف والانضمام)</span>
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium cursor-pointer"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 text-xs font-medium cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        {chatItem && (
          <div className="p-3 space-y-1">
            <button
              type="button"
              onClick={onToggleMute}
              className="tap-press w-full px-3 min-h-[44px] py-2.5 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202b36] cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                {chatItem.muted ? <BellOff className="w-4 h-4 text-slate-400" /> : <Bell className="w-4 h-4 text-sky-500" />}
                <span>الإشعارات</span>
              </span>
              <span className="text-slate-400">{chatItem.muted ? 'مكتومة' : 'مفعّلة'}</span>
            </button>

            <button
              type="button"
              onClick={onTogglePin}
              className="tap-press w-full px-3 min-h-[44px] py-2.5 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202b36] cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Pin className="w-4 h-4 text-sky-500" />
                <span>تثبيت المحادثة</span>
              </span>
              <span className="text-slate-400">{chatItem.pinned ? 'مثبتة' : 'غير مثبتة'}</span>
            </button>

            {onToggleArchive && (
              <button
                type="button"
                disabled={archiveBusy}
                onClick={async () => {
                  setArchiveBusy(true);
                  try {
                    await onToggleArchive();
                  } finally {
                    setArchiveBusy(false);
                  }
                }}
                className={`tap-press w-full px-3 min-h-[44px] py-2.5 rounded-xl flex items-center justify-between text-xs font-medium transition-colors cursor-pointer disabled:opacity-60 ${
                  chatItem.folder === 'archived'
                    ? 'text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202b36]'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  {archiveBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
                  ) : chatItem.folder === 'archived' ? (
                    <ArchiveRestore className="w-4 h-4 text-amber-500" />
                  ) : (
                    <Archive className="w-4 h-4 text-sky-500" />
                  )}
                  <span>
                    {chatItem.folder === 'archived' ? 'إلغاء الأرشفة' : 'نقل إلى الأرشيف'}
                  </span>
                </span>
                <span
                  className={
                    chatItem.folder === 'archived'
                      ? 'text-amber-600 dark:text-amber-400 font-semibold'
                      : 'text-slate-400'
                  }
                >
                  {chatItem.folder === 'archived' ? 'مؤرشفة' : 'غير مؤرشفة'}
                </span>
              </button>
            )}

            {(chat.type === 'direct' || chat.type === 'saved') &&
              !isBlockedByMe &&
              !isBlockedByPeer &&
              onUpdateAutoDeleteTimer && (
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setShowTimerPicker((v) => !v)}
                    className="tap-press w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#202b36] cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5">
                      <Timer
                        className={`w-4 h-4 ${
                          chat.autoDeleteSeconds && chat.autoDeleteSeconds > 0
                            ? 'text-sky-500'
                            : 'text-slate-400'
                        }`}
                      />
                      <span>الرسائل ذاتية التدمير</span>
                    </span>
                    <span
                      className={
                        chat.autoDeleteSeconds && chat.autoDeleteSeconds > 0
                          ? 'text-sky-600 dark:text-sky-400 font-semibold'
                          : 'text-slate-400'
                      }
                    >
                      {formatAutoDeleteLabel(chat.autoDeleteSeconds)}
                    </span>
                  </button>

                  {showTimerPicker && (
                    <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 grid grid-cols-2 gap-1.5">
                      {AUTO_DELETE_PRESETS.map((preset) => {
                        const isActive = (chat.autoDeleteSeconds || 0) === preset.seconds;
                        return (
                          <button
                            key={preset.seconds}
                            type="button"
                            disabled={actionBusy}
                            onClick={async () => {
                              if (isActive) {
                                setShowTimerPicker(false);
                                return;
                              }
                              setActionBusy(true);
                              try {
                                await onUpdateAutoDeleteTimer(preset.seconds);
                                setShowTimerPicker(false);
                              } finally {
                                setActionBusy(false);
                              }
                            }}
                            className={`px-2.5 py-2 rounded-lg text-[11px] font-medium text-center transition-colors cursor-pointer disabled:opacity-50 ${
                              isActive
                                ? 'bg-sky-600 text-white font-semibold'
                                : 'bg-white dark:bg-[#17212b] text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700/60'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            {chat.type === 'direct' && peerUser && (onBlockUser || onUnblockUser) && (
              isBlockedByMe ? (
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={async () => {
                    if (!onUnblockUser) return;
                    setActionBusy(true);
                    try {
                      await onUnblockUser(peerUser.uid);
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                  className="tap-press w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>إلغاء حظر المستخدم</span>
                  </span>
                  <span className="text-[11px]">محظور</span>
                </button>
              ) : !confirmBlock ? (
                <button
                  type="button"
                  onClick={() => setConfirmBlock(true)}
                  className="tap-press w-full px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <Ban className="w-4 h-4" />
                    <span>حظر المستخدم</span>
                  </span>
                </button>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 space-y-2 text-center">
                  <p className="text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
                    لن يتمكن {peerUser.displayName} من مراسلتك بعد الحظر. هل تريد المتابعة؟
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={async () => {
                        if (!onBlockUser) return;
                        setActionBusy(true);
                        try {
                          await onBlockUser(peerUser.uid);
                          setConfirmBlock(false);
                        } finally {
                          setActionBusy(false);
                        }
                      }}
                      className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                    >
                      {actionBusy ? '...' : 'حظر'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBlock(false)}
                      className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Tabbed Shared Content Hub (Photos, Files, Links, Audio) */}
        {(mediaMessages.length > 0 ||
          fileMessages.length > 0 ||
          sharedLinks.length > 0 ||
          audioMessages.length > 0) && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#202b36]">
              {[
                { key: 'media' as const, label: 'صور', count: mediaMessages.length, icon: ImageIcon },
                { key: 'files' as const, label: 'ملفات', count: fileMessages.length, icon: FileText },
                { key: 'links' as const, label: 'روابط', count: sharedLinks.length, icon: Link2 },
                { key: 'audio' as const, label: 'صوتيات', count: audioMessages.length, icon: Music },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = sharedTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setSharedTab(tab.key)}
                    className={`tap-press py-1.5 px-1 rounded-lg text-[11px] font-semibold flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-[#17212b] text-sky-600 dark:text-sky-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="whitespace-nowrap">
                      {tab.label} <span className="tabular-nums opacity-75">({tab.count})</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {sharedTab === 'media' && (
              mediaMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد صور مشتركة</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {mediaMessages.slice(-9).reverse().map((m, idx, arr) => {
                    const imgSrc = (m.mediaUrl || m.mediaDataUrl)!;
                    return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        onOpenImage(imgSrc, {
                          images: arr.map((imgMsg) => ({
                            src: (imgMsg.mediaUrl || imgMsg.mediaDataUrl)!,
                            caption: imgMsg.text || undefined,
                          })),
                          index: idx,
                        })
                      }
                      className="aspect-square rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 cursor-pointer"
                    >
                      <img
                        src={imgSrc}
                        alt="وسائط"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover hover:scale-105 transition-transform"
                      />
                    </button>
                    );
                  })}
                </div>
              )
            )}

            {sharedTab === 'files' && (
              fileMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد ملفات مرسلة</p>
              ) : (
                <div className="space-y-1.5">
                  {fileMessages.slice(-8).reverse().map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={downloadingId === m.id}
                      onClick={async () => {
                        setDownloadingId(m.id);
                        try {
                          const url = await getMessageDownloadUrl(m);
                          triggerFileDownload(url, m.fileName || `file_${m.id}`);
                        } catch {
                          // Download failed
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                      className="tap-press w-full text-start flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-[#242f3d] hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer disabled:opacity-60"
                    >
                      <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {m.fileName || 'ملف مرفق'}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {m.fileSize ? formatFileSize(m.fileSize) : 'مستند'}
                        </div>
                      </div>
                      {downloadingId === m.id ? (
                        <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                      ) : (
                        <Download className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )
            )}

            {sharedTab === 'links' && (
              sharedLinks.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد روابط مشتركة</p>
              ) : (
                <div className="space-y-1.5">
                  {sharedLinks.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#242f3d] hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 flex items-center gap-2.5 text-start"
                      >
                        <div className="w-8 h-8 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                          <Globe className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1" dir="ltr">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.host}
                          </div>
                          <div className="text-[11px] text-sky-600 dark:text-sky-400 truncate">
                            {item.url}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      </a>
                      {!(chat.protectContent && !isAdminOrOwner) && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(item.url).catch(() => {});
                            setCopiedSharedUrl(item.id);
                            window.setTimeout(() => setCopiedSharedUrl(null), 1500);
                          }}
                          title="نسخ الرابط"
                          className="tap-press p-1.5 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-300 hover:bg-white dark:hover:bg-slate-800 shrink-0 cursor-pointer"
                        >
                          {copiedSharedUrl === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {sharedTab === 'audio' && (
              audioMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">لا توجد رسائل أو ملفات صوتية</p>
              ) : (
                <div className="space-y-1.5">
                  {audioMessages.slice(-8).reverse().map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      disabled={downloadingId === m.id}
                      onClick={async () => {
                        setDownloadingId(m.id);
                        try {
                          const url = await getMessageDownloadUrl(m);
                          triggerFileDownload(url, m.fileName || `audio_${m.id}.webm`);
                        } catch {
                          // Download failed
                        } finally {
                          setDownloadingId(null);
                        }
                      }}
                      className="tap-press w-full text-start flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-[#242f3d] hover:bg-slate-100 dark:hover:bg-slate-700/60 cursor-pointer disabled:opacity-60"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {m.fileName || 'رسالة صوتية'}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {m.mediaDurationSec ? formatAudioDuration(m.mediaDurationSec) : ''}
                          {m.mediaDurationSec && m.fileSize ? ' · ' : ''}
                          {m.fileSize ? formatFileSize(m.fileSize) : ''}
                        </div>
                      </div>
                      {downloadingId === m.id ? (
                        <Loader2 className="w-4 h-4 text-sky-500 animate-spin shrink-0" />
                      ) : (
                        <Download className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* Admin Invite Links & Security Controls (Groups / Channels) */}
        {(chat.type === 'group' || chat.type === 'channel') && isAdminOrOwner && (
          <div className="p-4 space-y-3.5">
            <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-sky-500" />
              <span>روابط الدعوة وصلاحيات {chat.type === 'channel' ? 'القناة' : 'المجموعة'}</span>
            </h5>

            {onCreateOrRegenerateInvite && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 space-y-2.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                  رابط الدعوة السريع
                </div>
                {chat.inviteCode ? (
                  <>
                    <div
                      dir="ltr"
                      className="px-2.5 py-2 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-sky-600 dark:text-sky-400 truncate"
                    >
                      {`${window.location.origin}/?invite=${chat.inviteCode}`}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/?invite=${chat.inviteCode}`;
                          navigator.clipboard?.writeText(url).then(() => {
                            setInviteCopied(true);
                            window.setTimeout(() => setInviteCopied(false), 1800);
                          }).catch(() => {});
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {inviteCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{inviteCopied ? 'تم النسخ' : 'نسخ'}</span>
                      </button>
                      {onOpenInviteQR && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/?invite=${chat.inviteCode}`;
                            onOpenInviteQR(url, chat.title);
                          }}
                          title="عرض رمز QR"
                          className="py-1.5 px-2.5 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5 text-sky-500" />
                          <span>QR</span>
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={inviteBusy}
                        onClick={async () => {
                          setInviteBusy(true);
                          try {
                            await onCreateOrRegenerateInvite();
                          } finally {
                            setInviteBusy(false);
                          }
                        }}
                        title="تجديد الرابط وإبطال القديم"
                        className="p-1.5 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-sky-600 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${inviteBusy ? 'animate-spin' : ''}`} />
                      </button>
                      {onRevokeInvite && (
                        <button
                          type="button"
                          disabled={inviteBusy}
                          onClick={async () => {
                            setInviteBusy(true);
                            try {
                              await onRevokeInvite();
                            } finally {
                              setInviteBusy(false);
                            }
                          }}
                          title="إلغاء الرابط"
                          className="p-1.5 rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={inviteBusy}
                    onClick={async () => {
                      setInviteBusy(true);
                      try {
                        await onCreateOrRegenerateInvite();
                      } finally {
                        setInviteBusy(false);
                      }
                    }}
                    className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {inviteBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    <span>إنشاء رابط دعوة</span>
                  </button>
                )}
              </div>
            )}

            {onUpdateAdvancedSettings && (
              <div className="space-y-2.5">
                {chat.type === 'group' && (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <Timer className="w-3.5 h-3.5 text-amber-500" />
                        <span>الوضع البطيء (Slow Mode)</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {chat.slowModeSeconds ? `${chat.slowModeSeconds} ث` : 'إيقاف'}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { sec: 0, label: 'إيقاف' },
                        { sec: 10, label: '10 ث' },
                        { sec: 30, label: '30 ث' },
                        { sec: 60, label: '1 د' },
                        { sec: 300, label: '5 د' },
                      ].map((opt) => {
                        const active = (chat.slowModeSeconds || 0) === opt.sec;
                        return (
                          <button
                            key={opt.sec}
                            type="button"
                            disabled={advBusy}
                            onClick={async () => {
                              setAdvBusy(true);
                              try {
                                await onUpdateAdvancedSettings({ slowModeSeconds: opt.sec });
                              } finally {
                                setAdvBusy(false);
                              }
                            }}
                            className={`py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              active
                                ? 'bg-sky-600 text-white'
                                : 'bg-white dark:bg-[#17212b] text-slate-600 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-slate-700'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <label className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2 cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>حماية المحتوى</span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                      منع النسخ والتحويل والتنزيل لغير المشرفين
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    disabled={advBusy}
                    checked={Boolean(chat.protectContent)}
                    onChange={async (e) => {
                      setAdvBusy(true);
                      try {
                        await onUpdateAdvancedSettings({ protectContent: e.target.checked });
                      } finally {
                        setAdvBusy(false);
                      }
                    }}
                    className="rounded accent-sky-600 w-4 h-4 shrink-0"
                  />
                </label>

                {chat.type === 'channel' && (
                  <label className="p-3 rounded-xl bg-slate-50 dark:bg-[#202b36] border border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2 cursor-pointer">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                        <span>التعليقات على المنشورات</span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                        السماح للمشتركين بكتابة تعليقات أسفل منشورات القناة
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      disabled={advBusy}
                      checked={chat.allowComments !== false}
                      onChange={async (e) => {
                        setAdvBusy(true);
                        try {
                          await onUpdateAdvancedSettings({ allowComments: e.target.checked });
                        } finally {
                          setAdvBusy(false);
                        }
                      }}
                      className="rounded accent-sky-600 w-4 h-4 shrink-0"
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {/* Members List (Groups / Channels) */}
        {(chat.type === 'group' || chat.type === 'channel') && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h5 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                الأعضاء ({members.length})
              </h5>
              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>
              )}
            </div>

            {showAddMember && (
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#242f3d] space-y-2">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو اليوزر (@username)..."
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#17212b] text-xs text-slate-900 dark:text-white focus:outline-none"
                />
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {!memberSearch.trim() ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      أدخل الاسم أو اليوزر (@username) للعثور على العضو وإضافته
                    </p>
                  ) : searchingMemberExact && addableUsers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      جاري البحث...
                    </p>
                  ) : addableUsers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">
                      لا يوجد مستخدم مطابق للإضافة
                    </p>
                  ) : (
                    addableUsers.map((u) => (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={async () => {
                          await onAddMember(u);
                          setMemberSearch('');
                          setShowAddMember(false);
                        }}
                        className="w-full px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs hover:bg-slate-200/60 dark:hover:bg-slate-700/60 cursor-pointer text-start"
                      >
                        <div className="min-w-0 flex-1">
                          <HighlightText
                            text={u.displayName}
                            query={memberSearch}
                            className="block truncate font-medium"
                          />
                          <HighlightText
                            text={`@${u.username}`}
                            query={memberSearch}
                            stripAtFromQuery
                            className="block text-[10px] font-mono text-sky-600 dark:text-sky-400 truncate"
                          />
                        </div>
                        <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              {members.map((member) => (
                <div
                  key={member.uid}
                  className="flex items-center justify-between gap-2 py-1.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      name={member.displayName}
                      seed={member.uid}
                      photoURL={member.photoURL}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {member.displayName}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {member.role === 'owner'
                          ? 'المالك'
                          : member.role === 'admin'
                          ? 'مشرف'
                          : 'عضو'}
                      </div>
                    </div>
                  </div>

                  {isOwner && member.uid !== currentUser.uid && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleAdmin(member)}
                        title={member.role === 'admin' ? 'إزالة الإشراف' : 'ترقية لمشرف'}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          member.role === 'admin'
                            ? 'text-sky-600 bg-sky-50 dark:bg-sky-950/50'
                            : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveMember(member)}
                        title="إزالة من المحادثة"
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leave / Delete Chat */}
        {chat.type !== 'saved' && chatItem && (
          <div className="p-4">
            {!confirmLeave ? (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="w-full py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
              >
                {chat.type === 'direct' ? (
                  <Trash2 className="w-4 h-4" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>
                  {chat.type === 'channel'
                    ? 'مغادرة القناة'
                    : chat.type === 'group'
                    ? 'مغادرة المجموعة'
                    : 'حذف المحادثة'}
                </span>
              </button>
            ) : chat.type === 'direct' ? (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 space-y-2 text-center">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  اختر طريقة حذف المحادثة:
                </p>
                {onDeleteChatForBoth && (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={async () => {
                      setActionBusy(true);
                      try {
                        await onDeleteChatForBoth();
                      } finally {
                        setActionBusy(false);
                        setConfirmLeave(false);
                      }
                    }}
                    className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {actionBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>حذف المحادثة بين الطرفين نهائياً</span>
                  </button>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={onLeaveChat}
                    className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60 text-xs font-medium cursor-pointer"
                  >
                    حذف من قائمتي فقط
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 space-y-2 text-center">
                <p className="text-xs text-red-700 dark:text-red-300">
                  هل أنت متأكد من المغادرة؟
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onLeaveChat}
                    className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
                  >
                    تأكيد
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmLeave(false)}
                    className="flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
