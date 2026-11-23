import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  Archive,
  Bell,
  Check,
  Link2,
  Loader2,
  Megaphone,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  clearReadQuotaCooldown,
  clearWriteQuotaCooldown,
  db,
  formatAppErrorMessage,
  isFirestoreQuotaError,
  isFirestoreReadQuotaError,
  isReadQuotaCooldownActive,
  isWriteQuotaCooldownActive,
  markReadQuotaCooldown,
  markWriteQuotaCooldown,
  OperationType,
  tsToMillis,
} from './lib/firebase';
import {
  addChannelComment,
  addMemberToChat,
  addStickersToPack,
  batchDeleteMessages,
  blockUser,
  cancelScheduledMessage,
  castPollVote,
  createGroupOrChannel,
  createOrRegenerateInviteLink,
  createStickerPack,
  createStory,
  deleteChannelComment,
  deleteCustomSticker,
  deleteDirectChatForBoth,
  deleteMessage,
  deleteStickerPack,
  deleteStory,
  deleteUserAccount,
  dispatchScheduledMessageNow,
  editMessage,
  fetchDiscoverableUsers,
  fetchPublicUsersByIds,
  findUserByExactUsername,
  forwardMessage,
  joinChatByInvite,
  joinPublicChat,
  leaveChat,
  listStoryViews,
  mapChannelCommentDoc,
  mapChatDoc,
  mapCustomStickerDoc,
  mapMemberDoc,
  mapMessageDoc,
  mapScheduledMessageDoc,
  mapStickerPackDoc,
  mapStoryDoc,
  mapUserBlock,
  mapUserChatItem,
  markChatAsRead,
  markStoryViewed,
  pinMessage,
  pingPresence,
  removeMemberFromChat,
  rescheduleMessage,
  resolveInviteLink,
  revokeInviteLink,
  scheduleMessage,
  sendMessage,
  startDirectChat,
  syncUserOnSignIn,
  toggleReaction,
  unblockUser,
  unpinAllMessages,
  updateChatAdvancedSettings,
  updateChatAutoDeleteTimer,
  updateChatDetails,
  updateChatItemPrefs,
  updateChatPhoto,
  updateMemberRole,
  updateTypingIndicator,
  updateUserPhoto,
  updateUserPreferences,
  updateUserProfile,
} from './lib/chatService';
import {
  clearPasscode,
  hasPasscodeEnabled,
  loadDraftsMap,
  saveChatDraft,
  setPasscode,
} from './lib/draftsAndLock';
import { createCallOffer, mapCallDoc } from './lib/webrtcService';
import {
  CallMode,
  CallSession,
  ChannelComment,
  Chat,
  ChatMember,
  CustomSticker,
  FolderKey,
  InviteLink,
  LightboxState,
  Message,
  MessageReaction,
  PollVote,
  PrivateUser,
  PublicUser,
  ScheduledMessage,
  StickerPack,
  Story,
  UserBlock,
  UserChatItem,
} from './types/telegram';
import {
  AppNotificationPermission,
  ensureNotificationServiceWorker,
  getNotificationPermission,
  playNotificationChime,
  requestAppNotificationPermission,
  showAppNotification,
  syncAppBadge,
} from './lib/notifications';
import {
  buildWhatsAppUrl,
  formatMessageForWhatsApp,
  openWhatsAppLink,
} from './lib/whatsapp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { FolderRail } from './components/FolderRail';
import { ChatListSidebar } from './components/ChatListSidebar';
import { ChatWindow } from './components/ChatWindow';
import { ChatInfoDrawer } from './components/ChatInfoDrawer';
import { StickerPackModal } from './components/StickerPackModal';
import { CallModal } from './components/CallModal';
import { ChannelCommentsModal } from './components/ChannelCommentsModal';
import { PasscodeLockScreen, PasscodeSetupModal } from './components/PasscodeModal';
import { AdvancedSearchModal } from './components/AdvancedSearchModal';
import { QRCodeModal } from './components/QRCodeModal';
import {
  DiscoverModal,
  ForwardModal,
  ImageLightbox,
  NewChatModal,
  PollModal,
  PrivacyModal,
  SettingsModal,
} from './components/Modals';
import { OfflineIndicator } from './components/PWAComponents';

function BarqiyahApp() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [privateUser, setPrivateUser] = useState<PrivateUser | null>(null);
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>('light');

  // Collections State (hydrated strictly from self, chat peers, group members, and explicit searches)
  const [usersById, setUsersById] = useState<Record<string, PublicUser>>({});
  const [chatItems, setChatItems] = useState<UserChatItem[]>([]);
  const [chatsById, setChatsById] = useState<Record<string, Chat>>({});
  const [publicChats, setPublicChats] = useState<Chat[]>([]);
  const [scheduledByChatId, setScheduledByChatId] = useState<Record<string, ScheduledMessage[]>>({});

  // Active Chat State
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<FolderKey>('all');
  const [activeMembers, setActiveMembers] = useState<ChatMember[]>([]);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [activeReactions, setActiveReactions] = useState<MessageReaction[]>([]);
  const [activePollVotes, setActivePollVotes] = useState<PollVote[]>([]);

  // UI & Modal State
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatInitialTab, setNewChatInitialTab] = useState<'direct' | 'group' | 'channel'>('direct');
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [advancedSearchState, setAdvancedSearchState] = useState<{
    open: boolean;
    initialQuery?: string;
    initialChatId?: string;
  }>({ open: false });
  const [jumpTargetMessage, setJumpTargetMessage] = useState<{
    chatId: string;
    messageId: string;
    nonce: number;
  } | null>(null);
  const [forwardingMessages, setForwardingMessages] = useState<Message[]>([]);
  const [lightboxState, setLightboxState] = useState<LightboxState | null>(null);
  const [blocksByMe, setBlocksByMe] = useState<UserBlock[]>([]);
  const [blocksAgainstMe, setBlocksAgainstMe] = useState<UserBlock[]>([]);
  const [stickerPacks, setStickerPacks] = useState<StickerPack[]>([]);
  const [customStickersByPack, setCustomStickersByPack] = useState<Record<string, CustomSticker[]>>({});
  const [showStickerPackModal, setShowStickerPackModal] = useState(false);
  const [editingStickerPack, setEditingStickerPack] = useState<StickerPack | null>(null);

  // Advanced Features State (Drafts, App Lock, QR, Invites, Stories, Comments, WebRTC Calls)
  const [draftsByChatId, setDraftsByChatId] = useState<Record<string, string>>({});
  const [passcodeEnabled, setPasscodeEnabled] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [showPasscodeSetup, setShowPasscodeSetup] = useState(false);
  const [qrModalData, setQrModalData] = useState<{
    title: string;
    subtitle?: string;
    url: string;
  } | null>(null);
  const [pendingInvite, setPendingInvite] = useState<InviteLink | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeComments, setActiveComments] = useState<ChannelComment[]>([]);
  const [commentsModalMsg, setCommentsModalMsg] = useState<Message | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);

  const [toastError, setToastError] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<{
    message: string;
    undoLabel?: string;
    onUndo?: () => void;
  } | null>(null);
  const [authSyncError, setAuthSyncError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [listenersPaused, setListenersPaused] = useState(false);
  const [notifPermission, setNotifPermission] = useState<AppNotificationPermission>(() =>
    getNotificationPermission()
  );
  const [dismissedNotifBanner, setDismissedNotifBanner] = useState(false);
  const [toastNotification, setToastNotification] = useState<{
    chatId: string;
    title: string;
    senderName: string;
    body: string;
  } | null>(null);

  const [quotaReadOnlyMode, setQuotaReadOnlyMode] = useState<boolean>(() =>
    isWriteQuotaCooldownActive() || isReadQuotaCooldownActive()
  );
  const [readQuotaLimited, setReadQuotaLimited] = useState<boolean>(() =>
    isReadQuotaCooldownActive()
  );
  const [dismissedQuotaBanner, setDismissedQuotaBanner] = useState(false);

  const prevLastMsgAtRef = useRef<Record<string, number>>({});
  const chatsHydratedRef = useRef(false);
  const inFlightScheduledRef = useRef<Set<string>>(new Set());
  const toastNotifTimerRef = useRef<number | null>(null);
  const toastNoticeTimerRef = useRef<number | null>(null);
  const attemptedFetchUidsRef = useRef<Set<string>>(new Set());
  const listenersPausedRef = useRef(false);
  const dismissedCallIdsRef = useRef<Set<string>>(new Set());
  const handledDeepLinkRef = useRef(false);
  const lastMarkedReadAtRef = useRef<Record<string, number>>({});
  const lastInteractionAtRef = useRef<number>(Date.now());
  const currentUserRef = useRef<PublicUser | null>(null);
  currentUserRef.current = currentUser;

  const knownUsers = useMemo(() => Object.values(usersById), [usersById]);

  const activeTheme = privateUser?.theme || localTheme;

  // Apply Dark/Light theme class on <html> and update mobile status bar theme-color
  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', activeTheme === 'dark' ? '#17212b' : '#ffffff');
    }
  }, [activeTheme]);

  const reportListenerError = useCallback(
    (err: unknown, operationType: OperationType, path: string) => {
      if (listenersPausedRef.current || !auth.currentUser) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (isFirestoreQuotaError(err)) {
        const isReadQuota =
          isFirestoreReadQuotaError(err) ||
          operationType === OperationType.GET ||
          operationType === OperationType.LIST;
        if (isReadQuota) {
          markReadQuotaCooldown();
          setReadQuotaLimited(true);
          // Detach live snapshot listeners cleanly so SDK stops backoff retry spam while cached data stays visible
          listenersPausedRef.current = true;
          setListenersPaused(true);
        } else {
          markWriteQuotaCooldown();
        }
        setQuotaReadOnlyMode(true);
        setDismissedQuotaBanner(false);
        return;
      }
      console.error('[ZENO Firestore Listener]', { operationType, path, message });
      if (message.toLowerCase().includes('permission')) {
        setToastError('تعذر مزامنة جزء من البيانات (تحقق من تسجيل الدخول والصلاحيات)');
      }
    },
    []
  );

  const clearSessionToAuthScreen = useCallback(() => {
    setShowSettingsModal(false);
    setShowPrivacyModal(false);
    setAdvancedSearchState({ open: false });
    setJumpTargetMessage(null);
    setShowInfoDrawer(false);
    setShowNewChatModal(false);
    setShowDiscoverModal(false);
    setShowPollModal(false);
    setShowStickerPackModal(false);
    setEditingStickerPack(null);
    setForwardingMessages([]);
    setLightboxState(null);
    setDraftsByChatId({});
    setPasscodeEnabled(false);
    setIsAppLocked(false);
    setShowPasscodeSetup(false);
    setQrModalData(null);
    setPendingInvite(null);
    setStories([]);
    setActiveComments([]);
    setCommentsModalMsg(null);
    setActiveCall(null);
    setCurrentUser(null);
    setPrivateUser(null);
    setAuthSyncError(null);
    setUsersById({});
    setChatItems([]);
    setChatsById({});
    setPublicChats([]);
    setScheduledByChatId({});
    setActiveMembers([]);
    setActiveMessages([]);
    setActiveReactions([]);
    setActivePollVotes([]);
    setBlocksByMe([]);
    setBlocksAgainstMe([]);
    setStickerPacks([]);
    setCustomStickersByPack({});
    setActiveChatId(null);
    setToastNotification(null);
    if (toastNoticeTimerRef.current) {
      window.clearTimeout(toastNoticeTimerRef.current);
      toastNoticeTimerRef.current = null;
    }
    setToastNotice(null);
    prevLastMsgAtRef.current = {};
    chatsHydratedRef.current = false;
    attemptedFetchUidsRef.current.clear();
    dismissedCallIdsRef.current.clear();
    handledDeepLinkRef.current = false;
    lastMarkedReadAtRef.current = {};
    syncAppBadge(0);
  }, []);

  useEffect(() => {
    if (!currentUser || isAppLocked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAdvancedSearchState((prev) =>
          prev.open ? { open: false } : { open: true, initialChatId: activeChatId || undefined }
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentUser, isAppLocked, activeChatId]);

  const syncInFlightUidRef = useRef<string | null>(null);

  const performUserSync = useCallback(async (fbUser: NonNullable<typeof auth.currentUser>) => {
    if (syncInFlightUidRef.current === fbUser.uid) return;
    syncInFlightUidRef.current = fbUser.uid;
    try {
      setAuthSyncError(null);
      setAuthNotice(null);
      listenersPausedRef.current = false;
      setListenersPaused(false);
      const { publicUser, privateUser: priv, quotaReadOnly } = await syncUserOnSignIn(fbUser);
      setCurrentUser(publicUser);
      setPrivateUser(priv);
      setLocalTheme(priv.theme);
      setUsersById((prev) => ({ ...prev, [publicUser.uid]: publicUser }));
      setDraftsByChatId(loadDraftsMap(publicUser.uid));
      try {
        const storedMarks = localStorage.getItem(`zeno_read_marks_${publicUser.uid}`);
        if (storedMarks) {
          const parsed = JSON.parse(storedMarks) as Record<string, number>;
          if (parsed && typeof parsed === 'object') {
            lastMarkedReadAtRef.current = { ...parsed, ...lastMarkedReadAtRef.current };
          }
        }
      } catch {
        // Ignore storage read errors
      }

      if (quotaReadOnly) {
        setQuotaReadOnlyMode(true);
        setDismissedQuotaBanner(false);
      }

      const hasPin = hasPasscodeEnabled(publicUser.uid);
      setPasscodeEnabled(hasPin);
      if (hasPin) {
        setIsAppLocked(true);
      }

      const params = new URLSearchParams(window.location.search);
      const deepChatId = params.get('chatId');
      const isDesktopViewport = typeof window === 'undefined' || window.innerWidth >= 768;
      setActiveChatId(
        (prev) => deepChatId || prev || (isDesktopViewport ? `saved_${fbUser.uid}`.slice(0, 128) : null)
      );

      ensureNotificationServiceWorker().then(() => {
        setNotifPermission(getNotificationPermission());
      });
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        setAuthSyncError(
          formatAppErrorMessage(
            err,
            'تم استهلاك الحد اليومي المجاني لقاعدة البيانات. يُعاد تصفير الحصة تلقائياً في اليوم التالي.'
          )
        );
      } else {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED')) {
          setAuthSyncError('تم التحقق من الحساب لكن تعذر الوصول إلى قاعدة البيانات. يرجى المحاولة مرة أخرى.');
        } else {
          setAuthSyncError(
            formatAppErrorMessage(
              err,
              'تعذر مزامنة بيانات الحساب مع الخادم. تحقق من الاتصال وأعد المحاولة.'
            )
          );
        }
      }
    } finally {
      if (syncInFlightUidRef.current === fbUser.uid) {
        syncInFlightUidRef.current = null;
      }
      setAuthReady(true);
    }
  }, []);

  // Auth Listener & Initial Sync
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        listenersPausedRef.current = false;
        setListenersPaused(false);
        clearSessionToAuthScreen();
        setAuthReady(true);
        return;
      }

      if (listenersPausedRef.current) {
        return;
      }

      await performUserSync(fbUser);
    });
    return () => unsub();
  }, [clearSessionToAuthScreen, performUserSync]);

  // Auto-retry initial account sync once network connectivity returns
  useEffect(() => {
    if (!authSyncError || currentUser) return;
    const onOnline = () => {
      if (auth.currentUser && !listenersPausedRef.current) {
        void performUserSync(auth.currentUser);
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [authSyncError, currentUser, performUserSync]);

  // Track quota cooldown events and user activity to avoid wasteful background writes
  useEffect(() => {
    const onQuotaEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ until?: number; readUntil?: number }>).detail;
      const until = detail?.until || 0;
      const readUntil = detail?.readUntil || 0;
      const active = until > Date.now();
      const readActive = readUntil > Date.now();
      setQuotaReadOnlyMode(active);
      setReadQuotaLimited(readActive);
      if (active) setDismissedQuotaBanner(false);
    };
    const markActive = () => {
      lastInteractionAtRef.current = Date.now();
    };
    window.addEventListener('zeno:quota-cooldown', onQuotaEvent);
    window.addEventListener('pointerdown', markActive, { passive: true });
    window.addEventListener('keydown', markActive, { passive: true });
    return () => {
      window.removeEventListener('zeno:quota-cooldown', onQuotaEvent);
      window.removeEventListener('pointerdown', markActive);
      window.removeEventListener('keydown', markActive);
    };
  }, []);

  // Presence Heartbeat (every 10 minutes only when tab is visible and user interacted recently)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (isWriteQuotaCooldownActive()) return;
      if (Date.now() - lastInteractionAtRef.current > 600000) return;
      const latestUser = currentUserRef.current;
      if (latestUser) {
        void pingPresence(latestUser);
      }
    }, 600000);
    return () => window.clearInterval(interval);
  }, [currentUser?.uid]);

  // Deep-link handling for notification click (Service Worker & in-app)
  useEffect(() => {
    const onOpenChatEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ chatId?: string }>).detail;
      if (detail?.chatId) {
        setActiveChatId(detail.chatId);
        setShowInfoDrawer(false);
      }
    };
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ZENO_OPEN_CHAT' && typeof e.data.chatId === 'string') {
        setActiveChatId(e.data.chatId);
        setShowInfoDrawer(false);
      }
    };

    window.addEventListener('zeno:open-chat', onOpenChatEvent);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    return () => {
      window.removeEventListener('zeno:open-chat', onOpenChatEvent);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, []);

  // Listen to Private User Prefs & Linked Phone/WhatsApp State
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const path = `users_private/${currentUser.uid}`;
    const unsub = onSnapshot(
      doc(db, 'users_private', currentUser.uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setPrivateUser({
            uid: String(d.uid),
            email: String(d.email || ''),
            theme: d.theme === 'dark' ? 'dark' : 'light',
            fontSize: d.fontSize === 'small' || d.fontSize === 'large' ? d.fontSize : 'medium',
            notificationsEnabled: Boolean(d.notificationsEnabled),
            phoneNumber: typeof d.phoneNumber === 'string' ? d.phoneNumber : '',
            whatsappEnabled: typeof d.whatsappEnabled === 'boolean' ? d.whatsappEnabled : false,
            phoneDiscoverable: typeof d.phoneDiscoverable === 'boolean' ? d.phoneDiscoverable : false,
            updatedAt: tsToMillis(d.updatedAt),
          });
        }
      },
      (err) => reportListenerError(err, OperationType.GET, path)
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Listen to Own Public Profile (no global stranger directory dump)
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const unsub = onSnapshot(
      doc(db, 'users_public', currentUser.uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const me: PublicUser = {
          uid: String(data.uid || currentUser.uid),
          displayName: String(data.displayName || 'مستخدم'),
          username: String(data.username || ''),
          photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
          bio: typeof data.bio === 'string' ? data.bio : '',
          isDiscoverable: Boolean(data.isDiscoverable),
          lastSeen: tsToMillis(data.lastSeen),
          createdAt: tsToMillis(data.createdAt),
        };
        setCurrentUser(me);
        setUsersById((prev) => ({ ...prev, [me.uid]: me }));
      },
      (err) => reportListenerError(err, OperationType.GET, `users_public/${currentUser.uid}`)
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Listen to User Blocks (both initiated by me and against me)
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const myBlocksQuery = query(
      collection(db, 'user_blocks'),
      where('blockerUid', '==', currentUser.uid)
    );
    const peerBlocksQuery = query(
      collection(db, 'user_blocks'),
      where('blockedUid', '==', currentUser.uid)
    );

    const unsubMyBlocks = onSnapshot(
      myBlocksQuery,
      (snap) => {
        setBlocksByMe(snap.docs.map((d) => mapUserBlock(d.data(), d.id)));
      },
      (err) => reportListenerError(err, OperationType.LIST, 'user_blocks')
    );

    const unsubPeerBlocks = onSnapshot(
      peerBlocksQuery,
      (snap) => {
        setBlocksAgainstMe(snap.docs.map((d) => mapUserBlock(d.data(), d.id)));
      },
      (err) => reportListenerError(err, OperationType.LIST, 'user_blocks')
    );

    return () => {
      unsubMyBlocks();
      unsubPeerBlocks();
    };
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Hydrate profiles strictly for known peers, active chat members, and blocked users
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const needed = new Set<string>();
    for (const item of chatItems) {
      if (item.peerUserId) needed.add(item.peerUserId);
    }
    for (const member of activeMembers) {
      if (member.uid) needed.add(member.uid);
    }
    for (const block of blocksByMe) {
      if (block.blockedUid) needed.add(block.blockedUid);
    }

    const missingIds = Array.from(needed).filter(
      (uid) => !usersById[uid] && !attemptedFetchUidsRef.current.has(uid)
    );
    if (missingIds.length === 0) return;
    for (const uid of missingIds) attemptedFetchUidsRef.current.add(uid);

    let cancelled = false;
    fetchPublicUsersByIds(missingIds)
      .then((loaded) => {
        if (cancelled || loaded.length === 0) return;
        setUsersById((prev) => {
          const next = { ...prev };
          for (const u of loaded) next[u.uid] = u;
          return next;
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, listenersPaused, chatItems, activeMembers, blocksByMe, usersById]);

  // Hydrate Discoverable Users Directory (cached in sessionStorage to avoid redundant reads)
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    let cancelled = false;
    fetchDiscoverableUsers(30)
      .then((list) => {
        if (cancelled || list.length === 0) return;
        setUsersById((prev) => {
          const next = { ...prev };
          for (const u of list) {
            if (u.uid && u.uid !== currentUser.uid && !next[u.uid]) {
              next[u.uid] = u;
            }
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid, listenersPaused]);

  // Listen to User's Custom Sticker Packs
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const q = query(
      collection(db, 'sticker_packs'),
      where('ownerId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const packs = snap.docs
          .map((d) => mapStickerPackDoc(d.data(), d.id))
          .sort((a, b) => b.createdAt - a.createdAt);
        setStickerPacks(packs);
      },
      (err) => reportListenerError(err, OperationType.LIST, 'sticker_packs')
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Subscribe to Stickers in each Custom Pack
  const watchedStickerPackIds = useMemo(
    () => stickerPacks.map((p) => p.id).sort(),
    [stickerPacks]
  );

  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    if (watchedStickerPackIds.length === 0) {
      setCustomStickersByPack({});
      return;
    }

    const unsubs = watchedStickerPackIds.map((packId) =>
      onSnapshot(
        query(
          collection(db, 'sticker_packs', packId, 'stickers'),
          where('ownerId', '==', currentUser.uid)
        ),
        (snap) => {
          const list = snap.docs
            .map((d) => mapCustomStickerDoc(d.data(), d.id))
            .sort((a, b) => a.createdAt - b.createdAt);
          setCustomStickersByPack((prev) => ({ ...prev, [packId]: list }));
        },
        (err) => reportListenerError(err, OperationType.LIST, `sticker_packs/${packId}/stickers`)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid, listenersPaused, watchedStickerPackIds.join(','), reportListenerError]);

  // Listen to User's Sidebar Chat Items
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const path = `user_chats/${currentUser.uid}/items`;
    const q = query(
      collection(db, 'user_chats', currentUser.uid, 'items'),
      where('userId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => mapUserChatItem(d.data()));
        setChatItems(items);
      },
      (err) => reportListenerError(err, OperationType.LIST, path)
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Listen to Public Channels/Groups Directory
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const q = query(
      collection(db, 'chats'),
      where('isPublic', '==', true),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => mapChatDoc(d.data(), d.id));
        setPublicChats(list);
        setChatsById((prev) => {
          const next = { ...prev };
          for (const c of list) next[c.id] = c;
          return next;
        });
      },
      (err) => reportListenerError(err, OperationType.LIST, 'chats')
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Subscribe to Individual Chat Docs for Sidebar Entries + Active Chat
  const watchedChatIds = useMemo(() => {
    const ids = new Set(chatItems.map((i) => i.chatId));
    if (activeChatId) ids.add(activeChatId);
    return Array.from(ids).sort();
  }, [chatItems, activeChatId]);

  useEffect(() => {
    if (!currentUser || listenersPaused || watchedChatIds.length === 0) return;
    const unsubs = watchedChatIds.map((chatId) =>
      onSnapshot(
        doc(db, 'chats', chatId),
        (snap) => {
          if (snap.exists()) {
            const mapped = mapChatDoc(snap.data(), snap.id);
            setChatsById((prev) => ({ ...prev, [chatId]: mapped }));
          } else {
            setChatsById((prev) => {
              if (!prev[chatId]) return prev;
              const next = { ...prev };
              delete next[chatId];
              return next;
            });
            setActiveChatId((prevActive) => {
              if (prevActive === chatId) {
                setShowInfoDrawer(false);
                return null;
              }
              return prevActive;
            });
          }
        },
        (err) => reportListenerError(err, OperationType.GET, `chats/${chatId}`)
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid, listenersPaused, watchedChatIds.join(','), reportListenerError]);

  // Listen to My Pending Scheduled Messages across watched chats
  useEffect(() => {
    if (!currentUser || listenersPaused || watchedChatIds.length === 0) {
      setScheduledByChatId({});
      return;
    }

    const unsubs = watchedChatIds.map((chatId) =>
      onSnapshot(
        query(
          collection(db, 'chats', chatId, 'scheduled_messages'),
          where('senderId', '==', currentUser.uid)
        ),
        (snap) => {
          const list = snap.docs
            .map((d) => mapScheduledMessageDoc(d.data(), d.id))
            .filter((s) => s.status === 'pending')
            .sort((a, b) => a.scheduledFor - b.scheduledFor);
          setScheduledByChatId((prev) => ({ ...prev, [chatId]: list }));
        },
        (err) =>
          reportListenerError(err, OperationType.LIST, `chats/${chatId}/scheduled_messages`)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [currentUser?.uid, listenersPaused, watchedChatIds.join(','), reportListenerError]);

  // Auto-dispatch Due Scheduled Messages
  useEffect(() => {
    if (!currentUser || listenersPaused) return;

    const flushDue = async () => {
      const now = Date.now();
      for (const [chatId, list] of Object.entries(scheduledByChatId)) {
        const chat = chatsById[chatId];
        if (!chat || list.length === 0) continue;
        for (const item of list) {
          if (item.status !== 'pending' || item.scheduledFor > now) continue;
          if (inFlightScheduledRef.current.has(item.id)) continue;
          inFlightScheduledRef.current.add(item.id);
          dispatchScheduledMessageNow(currentUser, chat, item)
            .catch(() => {})
            .finally(() => {
              inFlightScheduledRef.current.delete(item.id);
            });
        }
      }
    };

    flushDue();
    const interval = window.setInterval(flushDue, 2000);
    const onResume = () => {
      if (document.visibilityState === 'visible') flushDue();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', flushDue);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', flushDue);
    };
  }, [currentUser, listenersPaused, scheduledByChatId, chatsById]);

  // Listen to Active Chat Members, Messages, Reactions, Poll Votes
  useEffect(() => {
    if (!currentUser || listenersPaused || !activeChatId) {
      setActiveMembers([]);
      setActiveMessages([]);
      setActiveReactions([]);
      setActivePollVotes([]);
      return;
    }

    const unsubMembers = onSnapshot(
      collection(db, 'chats', activeChatId, 'members'),
      (snap) => {
        setActiveMembers(snap.docs.map((d) => mapMemberDoc(d.data())));
      },
      (err) => reportListenerError(err, OperationType.LIST, `chats/${activeChatId}/members`)
    );

    const unsubMessages = onSnapshot(
      query(collection(db, 'chats', activeChatId, 'messages'), orderBy('createdAt', 'asc')),
      (snap) => {
        setActiveMessages(snap.docs.map((d) => mapMessageDoc(d.data(), d.id)));
      },
      (err) => reportListenerError(err, OperationType.LIST, `chats/${activeChatId}/messages`)
    );

    const unsubReactions = onSnapshot(
      collection(db, 'chats', activeChatId, 'reactions'),
      (snap) => {
        setActiveReactions(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id),
              chatId: String(data.chatId),
              messageId: String(data.messageId),
              uid: String(data.uid),
              emoji: String(data.emoji),
              createdAt: tsToMillis(data.createdAt),
            };
          })
        );
      },
      (err) => reportListenerError(err, OperationType.LIST, `chats/${activeChatId}/reactions`)
    );

    const unsubVotes = onSnapshot(
      collection(db, 'chats', activeChatId, 'poll_votes'),
      (snap) => {
        setActivePollVotes(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id),
              chatId: String(data.chatId),
              messageId: String(data.messageId),
              uid: String(data.uid),
              optionIndex: Number(data.optionIndex || 0),
              createdAt: tsToMillis(data.createdAt),
            };
          })
        );
      },
      (err) => reportListenerError(err, OperationType.LIST, `chats/${activeChatId}/poll_votes`)
    );

    return () => {
      unsubMembers();
      unsubMessages();
      unsubReactions();
      unsubVotes();
    };
  }, [currentUser?.uid, listenersPaused, activeChatId, reportListenerError]);

  // Mark active chat as read whenever activeChatId or latest message changes (debounced + persisted)
  useEffect(() => {
    if (!currentUser?.uid || !activeChatId) return;
    const item = chatItems.find((i) => i.chatId === activeChatId);
    const chat = chatsById[activeChatId];
    if (!item) return;

    const latestMsgAt = activeMessages[activeMessages.length - 1]?.createdAt || 0;
    const latestActivityAt = Math.max(chat?.lastMessageAt || 0, latestMsgAt);
    const hasIncomingMessage = Boolean(
      chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid
    );
    if (!latestActivityAt || !hasIncomingMessage) return;

    let timer: number | null = null;
    const syncReadIfVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (isWriteQuotaCooldownActive()) return;
      const lastKnownRead = Math.max(
        item.lastReadAt || 0,
        lastMarkedReadAtRef.current[activeChatId] || 0
      );
      if (latestActivityAt > lastKnownRead) {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (document.visibilityState === 'hidden' || isWriteQuotaCooldownActive()) return;
          lastMarkedReadAtRef.current[activeChatId] = latestActivityAt;
          try {
            localStorage.setItem(
              `zeno_read_marks_${currentUser.uid}`,
              JSON.stringify(lastMarkedReadAtRef.current)
            );
          } catch {
            // Ignore storage write errors
          }
          void markChatAsRead(currentUser.uid, activeChatId, chat?.type);
        }, 800);
      }
    };

    syncReadIfVisible();
    document.addEventListener('visibilitychange', syncReadIfVisible);
    window.addEventListener('focus', syncReadIfVisible);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', syncReadIfVisible);
      window.removeEventListener('focus', syncReadIfVisible);
    };
  }, [currentUser?.uid, activeChatId, activeMessages, chatItems, chatsById]);

  // Listen to Active 24-Hour Ephemeral Stories
  useEffect(() => {
    if (!currentUser || listenersPaused) {
      setStories([]);
      return;
    }
    const q = query(
      collection(db, 'stories'),
      where('isActive', '==', true),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const list = snap.docs
          .map((d) => mapStoryDoc(d.data(), d.id))
          .filter((s) => s.expiresAt === 0 || s.expiresAt > now)
          .sort((a, b) => b.createdAt - a.createdAt);
        setStories(list);
      },
      (err) => reportListenerError(err, OperationType.LIST, 'stories')
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  // Listen to Incoming WebRTC Audio/Video Calls
  useEffect(() => {
    if (!currentUser || listenersPaused) return;
    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', currentUser.uid)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        const incoming = snap.docs
          .map((d) => mapCallDoc(d.data(), d.id))
          .filter(
            (c) =>
              c.status === 'ringing' &&
              !dismissedCallIdsRef.current.has(c.id) &&
              (c.createdAt === 0 || now - c.createdAt < 90_000)
          )
          .sort((a, b) => b.createdAt - a.createdAt);
        if (incoming.length > 0) {
          setActiveCall((cur) => cur || incoming[0]);
        }
      },
      (err) => reportListenerError(err, OperationType.LIST, 'calls')
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, reportListenerError]);

  const activeChat = activeChatId ? chatsById[activeChatId] || null : null;

  // Listen to Channel Comments for the Active Channel
  useEffect(() => {
    if (!currentUser || listenersPaused || !activeChatId || activeChat?.type !== 'channel') {
      setActiveComments([]);
      setCommentsModalMsg(null);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'chats', activeChatId, 'comments'),
      (snap) => {
        const list = snap.docs
          .map((d) => mapChannelCommentDoc(d.data(), d.id))
          .sort((a, b) => a.createdAt - b.createdAt);
        setActiveComments(list);
      },
      (err) => reportListenerError(err, OperationType.LIST, `chats/${activeChatId}/comments`)
    );
    return () => unsub();
  }, [currentUser?.uid, listenersPaused, activeChatId, activeChat?.type, reportListenerError]);

  const commentsByMessageId = useMemo(() => {
    const map: Record<string, ChannelComment[]> = {};
    for (const c of activeComments) {
      if (!map[c.messageId]) map[c.messageId] = [];
      map[c.messageId].push(c);
    }
    return map;
  }, [activeComments]);

  const activeChatItem = useMemo(
    () => chatItems.find((i) => i.chatId === activeChatId) || null,
    [chatItems, activeChatId]
  );
  const activePeerUser = useMemo(() => {
    if (!activeChat || activeChat.type !== 'direct' || !currentUser) return undefined;
    const otherMember = activeMembers.find((m) => m.uid !== currentUser.uid);
    const derivedPeerId =
      activeChatItem?.peerUserId ||
      otherMember?.uid ||
      (activeChat.directKey
        ? activeChat.directKey.split('_').find((id) => id && id !== currentUser.uid)
        : undefined);
    if (!derivedPeerId) return undefined;
    if (usersById[derivedPeerId]) return usersById[derivedPeerId];
    return {
      uid: derivedPeerId,
      displayName: otherMember?.displayName || activeChatItem?.title || activeChat.title || 'مستخدم ZENO',
      username: otherMember?.username || '',
      photoURL: otherMember?.photoURL || activeChatItem?.photoURL || activeChat.photoURL,
      isDiscoverable: true,
      lastSeen: 0,
      createdAt: activeChat.createdAt || 0,
    };
  }, [activeChat, activeChatItem, activeMembers, usersById, currentUser]);

  const unreadByFolder = useMemo(() => {
    const counts: Record<FolderKey, number> = {
      all: 0,
      personal: 0,
      groups: 0,
      channels: 0,
      archived: 0,
    };
    if (!currentUser) return counts;
    for (const item of chatItems) {
      const chat = chatsById[item.chatId];
      const hasUnread =
        Boolean(chat?.lastMessageAt) &&
        Boolean(chat?.lastMessageSenderId && chat.lastMessageSenderId !== currentUser.uid) &&
        (!item.lastReadAt || (chat?.lastMessageAt || 0) > item.lastReadAt);
      if (!hasUnread) continue;
      if (item.folder === 'archived') {
        counts.archived += 1;
      } else {
        counts.all += 1;
        if (item.type === 'direct' || item.type === 'saved') counts.personal += 1;
        if (item.type === 'group') counts.groups += 1;
        if (item.type === 'channel') counts.channels += 1;
      }
    }
    return counts;
  }, [chatItems, chatsById, currentUser]);

  // Sync PWA / Android App Badge
  useEffect(() => {
    syncAppBadge(unreadByFolder.all + unreadByFolder.archived);
  }, [unreadByFolder.all, unreadByFolder.archived]);

  // Hydration grace timer so historical messages don't fire notifications on initial load
  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setTimeout(() => {
      chatsHydratedRef.current = true;
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [currentUser?.uid]);

  // Incoming message notification listener (Service Worker + foreground toast + chime)
  useEffect(() => {
    if (!currentUser) return;

    const itemByChatId: Record<string, UserChatItem> = {};
    for (const item of chatItems) {
      itemByChatId[item.chatId] = item;
    }

    for (const [chatId, chat] of Object.entries(chatsById)) {
      const msgAt = chat.lastMessageAt || 0;
      if (!msgAt) continue;

      const prevAt = prevLastMsgAtRef.current[chatId];
      if (prevAt === undefined) {
        prevLastMsgAtRef.current[chatId] = msgAt;
        if (!chatsHydratedRef.current) continue;
      } else if (msgAt <= prevAt) {
        continue;
      } else {
        prevLastMsgAtRef.current[chatId] = msgAt;
      }

      if (!chatsHydratedRef.current) continue;
      if (!chat.lastMessageSenderId || chat.lastMessageSenderId === currentUser.uid) continue;

      const item = itemByChatId[chatId];
      if (item?.muted) continue;
      if (!privateUser?.notificationsEnabled) continue;

      const peer = item?.peerUserId ? usersById[item.peerUserId] : undefined;
      const chatTitle =
        chat.type === 'saved'
          ? 'الرسائل المحفوظة'
          : peer?.displayName || chat.title || item?.title || 'ZENO';
      const senderName = chat.lastMessageSenderName || chatTitle;
      const snippet = chat.lastMessageText || 'رسالة جديدة';
      const body =
        chat.type === 'direct' ? snippet : `${senderName}: ${snippet}`;

      playNotificationChime();

      const isBackgroundOrOtherChat =
        document.visibilityState !== 'visible' ||
        !document.hasFocus() ||
        chatId !== activeChatId;

      if (chatId !== activeChatId || document.visibilityState !== 'visible') {
        setToastNotification({
          chatId,
          title: chatTitle,
          senderName,
          body: snippet,
        });
        if (toastNotifTimerRef.current) window.clearTimeout(toastNotifTimerRef.current);
        toastNotifTimerRef.current = window.setTimeout(() => {
          setToastNotification((cur) => (cur?.chatId === chatId ? null : cur));
        }, 6500);
      }

      if (isBackgroundOrOtherChat) {
        showAppNotification({
          title: chatTitle,
          body,
          chatId,
        });
      }
    }
  }, [
    currentUser,
    chatsById,
    chatItems,
    usersById,
    activeChatId,
    privateUser?.notificationsEnabled,
  ]);

  const joinedChatIds = useMemo(
    () => new Set(chatItems.map((i) => i.chatId)),
    [chatItems]
  );

  const blockedByMeIds = useMemo(
    () => new Set(blocksByMe.map((b) => b.blockedUid)),
    [blocksByMe]
  );

  const blockedMeIds = useMemo(
    () => new Set(blocksAgainstMe.map((b) => b.blockerUid)),
    [blocksAgainstMe]
  );

  const blockedUsersList = useMemo(() => {
    return blocksByMe.map((b) => {
      return (
        usersById[b.blockedUid] || {
          uid: b.blockedUid,
          displayName: 'مستخدم ZENO',
          username: '',
          isDiscoverable: false,
          lastSeen: 0,
          createdAt: b.createdAt,
        }
      );
    });
  }, [blocksByMe, usersById]);

  const activeDirectPeerUid = useMemo(() => {
    if (!activeChat || activeChat.type !== 'direct' || !currentUser) return undefined;
    if (activePeerUser?.uid) return activePeerUser.uid;
    if (activeChatItem?.peerUserId) return activeChatItem.peerUserId;
    if (activeChat.directKey) {
      const parts = activeChat.directKey.split('_');
      if (parts.length === 2) {
        return parts[0] === currentUser.uid ? parts[1] : parts[0];
      }
    }
    return undefined;
  }, [activeChat, activePeerUser, activeChatItem, currentUser]);

  const isActiveBlockedByMe = Boolean(activeDirectPeerUid && blockedByMeIds.has(activeDirectPeerUid));
  const isActiveBlockedByPeer = Boolean(activeDirectPeerUid && blockedMeIds.has(activeDirectPeerUid));

  const showToastError = useCallback((rawMessage: string) => {
    const cleanMessage = formatAppErrorMessage(rawMessage, 'حدث خطأ غير متوقع، يرجى المحاولة مجدداً.');
    setToastError(cleanMessage);
    window.setTimeout(() => {
      setToastError((prev) => (prev === cleanMessage ? null : prev));
    }, 5500);
  }, []);

  const showToastNotice = useCallback(
    (message: string, undoLabel?: string, onUndo?: () => void) => {
      if (toastNoticeTimerRef.current) {
        window.clearTimeout(toastNoticeTimerRef.current);
      }
      setToastNotice({ message, undoLabel, onUndo });
      toastNoticeTimerRef.current = window.setTimeout(() => {
        setToastNotice(null);
      }, 3600);
    },
    []
  );

  const handleTogglePinItem = useCallback(
    async (item: UserChatItem) => {
      if (!currentUser) return;
      const nextPinned = !item.pinned;
      setChatItems((prev) =>
        prev.map((c) => (c.chatId === item.chatId ? { ...c, pinned: nextPinned } : c))
      );
      try {
        await updateChatItemPrefs(currentUser.uid, item.chatId, { pinned: nextPinned });
      } catch {
        setChatItems((prev) =>
          prev.map((c) => (c.chatId === item.chatId ? { ...c, pinned: item.pinned } : c))
        );
        showToastError('تعذر تحديث حالة التثبيت');
      }
    },
    [currentUser, showToastError]
  );

  const handleToggleMuteItem = useCallback(
    async (item: UserChatItem) => {
      if (!currentUser) return;
      const nextMuted = !item.muted;
      setChatItems((prev) =>
        prev.map((c) => (c.chatId === item.chatId ? { ...c, muted: nextMuted } : c))
      );
      try {
        await updateChatItemPrefs(currentUser.uid, item.chatId, { muted: nextMuted });
      } catch {
        setChatItems((prev) =>
          prev.map((c) => (c.chatId === item.chatId ? { ...c, muted: item.muted } : c))
        );
        showToastError('تعذر تحديث حالة الإشعارات');
      }
    },
    [currentUser, showToastError]
  );

  const handleToggleArchiveItem = useCallback(
    async (item: UserChatItem, suppressToast = false) => {
      if (!currentUser) return;
      const prevFolder = item.folder;
      const nextFolder: FolderKey =
        item.folder === 'archived'
          ? item.type === 'channel'
            ? 'channels'
            : item.type === 'group'
            ? 'groups'
            : 'personal'
          : 'archived';

      setChatItems((prev) =>
        prev.map((c) => (c.chatId === item.chatId ? { ...c, folder: nextFolder } : c))
      );

      try {
        await updateChatItemPrefs(currentUser.uid, item.chatId, { folder: nextFolder });
        if (!suppressToast) {
          showToastNotice(
            nextFolder === 'archived'
              ? 'تم نقل المحادثة إلى الأرشيف'
              : 'تمت استعادة المحادثة من الأرشيف',
            'تراجع',
            () => {
              void handleToggleArchiveItem({ ...item, folder: nextFolder }, true);
            }
          );
        }
      } catch {
        setChatItems((prev) =>
          prev.map((c) => (c.chatId === item.chatId ? { ...c, folder: prevFolder } : c))
        );
        showToastError('تعذر نقل المحادثة إلى الأرشيف');
      }
    },
    [currentUser, showToastError, showToastNotice]
  );

  const handleBlockUser = useCallback(
    async (targetUid: string) => {
      if (!currentUser) return;
      await blockUser(currentUser.uid, targetUid);
    },
    [currentUser]
  );

  const handleUnblockUser = useCallback(
    async (targetUid: string) => {
      if (!currentUser) return;
      await unblockUser(currentUser.uid, targetUid);
    },
    [currentUser]
  );

  const handleDeleteDirectChatForBoth = useCallback(
    async (chat: Chat, peerUid?: string) => {
      if (!currentUser) return;
      await deleteDirectChatForBoth(currentUser.uid, chat, peerUid);
      setShowInfoDrawer(false);
      setActiveChatId((prev) => (prev === chat.id ? null : prev));
    },
    [currentUser]
  );

  const handleUpdateAutoDeleteTimer = useCallback(
    async (seconds: number) => {
      if (!currentUser || !activeChat) return;
      try {
        await updateChatAutoDeleteTimer(currentUser, activeChat, seconds);
      } catch (err) {
        showToastError(err instanceof Error ? err.message : 'تعذر تحديث مؤقت التدمير الذاتي');
        throw err;
      }
    },
    [currentUser, activeChat, showToastError]
  );

  const handlePurgeExpiredMessages = useCallback(
    async (expired: Message[]) => {
      if (!activeChat || expired.length === 0) return;
      for (const msg of expired) {
        try {
          await deleteMessage(activeChat.id, msg.id, { forBoth: true, chat: activeChat });
        } catch {
          // Ignore if peer already purged the message
        }
      }
    },
    [activeChat]
  );

  const handleToggleInfoDrawer = useCallback(() => setShowInfoDrawer((v) => !v), []);
  const handleBackMobile = useCallback(() => {
    setActiveChatId(null);
    setShowInfoDrawer(false);
  }, []);
  const handleOpenImage = useCallback((src: string, gallery?: LightboxState) => {
    if (gallery && gallery.images.length > 0) {
      setLightboxState(gallery);
    } else {
      setLightboxState({ images: [{ src }], index: 0 });
    }
  }, []);
  const handleForwardMessage = useCallback((msg: Message) => setForwardingMessages([msg]), []);
  const handleBatchForwardMessages = useCallback(
    (msgs: Message[]) => setForwardingMessages(msgs),
    []
  );
  const handleOpenPollModal = useCallback(() => setShowPollModal(true), []);

  // Deep links (?invite=CODE & ?addUser=USERNAME)
  useEffect(() => {
    if (!currentUser || handledDeepLinkRef.current) return;
    handledDeepLinkRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    const addUsername = params.get('addUser');
    if (!inviteCode && !addUsername) return;

    try {
      window.history.replaceState({}, '', window.location.pathname);
    } catch {
      // Ignore history restrictions
    }

    if (inviteCode) {
      resolveInviteLink(inviteCode)
        .then((inv) => {
          if (inv) {
            setPendingInvite(inv);
          } else {
            showToastError('رابط الدعوة غير صالح أو تم إلغاؤه');
          }
        })
        .catch((err) => {
          showToastError(formatAppErrorMessage(err, 'تعذر التحقق من رابط الدعوة'));
        });
    } else if (addUsername) {
      findUserByExactUsername(addUsername)
        .then(async (peer) => {
          if (!peer) {
            showToastError('لم يتم العثور على المستخدم المطلوب');
            return;
          }
          if (peer.uid === currentUser.uid) {
            setActiveChatId(`saved_${currentUser.uid}`.slice(0, 128));
            return;
          }
          try {
            const chatId = await startDirectChat(currentUser, peer);
            setUsersById((prev) => ({ ...prev, [peer.uid]: peer }));
            setActiveChatId(chatId);
            setActiveFolder('all');
          } catch (err) {
            showToastError(formatAppErrorMessage(err, 'تعذر بدء المحادثة'));
          }
        })
        .catch((err) => {
          showToastError(formatAppErrorMessage(err, 'تعذر البحث عن المستخدم'));
        });
    }
  }, [currentUser, showToastError]);

  const handleDraftChange = useCallback(
    (chatId: string, text: string) => {
      if (!currentUser) return;
      const next = saveChatDraft(currentUser.uid, chatId, text);
      setDraftsByChatId(next);
    },
    [currentUser]
  );

  const handleStartCall = useCallback(
    async (mode: CallMode) => {
      if (!currentUser || !activeChat || activeChat.type !== 'direct' || !activePeerUser) return;
      try {
        const callId = await createCallOffer({
          chatId: activeChat.id,
          caller: currentUser,
          callee: activePeerUser,
          mode,
        });
        setActiveCall({
          id: callId,
          chatId: activeChat.id,
          callerId: currentUser.uid,
          callerName: currentUser.displayName,
          callerPhotoURL: currentUser.photoURL,
          calleeId: activePeerUser.uid,
          calleeName: activePeerUser.displayName,
          mode,
          status: 'ringing',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      } catch (err) {
        showToastError(err instanceof Error ? err.message : 'تعذر بدء المكالمة');
      }
    },
    [currentUser, activeChat, activePeerUser, showToastError]
  );

  const handleReplyToStory = useCallback(
    async (story: Story, replyText: string) => {
      if (!currentUser || !replyText.trim()) return;
      try {
        let targetUser: PublicUser | undefined = usersById[story.ownerId];
        if (!targetUser) {
          const fetched = await fetchPublicUsersByIds([story.ownerId]);
          targetUser = fetched[0];
          if (targetUser) {
            setUsersById((prev) => ({ ...prev, [targetUser!.uid]: targetUser! }));
          }
        }
        if (!targetUser) {
          showToastError('تعذر العثور على صاحب الحالة');
          return;
        }
        const chatId = await startDirectChat(currentUser, targetUser);
        const directChat: Chat = chatsById[chatId] || {
          id: chatId,
          type: 'direct',
          title: targetUser.displayName,
          description: '',
          isPublic: false,
          ownerId: currentUser.uid,
          memberCount: 2,
          directKey: [currentUser.uid, targetUser.uid].sort().join('_'),
          createdAt: Date.now(),
        };
        const preview = story.text
          ? `"${story.text.slice(0, 60)}"`
          : story.type === 'video'
          ? 'فيديو الحالة'
          : 'صورة الحالة';
        await sendMessage(currentUser, directChat, {
          type: 'text',
          text: `رد على حالتك (${preview}):\n${replyText.trim()}`,
        });
        setActiveChatId(chatId);
        setActiveFolder('all');
        setShowInfoDrawer(false);
      } catch (err) {
        showToastError(err instanceof Error ? err.message : 'تعذر إرسال الرد على الحالة');
      }
    },
    [currentUser, usersById, chatsById, showToastError]
  );

  const handleCreateStory = useCallback(
    async (payload: {
      type: 'text' | 'image' | 'video';
      text: string;
      mediaDataUrl?: string;
      mediaFile?: Blob;
      fileMimeType?: string;
      mediaDurationSec?: number;
      thumbnailDataUrl?: string;
      bgColor?: string;
      onProgress?: (percent: number) => void;
    }) => {
      if (!currentUser) return;
      await createStory(currentUser, payload);
    },
    [currentUser]
  );

  const handleDeleteStory = useCallback(async (storyId: string) => {
    await deleteStory(storyId);
  }, []);

  const handleMarkStoryViewed = useCallback(
    async (story: Story) => {
      if (!currentUser) return;
      await markStoryViewed(currentUser, story);
    },
    [currentUser]
  );

  const handleLoadStoryViews = useCallback(async (storyId: string) => {
    return listStoryViews(storyId);
  }, []);

  const handleTyping = useCallback(
    (isTyping: boolean, targetChatId?: string) => {
      if (!currentUser) return;
      const id = targetChatId || activeChatId;
      if (id && chatsById[id]?.type !== 'saved') {
        updateTypingIndicator(id, currentUser.uid, isTyping);
      }
    },
    [currentUser, activeChatId, chatsById]
  );

  const handleSendMessageToWhatsApp = useCallback(
    (msg: Message) => {
      const chatTitle =
        activeChat?.type === 'saved'
          ? 'الرسائل المحفوظة'
          : activePeerUser?.displayName || activeChat?.title;
      const formatted = formatMessageForWhatsApp({
        chatTitle,
        senderName: msg.senderName,
        text: msg.text,
        type: msg.type,
        fileName: msg.fileName,
        pollQuestion: msg.pollQuestion,
      });
      const url = buildWhatsAppUrl(undefined, formatted);
      openWhatsAppLink(url);
    },
    [activeChat, activePeerUser?.displayName]
  );

  const handleToggleTheme = async () => {
    const next = activeTheme === 'dark' ? 'light' : 'dark';
    setLocalTheme(next);
    if (currentUser) {
      try {
        await updateUserPreferences(currentUser.uid, { theme: next });
      } catch {
        // Keep local theme preference even if cloud sync is temporarily unavailable
      }
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-[#0e1621]">
        <Loader2 className="w-7 h-7 animate-spin text-sky-600" />
      </div>
    );
  }

  if (!currentUser || !privateUser) {
    return (
      <>
        <AuthScreen
          theme={activeTheme}
          onToggleTheme={handleToggleTheme}
          syncError={authSyncError}
          notice={authNotice}
          onDismissNotice={() => setAuthNotice(null)}
          onRetrySync={
            auth.currentUser
              ? () => {
                  if (auth.currentUser) {
                    clearWriteQuotaCooldown();
                    clearReadQuotaCooldown();
                    void performUserSync(auth.currentUser);
                  }
                }
              : undefined
          }
          onSignedInUser={(fbUser) => {
            clearWriteQuotaCooldown();
            clearReadQuotaCooldown();
            void performUserSync(fbUser);
          }}
          onSignOutSync={
            auth.currentUser
              ? () => {
                  clearSessionToAuthScreen();
                  setAuthNotice('تم تسجيل الخروج. يمكنك الآن تسجيل الدخول بحساب Google.');
                  void signOut(auth);
                }
              : undefined
          }
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div
      dir="rtl"
      className="relative h-dvh w-full max-w-full overflow-hidden flex bg-white dark:bg-[#0e1621] text-slate-900 dark:text-slate-100"
    >
      <FolderRail
        currentUser={currentUser}
        activeFolder={activeFolder}
        onSelectFolder={setActiveFolder}
        onOpenNewChat={() => {
          setNewChatInitialTab('direct');
          setShowNewChatModal(true);
        }}
        onOpenNewChannel={() => {
          setNewChatInitialTab('channel');
          setShowNewChatModal(true);
        }}
        onOpenDiscover={() => setShowDiscoverModal(true)}
        onOpenAdvancedSearch={() => setAdvancedSearchState({ open: true })}
        onOpenSettings={() => setShowSettingsModal(true)}
        theme={activeTheme}
        onToggleTheme={handleToggleTheme}
        unreadByFolder={unreadByFolder}
        passcodeEnabled={passcodeEnabled}
        onLockApp={() => setIsAppLocked(true)}
      />

      <div
        className={`gpu-layer w-full md:w-auto h-full shrink-0 transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          activeChatId
            ? 'max-md:translate-x-6 max-md:opacity-0 max-md:pointer-events-none'
            : 'max-md:translate-x-0 max-md:opacity-100'
        }`}
      >
        <ChatListSidebar
          currentUser={currentUser}
          allUsers={knownUsers}
          chatItems={chatItems}
          chatsById={chatsById}
          usersById={usersById}
          activeChatId={activeChatId}
          activeFolder={activeFolder}
          onSelectFolder={setActiveFolder}
          onSelectChat={(id) => {
            setActiveChatId(id);
            setShowInfoDrawer(false);
          }}
          onStartDirectUser={async (peer) => {
            try {
              const id = await startDirectChat(currentUser, peer);
              setActiveChatId(id);
              setActiveFolder('all');
              setShowInfoDrawer(false);
            } catch (err) {
              showToastError(err instanceof Error ? err.message : 'تعذر بدء المحادثة');
            }
          }}
          onTogglePin={handleTogglePinItem}
          onToggleMute={handleToggleMuteItem}
          onToggleArchive={handleToggleArchiveItem}
          onOpenNewChat={() => {
            setNewChatInitialTab('direct');
            setShowNewChatModal(true);
          }}
          onOpenNewChannel={() => {
            setNewChatInitialTab('channel');
            setShowNewChatModal(true);
          }}
          onOpenDiscover={() => setShowDiscoverModal(true)}
          onOpenSettings={() => setShowSettingsModal(true)}
          blockedByMeIds={blockedByMeIds}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
          onDeleteDirectChatForBoth={handleDeleteDirectChatForBoth}
          draftsByChatId={draftsByChatId}
          passcodeEnabled={passcodeEnabled}
          onLockApp={() => setIsAppLocked(true)}
          stories={stories}
          onCreateStory={handleCreateStory}
          onDeleteStory={handleDeleteStory}
          onMarkStoryViewed={handleMarkStoryViewed}
          onLoadStoryViews={handleLoadStoryViews}
          onReplyToStory={handleReplyToStory}
          onOpenAdvancedSearch={(initialQuery) =>
            setAdvancedSearchState({ open: true, initialQuery })
          }
        />
      </div>

      <div
        className={`gpu-layer max-md:absolute max-md:inset-0 max-md:z-20 md:static flex flex-1 min-w-0 h-full transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          activeChatId
            ? 'max-md:translate-x-0 max-md:opacity-100'
            : 'max-md:-translate-x-full max-md:opacity-0 max-md:pointer-events-none'
        }`}
      >
        <ChatWindow
          currentUser={currentUser}
          chat={activeChat}
          chatItem={activeChatItem}
          peerUser={activePeerUser}
          members={activeMembers}
          messages={activeMessages}
          reactions={activeReactions}
          pollVotes={activePollVotes}
          fontSize={privateUser.fontSize}
          showInfoDrawer={showInfoDrawer}
          onToggleInfoDrawer={handleToggleInfoDrawer}
          onBackMobile={handleBackMobile}
          onSendMessage={async (payload) => {
            if (!activeChat) return;
            await sendMessage(currentUser, activeChat, payload);
          }}
          onEditMessage={async (messageId, newText) => {
            if (!activeChat) return;
            await editMessage(activeChat.id, messageId, newText);
          }}
          onDeleteMessage={async (msg) => {
            if (!activeChat) return;
            await deleteMessage(activeChat.id, msg.id, { forBoth: true, chat: activeChat });
          }}
          onPinMessage={async (msg) => {
            if (!activeChat) return;
            await pinMessage(activeChat.id, msg, {
              uid: currentUser.uid,
              currentMessages: activeMessages,
              currentPinnedMessageId: activeChat.pinnedMessageId,
            });
          }}
          onUnpinAllMessages={async (pinnedMsgs) => {
            if (!activeChat) return;
            await unpinAllMessages(activeChat.id, pinnedMsgs);
          }}
          onForwardMessage={handleForwardMessage}
          onToggleReaction={async (messageId, emoji, currentEmoji) => {
            if (!activeChat) return;
            await toggleReaction(currentUser, activeChat.id, messageId, emoji, currentEmoji);
          }}
          onCastVote={async (messageId, optionIndex, alreadyVoted) => {
            if (!activeChat) return;
            await castPollVote(currentUser, activeChat.id, messageId, optionIndex, alreadyVoted);
          }}
          onOpenPollModal={handleOpenPollModal}
          onTyping={handleTyping}
          onToggleMute={() => {
            if (activeChatItem) {
              void handleToggleMuteItem(activeChatItem);
            }
          }}
          onOpenImage={handleOpenImage}
          onJoinPublicChat={async (chat) => {
            await joinPublicChat(currentUser, chat);
          }}
          isBlockedByMe={isActiveBlockedByMe}
          isBlockedByPeer={isActiveBlockedByPeer}
          onUnblockUser={handleUnblockUser}
          onDeleteChatForBoth={
            activeChat && activeChat.type === 'direct'
              ? () => handleDeleteDirectChatForBoth(activeChat, activeDirectPeerUid)
              : undefined
          }
          onUpdateAutoDeleteTimer={
            activeChat && (activeChat.type === 'direct' || activeChat.type === 'saved')
              ? handleUpdateAutoDeleteTimer
              : undefined
          }
          onPurgeExpiredMessages={handlePurgeExpiredMessages}
          stickerPacks={stickerPacks}
          customStickersByPack={customStickersByPack}
          onOpenStickerPackModal={(pack) => {
            setEditingStickerPack(pack || null);
            setShowStickerPackModal(true);
          }}
          scheduledMessages={activeChat ? scheduledByChatId[activeChat.id] || [] : []}
          onScheduleMessage={
            activeChat
              ? async (payload) => {
                  await scheduleMessage(currentUser, activeChat, payload);
                }
              : undefined
          }
          onSendScheduledNow={
            activeChat
              ? async (sched) => {
                  await dispatchScheduledMessageNow(currentUser, activeChat, sched);
                }
              : undefined
          }
          onRescheduleMessage={
            activeChat
              ? async (scheduledId, scheduledFor, newText) => {
                  await rescheduleMessage(activeChat.id, scheduledId, scheduledFor, newText);
                }
              : undefined
          }
          onCancelScheduledMessage={
            activeChat
              ? async (scheduledId) => {
                  await cancelScheduledMessage(activeChat.id, scheduledId);
                }
              : undefined
          }
          onSendMessageToWhatsApp={handleSendMessageToWhatsApp}
          draftText={activeChat ? draftsByChatId[activeChat.id] || '' : ''}
          onDraftChange={handleDraftChange}
          commentsByMessageId={commentsByMessageId}
          onOpenComments={(msg) => setCommentsModalMsg(msg)}
          onBatchDeleteMessages={async (msgs) => {
            if (!activeChat) return;
            await batchDeleteMessages(activeChat.id, msgs);
          }}
          onBatchForwardMessages={handleBatchForwardMessages}
          onStartCall={
            activeChat && activeChat.type === 'direct' && activePeerUser
              ? handleStartCall
              : undefined
          }
          jumpTargetMessage={jumpTargetMessage}
          onClearJumpTarget={() => setJumpTargetMessage(null)}
          onOpenGlobalAdvancedSearch={(initialQuery, chatId) =>
            setAdvancedSearchState({ open: true, initialQuery, initialChatId: chatId })
          }
        />
      </div>

      {showInfoDrawer && activeChat && (
        <ChatInfoDrawer
          chat={activeChat}
          chatItem={activeChatItem}
          currentUser={currentUser}
          peerUser={activePeerUser}
          members={activeMembers}
          allUsers={knownUsers}
          messages={activeMessages}
          onClose={() => setShowInfoDrawer(false)}
          onToggleMute={() => {
            if (activeChatItem) {
              void handleToggleMuteItem(activeChatItem);
            }
          }}
          onTogglePin={() => {
            if (activeChatItem) {
              void handleTogglePinItem(activeChatItem);
            }
          }}
          onToggleArchive={
            activeChatItem
              ? async () => {
                  await handleToggleArchiveItem(activeChatItem);
                }
              : undefined
          }
          onUpdateChatDetails={async (updates) => {
            await updateChatDetails(activeChat.id, updates);
          }}
          onUpdateChatPhoto={async (photoDataUrl) => {
            await updateChatPhoto(activeChat.id, photoDataUrl);
          }}
          onAddMember={async (user) => {
            await addMemberToChat(currentUser, activeChat, user);
          }}
          onToggleAdmin={async (member) => {
            await updateMemberRole(
              activeChat.id,
              member.uid,
              member.role === 'admin' ? 'member' : 'admin'
            );
          }}
          onRemoveMember={async (member) => {
            await removeMemberFromChat(activeChat, member.uid);
          }}
          onLeaveChat={async () => {
            await leaveChat(currentUser.uid, activeChat);
            setShowInfoDrawer(false);
            setActiveChatId(`saved_${currentUser.uid}`.slice(0, 128));
          }}
          onOpenImage={handleOpenImage}
          isBlockedByMe={isActiveBlockedByMe}
          isBlockedByPeer={isActiveBlockedByPeer}
          onBlockUser={handleBlockUser}
          onUnblockUser={handleUnblockUser}
          onDeleteChatForBoth={
            activeChat.type === 'direct'
              ? () => handleDeleteDirectChatForBoth(activeChat, activeDirectPeerUid)
              : undefined
          }
          onUpdateAutoDeleteTimer={
            activeChat.type === 'direct' || activeChat.type === 'saved'
              ? handleUpdateAutoDeleteTimer
              : undefined
          }
          onCreateOrRegenerateInvite={async () => {
            const code = await createOrRegenerateInviteLink(currentUser, activeChat);
            return `${window.location.origin}/?invite=${encodeURIComponent(code)}`;
          }}
          onRevokeInvite={async () => {
            await revokeInviteLink(activeChat);
          }}
          onOpenInviteQR={(inviteUrl, title) => {
            setQrModalData({
              title: `رمز الدعوة: ${title}`,
              subtitle: 'امسح الرمز للانضمام المباشر عبر رابط الدعوة',
              url: inviteUrl,
            });
          }}
          onUpdateAdvancedSettings={async (updates) => {
            await updateChatAdvancedSettings(activeChat.id, updates);
          }}
        />
      )}

      {showNewChatModal && (
        <NewChatModal
          currentUser={currentUser}
          allUsers={knownUsers}
          initialTab={newChatInitialTab}
          blockedByMeIds={blockedByMeIds}
          onClose={() => setShowNewChatModal(false)}
          onStartDirect={async (peer) => {
            const id = await startDirectChat(currentUser, peer);
            setActiveChatId(id);
            setActiveFolder('all');
          }}
          onCreateGroupOrChannel={async (params) => {
            const id = await createGroupOrChannel(currentUser, params);
            setActiveChatId(id);
            setActiveFolder('all');
          }}
        />
      )}

      {advancedSearchState.open && (
        <AdvancedSearchModal
          currentUser={currentUser}
          chatItems={chatItems}
          chatsById={chatsById}
          usersById={usersById}
          initialQuery={advancedSearchState.initialQuery}
          initialChatId={advancedSearchState.initialChatId}
          onClose={() => setAdvancedSearchState({ open: false })}
          onSelectChat={(chatId) => {
            const targetItem = chatItems.find((i) => i.chatId === chatId);
            if (targetItem?.folder === 'archived') {
              setActiveFolder('archived');
            }
            setActiveChatId(chatId);
            setShowInfoDrawer(false);
          }}
          onSelectMessage={(chatId, messageId) => {
            const targetItem = chatItems.find((i) => i.chatId === chatId);
            if (targetItem?.folder === 'archived') {
              setActiveFolder('archived');
            }
            setActiveChatId(chatId);
            setShowInfoDrawer(false);
            setJumpTargetMessage({ chatId, messageId, nonce: Date.now() });
          }}
        />
      )}

      {showDiscoverModal && (
        <DiscoverModal
          publicChats={publicChats}
          joinedChatIds={joinedChatIds}
          onClose={() => setShowDiscoverModal(false)}
          onJoinOrOpen={async (chat) => {
            await joinPublicChat(currentUser, chat);
            setActiveChatId(chat.id);
            setActiveFolder('all');
          }}
        />
      )}

      {showPollModal && activeChat && (
        <PollModal
          onClose={() => setShowPollModal(false)}
          onCreatePoll={async (question, options) => {
            await sendMessage(currentUser, activeChat, {
              type: 'poll',
              text: '',
              pollQuestion: question,
              pollOptions: options,
            });
          }}
        />
      )}

      {forwardingMessages.length > 0 && (
        <ForwardModal
          messages={forwardingMessages}
          chatItems={chatItems}
          chatsById={chatsById}
          onClose={() => setForwardingMessages([])}
          onForwardTo={async (targetChat) => {
            for (const msg of forwardingMessages) {
              await forwardMessage(currentUser, targetChat, msg);
            }
            setActiveChatId(targetChat.id);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          publicUser={currentUser}
          privateUser={privateUser}
          blockedUsers={blockedUsersList}
          onUnblockUser={handleUnblockUser}
          onClose={() => setShowSettingsModal(false)}
          onSaveProfile={async (updates) => {
            await updateUserProfile(currentUser, updates);
          }}
          onUpdatePhoto={async (photoDataUrl) => {
            await updateUserPhoto(currentUser.uid, photoDataUrl);
          }}
          onUpdatePrefs={async (updates) => {
            await updateUserPreferences(currentUser.uid, updates);
          }}
          onSignOut={async () => {
            listenersPausedRef.current = true;
            setListenersPaused(true);
            clearSessionToAuthScreen();
            setAuthNotice('تم تسجيل الخروج بنجاح.');
            try {
              await signOut(auth);
            } catch {
              showToastError('تعذر إتمام تسجيل الخروج بالكامل، يرجى المحاولة مرة أخرى');
            } finally {
              listenersPausedRef.current = false;
              setListenersPaused(false);
            }
          }}
          onDeleteAccount={async () => {
            const targetUid = currentUser.uid;
            listenersPausedRef.current = true;
            setListenersPaused(true);
            await new Promise((resolve) => window.setTimeout(resolve, 60));
            try {
              await deleteUserAccount(targetUid);
              clearSessionToAuthScreen();
              setAuthNotice('تم حذف حسابك نهائياً. يمكنك تسجيل الدخول بحساب Google في أي وقت.');
            } catch (err) {
              listenersPausedRef.current = false;
              setListenersPaused(false);
              throw err;
            }
            listenersPausedRef.current = false;
            setListenersPaused(false);
          }}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
          onOpenMyQR={() => {
            setQrModalData({
              title: `رمز QR لحساب ${currentUser.displayName}`,
              subtitle: `امسح الرمز لمراسلة @${currentUser.username} مباشرة على ZENO`,
              url: `${window.location.origin}/?addUser=${encodeURIComponent(currentUser.username)}`,
            });
          }}
          passcodeEnabled={passcodeEnabled}
          onOpenPasscodeSetup={() => setShowPasscodeSetup(true)}
          onLockApp={() => {
            setShowSettingsModal(false);
            setIsAppLocked(true);
          }}
        />
      )}

      {showPrivacyModal && (
        <PrivacyModal onClose={() => setShowPrivacyModal(false)} />
      )}

      {showStickerPackModal && (
        <StickerPackModal
          existingPack={
            editingStickerPack
              ? stickerPacks.find((p) => p.id === editingStickerPack.id) || editingStickerPack
              : null
          }
          existingStickers={
            editingStickerPack ? customStickersByPack[editingStickerPack.id] || [] : []
          }
          onClose={() => {
            setShowStickerPackModal(false);
            setEditingStickerPack(null);
          }}
          onCreatePack={async (title, stickers, coverDataUrl) => {
            await createStickerPack(currentUser.uid, title, stickers, coverDataUrl);
          }}
          onAddStickers={async (pack, stickers, coverDataUrl) => {
            await addStickersToPack(currentUser.uid, pack, stickers, coverDataUrl);
          }}
          onDeleteSticker={async (pack, stickerId) => {
            await deleteCustomSticker(pack, stickerId);
          }}
          onDeletePack={async (packId) => {
            await deleteStickerPack(packId);
          }}
        />
      )}

      {commentsModalMsg && activeChat && (
        <ChannelCommentsModal
          message={commentsModalMsg}
          comments={commentsByMessageId[commentsModalMsg.id] || []}
          currentUser={currentUser}
          canModerate={
            activeChat.ownerId === currentUser.uid ||
            activeMembers.some(
              (m) =>
                m.uid === currentUser.uid && (m.role === 'owner' || m.role === 'admin')
            )
          }
          allowComments={activeChat.allowComments !== false}
          onAddComment={async (text) => {
            await addChannelComment(currentUser, activeChat.id, commentsModalMsg.id, text);
          }}
          onDeleteComment={async (commentId) => {
            await deleteChannelComment(activeChat.id, commentId);
          }}
          onClose={() => setCommentsModalMsg(null)}
        />
      )}

      {activeCall && (
        <CallModal
          callId={activeCall.id}
          initialSession={activeCall}
          currentUser={currentUser}
          peerPhotoURL={
            activeCall.callerId === currentUser.uid
              ? usersById[activeCall.calleeId]?.photoURL
              : activeCall.callerPhotoURL || usersById[activeCall.callerId]?.photoURL
          }
          onClose={() => {
            dismissedCallIdsRef.current.add(activeCall.id);
            setActiveCall(null);
          }}
        />
      )}

      {qrModalData && (
        <QRCodeModal
          title={qrModalData.title}
          subtitle={qrModalData.subtitle}
          url={qrModalData.url}
          onClose={() => setQrModalData(null)}
        />
      )}

      {showPasscodeSetup && (
        <PasscodeSetupModal
          enabled={passcodeEnabled}
          onSavePin={async (pin) => {
            await setPasscode(currentUser.uid, pin);
            setPasscodeEnabled(true);
            setShowPasscodeSetup(false);
          }}
          onDisablePin={() => {
            clearPasscode(currentUser.uid);
            setPasscodeEnabled(false);
            setIsAppLocked(false);
            setShowPasscodeSetup(false);
          }}
          onClose={() => setShowPasscodeSetup(false)}
        />
      )}

      {pendingInvite && (
        <div
          className="animate-zeno-fade fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => !joiningInvite && setPendingInvite(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-zeno-modal w-full max-w-sm bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
              {pendingInvite.type === 'channel' ? (
                <Megaphone className="w-7 h-7" />
              ) : (
                <Users className="w-7 h-7" />
              )}
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2.5 py-0.5 rounded-full mb-2">
                <Link2 className="w-3 h-3" />
                <span>دعوة للانضمام</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {pendingInvite.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {pendingInvite.type === 'channel' ? 'قناة' : 'مجموعة'} • {pendingInvite.memberCount} عضو
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={joiningInvite}
                onClick={async () => {
                  setJoiningInvite(true);
                  try {
                    const joinedId = await joinChatByInvite(currentUser, pendingInvite);
                    setActiveChatId(joinedId);
                    setActiveFolder('all');
                    setPendingInvite(null);
                  } catch (err) {
                    showToastError(
                      err instanceof Error ? err.message : 'تعذر الانضمام عبر رابط الدعوة'
                    );
                  } finally {
                    setJoiningInvite(false);
                  }
                }}
                className="flex-1 h-10 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {joiningInvite ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>انضمام الآن</span>
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={joiningInvite}
                onClick={() => setPendingInvite(null)}
                className="flex-1 h-10 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {isAppLocked && passcodeEnabled && (
        <PasscodeLockScreen
          uid={currentUser.uid}
          displayName={currentUser.displayName}
          onUnlock={() => setIsAppLocked(false)}
          onSignOut={() => {
            clearSessionToAuthScreen();
            void signOut(auth);
          }}
        />
      )}

      {lightboxState && (
        <ImageLightbox gallery={lightboxState} onClose={() => setLightboxState(null)} />
      )}

      {toastError && (
        <div className="animate-zeno-slide-down fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl bg-red-600 text-white shadow-xl flex items-center justify-between gap-3 text-xs font-medium">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{toastError}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastError(null)}
            aria-label="إغلاق التنبيه"
            className="p-1 rounded-lg hover:bg-white/15 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {toastNotice && !toastError && (
        <div className="animate-zeno-slide-down fixed bottom-5 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)] px-4 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#1e2c3a] text-white shadow-2xl border border-slate-700/70 flex items-center justify-between gap-3 text-xs font-medium">
          <div className="flex items-center gap-2 min-w-0">
            <Archive className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="truncate">{toastNotice.message}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {toastNotice.onUndo && toastNotice.undoLabel && (
              <button
                type="button"
                onClick={() => {
                  const fn = toastNotice.onUndo;
                  setToastNotice(null);
                  fn?.();
                }}
                className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold cursor-pointer transition-colors"
              >
                {toastNotice.undoLabel}
              </button>
            )}
            <button
              type="button"
              onClick={() => setToastNotice(null)}
              aria-label="إغلاق الإشعار"
              className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {toastNotification && (
        <div className="animate-zeno-slide-down fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] p-3 rounded-2xl bg-white dark:bg-[#17212b] border border-sky-200 dark:border-sky-800/70 shadow-2xl flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveChatId(toastNotification.chatId);
              setShowInfoDrawer(false);
              setToastNotification(null);
            }}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-start cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Bell className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {toastNotification.title}
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                {toastNotification.body}
              </div>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setToastNotification(null)}
              aria-label="إغلاق الإشعار"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {privateUser.notificationsEnabled && notifPermission === 'default' && !dismissedNotifBanner && !toastNotification && (
        <div className="animate-zeno-slide-down fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)] px-3.5 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-[#1e2c3a] text-white shadow-2xl border border-slate-700/70 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-xs font-medium truncate">
              فعّل الإشعارات لاستلام تنبيهات الرسائل على جهازك
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={async () => {
                const perm = await requestAppNotificationPermission();
                setNotifPermission(perm);
                if (perm !== 'default') {
                  setDismissedNotifBanner(true);
                }
              }}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-xs font-semibold cursor-pointer"
            >
              تفعيل الإشعارات
            </button>
            <button
              type="button"
              onClick={() => setDismissedNotifBanner(true)}
              aria-label="إغلاق"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {quotaReadOnlyMode && !dismissedQuotaBanner && !toastError && (
        <div className="animate-zeno-slide-down fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-1.5rem)] px-3.5 py-2.5 rounded-2xl bg-amber-600 text-white shadow-xl flex items-center justify-between gap-2.5 text-xs font-medium">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="leading-snug">
              {readQuotaLimited
                ? 'وضع التصفح المحلي: انتهت الحصة اليومية المجانية لقاعدة البيانات وتُعاد تلقائياً غداً.'
                : 'الوضع للقراءة مؤقتاً: انتهت الحصة اليومية المجانية للكتابة في قاعدة البيانات وتُعاد تلقائياً غداً.'}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                clearWriteQuotaCooldown();
                clearReadQuotaCooldown();
                setReadQuotaLimited(false);
                setQuotaReadOnlyMode(false);
                listenersPausedRef.current = false;
                setListenersPaused(false);
              }}
              className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-[11px] font-semibold cursor-pointer"
            >
              إعادة تجربة
            </button>
            <button
              type="button"
              onClick={() => setDismissedQuotaBanner(true)}
              aria-label="إغلاق"
              className="p-1 rounded-lg hover:bg-white/15 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BarqiyahApp />
    </ErrorBoundary>
  );
}
