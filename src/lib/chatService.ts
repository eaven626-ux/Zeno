import { deleteUser, signOut, User } from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteDoc,
  deleteField,
  doc,
  DocumentReference,
  DocumentSnapshot,
  getDoc,
  getDocFromCache,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';
import {
  auth,
  db,
  formatAppErrorMessage,
  handleFirestoreError,
  isFirestoreQuotaError,
  isFirestoreUnavailableError,
  isReadQuotaCooldownActive,
  isWriteQuotaCooldownActive,
  markReadQuotaCooldown,
  markWriteQuotaCooldown,
  OperationType,
  storage,
  tsToMillis,
} from './firebase';
import {
  deleteCachedMediaBlob,
  getCachedMediaBlob,
  setCachedMediaBlob,
} from './mediaCache';

let storageKnownUnavailable = false;

export function resetStorageAvailabilityFlag(): void {
  storageKnownUnavailable = false;
}

const STORAGE_TERMINAL_ERROR_CODES = new Set([
  'storage/unauthorized',
  'storage/unauthenticated',
  'storage/bucket-not-found',
  'storage/project-not-found',
  'storage/unknown',
  'storage/retry-limit-exceeded',
]);

async function tryUploadBlobToStorage(
  objectPath: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<string | null> {
  const activeStorage = storage;
  if (!activeStorage || storageKnownUnavailable) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let madeProgress = false;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      if (stallTimer) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
      resolve(url);
    };

    try {
      const targetRef = storageRef(activeStorage, objectPath);
      const task = uploadBytesResumable(targetRef, blob, {
        contentType: contentType || blob.type || 'application/octet-stream',
      });

      const resetStallTimer = (ms: number, markUnavailableOnTimeout: boolean) => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          if (settled) return;
          if (markUnavailableOnTimeout) {
            storageKnownUnavailable = true;
          }
          try {
            task.cancel();
          } catch {
            // Ignore cancel errors
          }
          finish(null);
        }, ms);
      };

      // If Storage bucket isn't provisioned or CORS blocks initial handshake, abort fast
      resetStallTimer(4000, true);

      task.on(
        'state_changed',
        (snapshot) => {
          if (settled) return;
          if (snapshot.bytesTransferred > 0 && !madeProgress) {
            madeProgress = true;
            resetStallTimer(45000, false);
          } else if (madeProgress) {
            resetStallTimer(45000, false);
          }
          if (snapshot.totalBytes > 0) {
            const pct = Math.min(99, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
            onProgress?.(pct);
          }
        },
        (err) => {
          const code = (err as { code?: string })?.code || '';
          if (!madeProgress || STORAGE_TERMINAL_ERROR_CODES.has(code)) {
            storageKnownUnavailable = true;
          }
          finish(null);
        },
        async () => {
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            finish(url);
          } catch {
            finish(null);
          }
        }
      );
    } catch {
      storageKnownUnavailable = true;
      finish(null);
    }
  });
}

async function tryDeleteStorageByUrl(url: string | undefined): Promise<void> {
  if (!storage || !url || !/^https?:\/\//i.test(url)) return;
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // Best-effort cleanup (object may already be deleted or inaccessible)
  }
}
import {
  blobToDataUrl,
  dataUrlToBlob,
  dataUrlToObjectUrl,
  formatAutoDeleteLabel,
  formatFileSize,
  MAX_FILE_BYTES,
  MAX_STORY_VIDEO_BYTES,
  MAX_STORY_VIDEO_DURATION_SEC,
} from './mediaUtils';
import { normalizePhoneDigits } from './whatsapp';
import {
  ChannelComment,
  Chat,
  ChatMember,
  ChatType,
  CustomSticker,
  FolderKey,
  InviteLink,
  MemberRole,
  Message,
  MessageType,
  PrivateUser,
  PublicUser,
  ScheduledMessage,
  StickerAnimation,
  StickerPack,
  Story,
  StoryView,
  UserBlock,
  UserChatItem,
} from '../types/telegram';

function makeSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now()}_${randomPart}`;
}

export function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 32);
}

function buildDefaultUsername(user: User): string {
  const uidClean = user.uid.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `user_${uidClean.slice(0, 12) || 'zeno'}`;
}

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function safeDisplayName(value: string | undefined, fallback = 'مستخدم ZENO', maxLen = 80): string {
  const cleaned = clampString(value || '', maxLen);
  return cleaned || fallback;
}

function safePhotoUrl(url: string | undefined): string | undefined {
  return url && url.length <= 150000 ? url : undefined;
}

function safeUsername(username: string | undefined): string | undefined {
  const cleaned = normalizeUsernameInput(username || '');
  return cleaned.length >= 1 ? cleaned : undefined;
}

export async function checkUsernameAvailability(
  rawUsername: string,
  currentUid?: string
): Promise<{
  valid: boolean;
  available: boolean;
  isOwn: boolean;
  normalized: string;
  reason?: string;
}> {
  const normalized = normalizeUsernameInput(rawUsername);
  if (normalized.length < 3 || normalized.length > 32 || !/^[a-z0-9_]+$/.test(normalized)) {
    return {
      valid: false,
      available: false,
      isOwn: false,
      normalized,
      reason: 'يجب أن يتكون اليوزر من 3 إلى 32 حرفاً إنجليزياً أو رقماً أو _ فقط',
    };
  }

  try {
    const reservationSnap = await getDoc(doc(db, 'usernames', normalized));
    if (reservationSnap.exists()) {
      const ownerUid = String(reservationSnap.data().uid || '');
      if (currentUid && ownerUid === currentUid) {
        return { valid: true, available: true, isOwn: true, normalized };
      }
      return {
        valid: true,
        available: false,
        isOwn: false,
        normalized,
        reason: 'هذا اليوزر محجوز لمستخدم آخر',
      };
    }

    // Fallback check against legacy users_public docs before reservation migration
    const legacySnap = await getDocs(
      query(
        collection(db, 'users_public'),
        where('isDiscoverable', '==', true),
        where('username', '==', normalized),
        limit(1)
      )
    );
    if (!legacySnap.empty) {
      const docOwner = legacySnap.docs[0].id;
      if (currentUid && docOwner === currentUid) {
        return { valid: true, available: true, isOwn: true, normalized };
      }
      return {
        valid: true,
        available: false,
        isOwn: false,
        normalized,
        reason: 'هذا اليوزر محجوز لمستخدم آخر',
      };
    }

    return { valid: true, available: true, isOwn: false, normalized };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `usernames/${normalized}`);
  }
}

export async function findUserByExactUsername(rawUsername: string): Promise<PublicUser | null> {
  const normalized = normalizeUsernameInput(rawUsername);
  if (normalized.length < 3) return null;

  try {
    const reservationSnap = await getDoc(doc(db, 'usernames', normalized));
    if (reservationSnap.exists()) {
      const ownerUid = String(reservationSnap.data().uid || '');
      if (ownerUid) {
        const pubSnap = await getDoc(doc(db, 'users_public', ownerUid));
        if (pubSnap.exists()) {
          const d = pubSnap.data();
          if (d.isDiscoverable === false) return null;
          return {
            uid: String(d.uid),
            displayName: String(d.displayName || 'مستخدم ZENO'),
            username: String(d.username || normalized),
            photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
            bio: typeof d.bio === 'string' ? d.bio : '',
            isDiscoverable: Boolean(d.isDiscoverable),
            lastSeen: tsToMillis(d.lastSeen),
            createdAt: tsToMillis(d.createdAt),
          };
        }
      }
    }

    const fallbackSnap = await getDocs(
      query(
        collection(db, 'users_public'),
        where('isDiscoverable', '==', true),
        where('username', '==', normalized),
        limit(1)
      )
    );
    if (!fallbackSnap.empty) {
      const d = fallbackSnap.docs[0].data();
      return {
        uid: String(d.uid),
        displayName: String(d.displayName || 'مستخدم ZENO'),
        username: String(d.username || normalized),
        photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
        bio: typeof d.bio === 'string' ? d.bio : '',
        isDiscoverable: Boolean(d.isDiscoverable),
        lastSeen: tsToMillis(d.lastSeen),
        createdAt: tsToMillis(d.createdAt),
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchPublicUsersByIds(uids: string[]): Promise<PublicUser[]> {
  const unique = Array.from(new Set(uids.filter((u) => Boolean(u) && /^[a-zA-Z0-9_-]{1,128}$/.test(u))));
  if (unique.length === 0) return [];
  const results = await Promise.all(
    unique.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users_public', uid));
        if (!snap.exists()) return null;
        const d = snap.data();
        return {
          uid: String(d.uid || uid),
          displayName: String(d.displayName || 'مستخدم ZENO'),
          username: String(d.username || ''),
          photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
          bio: typeof d.bio === 'string' ? d.bio : '',
          isDiscoverable: Boolean(d.isDiscoverable),
          lastSeen: tsToMillis(d.lastSeen),
          createdAt: tsToMillis(d.createdAt),
        } as PublicUser;
      } catch {
        return null;
      }
    })
  );
  return results.filter((u): u is PublicUser => Boolean(u));
}

async function getDocWithCacheFallback(ref: DocumentReference) {
  try {
    return await getDoc(ref);
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      try {
        return await getDocFromCache(ref);
      } catch {
        // Not in local cache
      }
    } else if (isFirestoreUnavailableError(error)) {
      try {
        return await getDocFromCache(ref);
      } catch {
        // Not in local cache
      }
    }
    throw error;
  }
}

async function getImmutableChunkDoc(ref: DocumentReference): Promise<DocumentSnapshot> {
  try {
    const cached = await getDocFromCache(ref);
    if (cached.exists()) {
      return cached;
    }
  } catch {
    // Cache miss — fetch from server if read quota is available
  }
  if (isReadQuotaCooldownActive()) {
    throw new Error(
      'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.'
    );
  }
  return getDoc(ref);
}

const DISCOVER_CACHE_KEY = 'zeno_discover_users_cache_v1';
const DISCOVER_CACHE_TTL_MS = 15 * 60 * 1000;

export async function fetchDiscoverableUsers(maxUsers = 30): Promise<PublicUser[]> {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(DISCOVER_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { savedAt?: number; users?: PublicUser[] };
        if (
          parsed &&
          typeof parsed.savedAt === 'number' &&
          Array.isArray(parsed.users) &&
          Date.now() - parsed.savedAt < DISCOVER_CACHE_TTL_MS &&
          parsed.users.length > 0
        ) {
          return parsed.users.slice(0, maxUsers);
        }
      }
    }
  } catch {
    // Ignore storage parse issues
  }

  if (isReadQuotaCooldownActive()) {
    return [];
  }

  try {
    const snap = await getDocs(
      query(
        collection(db, 'users_public'),
        where('isDiscoverable', '==', true),
        limit(maxUsers)
      )
    );
    const list = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          uid: String(d.uid || docSnap.id),
          displayName: String(d.displayName || 'مستخدم ZENO'),
          username: String(d.username || ''),
          photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
          bio: typeof d.bio === 'string' ? d.bio : '',
          isDiscoverable: Boolean(d.isDiscoverable),
          lastSeen: tsToMillis(d.lastSeen),
          createdAt: tsToMillis(d.createdAt),
        } as PublicUser;
      })
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

    try {
      if (typeof sessionStorage !== 'undefined' && list.length > 0) {
        sessionStorage.setItem(
          DISCOVER_CACHE_KEY,
          JSON.stringify({ savedAt: Date.now(), users: list })
        );
      }
    } catch {
      // Ignore storage write issues
    }
    return list;
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
    }
    return [];
  }
}

export async function syncUserOnSignIn(user: User): Promise<{
  publicUser: PublicUser;
  privateUser: PrivateUser;
  quotaReadOnly?: boolean;
}> {
  resetStorageAvailabilityFlag();
  const publicPath = `users_public/${user.uid}`;
  const privatePath = `users_private/${user.uid}`;

  const displayName = clampString(user.displayName || 'مستخدم ZENO', 80);
  const photoURL = user.photoURL && user.photoURL.length <= 150000 ? user.photoURL : undefined;

  const publicRef = doc(db, 'users_public', user.uid);
  let quotaReadOnly = isWriteQuotaCooldownActive() || isReadQuotaCooldownActive();
  let preloadedPublicSnap: DocumentSnapshot | null = null;
  try {
    preloadedPublicSnap = await getDocWithCacheFallback(publicRef);
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      quotaReadOnly = true;
    } else if (isFirestoreUnavailableError(error)) {
      // Allow app entry in offline mode if backend is temporarily unreachable
      preloadedPublicSnap = null;
    } else {
      handleFirestoreError(error, OperationType.GET, publicPath);
    }
  }

  if (!preloadedPublicSnap) {
    // Read quota exceeded on initial sign-in without cached profile — allow app entry in offline/cached mode
    return {
      publicUser: {
        uid: user.uid,
        displayName,
        username: buildDefaultUsername(user),
        photoURL,
        bio: 'متاح على ZENO',
        isDiscoverable: true,
        lastSeen: Date.now(),
        createdAt: Date.now(),
      },
      privateUser: {
        uid: user.uid,
        email: clampString(user.email || '', 254),
        theme: 'light',
        fontSize: 'medium',
        notificationsEnabled: true,
        phoneNumber: '',
        whatsappEnabled: false,
        phoneDiscoverable: false,
        updatedAt: Date.now(),
      },
      quotaReadOnly,
    };
  }

  const legacyBios = new Set(['متاح على تبليغات هندسة النفط', 'متاح على برقية']);
  let needsPublicWrite = !preloadedPublicSnap.exists();

  if (preloadedPublicSnap.exists()) {
    const existing = preloadedPublicSnap.data();
    const emailLocal = (user.email?.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
    const existingUsername = typeof existing.username === 'string' ? existing.username : '';
    const hasEmailDerivedUsername = Boolean(
      emailLocal && existingUsername.startsWith(`${emailLocal.slice(0, 20)}_`)
    );
    const hasLegacyBio = typeof existing.bio === 'string' && legacyBios.has(existing.bio.trim());
    const missingDisplayName = !existing.displayName;
    const missingPhoto = Boolean(photoURL && !existing.photoURL);
    const missingDiscoverable = existing.isDiscoverable === undefined;

    needsPublicWrite =
      !existingUsername ||
      hasEmailDerivedUsername ||
      hasLegacyBio ||
      missingDisplayName ||
      missingPhoto ||
      missingDiscoverable;
  }

  const runPublicUserSync = async () => {
    await runTransaction(db, async (tx) => {
      const publicSnap = await tx.get(publicRef);

      if (!publicSnap.exists()) {
        const defaultUsername = buildDefaultUsername(user);
        const defaultResRef = doc(db, 'usernames', defaultUsername);
        const defaultResSnap = await tx.get(defaultResRef);

        let finalUsername = defaultUsername;
        let finalResRef = defaultResRef;
        if (defaultResSnap.exists() && defaultResSnap.data().uid !== user.uid) {
          finalUsername = `${defaultUsername.slice(0, 24)}_${Date.now().toString(36).slice(-5)}`;
          finalResRef = doc(db, 'usernames', finalUsername);
        }

        const payload: Record<string, unknown> = {
          uid: user.uid,
          displayName,
          username: finalUsername,
          bio: 'متاح على ZENO',
          isDiscoverable: true,
          lastSeen: serverTimestamp(),
          createdAt: serverTimestamp(),
        };
        if (photoURL) payload.photoURL = photoURL;

        tx.set(finalResRef, {
          username: finalUsername,
          uid: user.uid,
          createdAt: serverTimestamp(),
        });
        tx.set(publicRef, payload);
      } else {
        const existing = publicSnap.data();
        const emailLocal = (user.email?.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        const existingUsername = typeof existing.username === 'string' ? existing.username : '';
        const hasEmailDerivedUsername = Boolean(
          emailLocal && existingUsername.startsWith(`${emailLocal.slice(0, 20)}_`)
        );
        const normalizedBio =
          typeof existing.bio === 'string' && legacyBios.has(existing.bio.trim())
            ? 'متاح على ZENO'
            : (existing.bio ?? '');

        let targetUsername =
          !existingUsername || hasEmailDerivedUsername ? buildDefaultUsername(user) : existingUsername;
        let targetResRef = doc(db, 'usernames', targetUsername);
        const targetResSnap = await tx.get(targetResRef);

        if (targetResSnap.exists() && targetResSnap.data().uid !== user.uid) {
          targetUsername = `${buildDefaultUsername(user).slice(0, 24)}_${Date.now().toString(36).slice(-5)}`;
          targetResRef = doc(db, 'usernames', targetUsername);
        }

        let oldResRefToDelete: ReturnType<typeof doc> | null = null;
        if (existingUsername && existingUsername !== targetUsername) {
          const oldResRef = doc(db, 'usernames', existingUsername);
          const oldResSnap = await tx.get(oldResRef);
          if (oldResSnap.exists() && oldResSnap.data().uid === user.uid) {
            oldResRefToDelete = oldResRef;
          }
        }

        const updatePayload: Record<string, unknown> = {
          displayName: existing.displayName || displayName,
          username: targetUsername,
          bio: normalizedBio,
          isDiscoverable: existing.isDiscoverable ?? true,
          lastSeen: serverTimestamp(),
        };
        if (existing.photoURL || photoURL) {
          updatePayload.photoURL = existing.photoURL || photoURL;
        }

        if (oldResRefToDelete) {
          tx.delete(oldResRefToDelete);
        }
        if (!targetResSnap.exists() || targetUsername !== existingUsername) {
          tx.set(targetResRef, {
            username: targetUsername,
            uid: user.uid,
            createdAt: serverTimestamp(),
          });
        }
        tx.update(publicRef, updatePayload);
      }
    });
  };

  let didWritePublic = false;
  if (needsPublicWrite && !(preloadedPublicSnap.exists() && isWriteQuotaCooldownActive())) {
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await runPublicUserSync();
          lastErr = undefined;
          didWritePublic = true;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err || '');
          const isTransient =
            msg.includes('Connection failed') ||
            msg.includes('unavailable') ||
            msg.includes('offline');
          if (!isTransient || attempt === 2) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }
      if (lastErr) {
        throw lastErr;
      }
    } catch (error) {
      if (isFirestoreQuotaError(error)) {
        markWriteQuotaCooldown();
        quotaReadOnly = true;
        if (!preloadedPublicSnap.exists()) {
          handleFirestoreError(error, OperationType.WRITE, publicPath);
        }
      } else if (isFirestoreUnavailableError(error) && preloadedPublicSnap.exists()) {
        // Keep cached session active while backend reconnects
      } else {
        handleFirestoreError(error, OperationType.WRITE, publicPath);
      }
    }
  }

  let privateSnap: DocumentSnapshot | null = null;
  try {
    privateSnap = await getDocWithCacheFallback(doc(db, 'users_private', user.uid));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      quotaReadOnly = true;
    } else if (!isFirestoreUnavailableError(error)) {
      handleFirestoreError(error, OperationType.GET, privatePath);
    }
  }

  let didWritePrivate = false;
  if (privateSnap && !privateSnap.exists() && !isWriteQuotaCooldownActive() && !isReadQuotaCooldownActive()) {
    try {
      await setDoc(doc(db, 'users_private', user.uid), {
        uid: user.uid,
        email: clampString(user.email || '', 254),
        theme: 'light',
        fontSize: 'medium',
        notificationsEnabled: true,
        updatedAt: serverTimestamp(),
      });
      didWritePrivate = true;
    } catch (error) {
      if (isFirestoreQuotaError(error) && preloadedPublicSnap.exists()) {
        markWriteQuotaCooldown();
        quotaReadOnly = true;
      } else {
        handleFirestoreError(error, OperationType.CREATE, privatePath);
      }
    }
  }

  // Ensure "Saved Messages" (الرسائل المحفوظة) personal cloud chat exists
  const savedChatId = `saved_${user.uid}`.slice(0, 128);
  let savedSnap: DocumentSnapshot | null = null;
  try {
    savedSnap = await getDocWithCacheFallback(doc(db, 'chats', savedChatId));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      quotaReadOnly = true;
    } else if (!isFirestoreUnavailableError(error)) {
      handleFirestoreError(error, OperationType.GET, `chats/${savedChatId}`);
    }
  }

  if (savedSnap && !savedSnap.exists() && !isWriteQuotaCooldownActive() && !isReadQuotaCooldownActive()) {
    try {
      const batch = writeBatch(db);
      const welcomeMsgId = makeSafeId('msg');
      const welcomeText = 'مرحباً بك في الرسائل المحفوظة! يمكنك هنا حفظ الملاحظات، الصور، المقاطع الصوتية، أو تحويل أي رسالة من محادثاتك.';

      batch.set(doc(db, 'chats', savedChatId), {
        id: savedChatId,
        type: 'saved',
        title: 'الرسائل المحفوظة',
        description: 'مساحتك السحابية الشخصية لحفظ الملاحظات والرسائل والوسائط.',
        isPublic: false,
        ownerId: user.uid,
        memberCount: 1,
        lastMessageText: clampString(welcomeText, 300),
        lastMessageSenderId: user.uid,
        lastMessageSenderName: displayName,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const memberPayload: Record<string, unknown> = {
        uid: user.uid,
        chatId: savedChatId,
        role: 'owner',
        displayName,
        joinedAt: serverTimestamp(),
      };
      if (photoURL) memberPayload.photoURL = photoURL;
      batch.set(doc(db, 'chats', savedChatId, 'members', user.uid), memberPayload);

      batch.set(doc(db, 'user_chats', user.uid, 'items', savedChatId), {
        chatId: savedChatId,
        userId: user.uid,
        type: 'saved',
        title: 'الرسائل المحفوظة',
        folder: 'personal',
        pinned: true,
        muted: false,
        createdBy: user.uid,
        lastReadAt: serverTimestamp(),
        joinedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'chats', savedChatId, 'messages', welcomeMsgId), {
        id: welcomeMsgId,
        chatId: savedChatId,
        senderId: user.uid,
        senderName: displayName,
        ...(photoURL ? { senderPhotoURL: photoURL } : {}),
        type: 'text',
        text: welcomeText,
        isDeleted: false,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (error) {
      if (isFirestoreQuotaError(error) && preloadedPublicSnap.exists()) {
        markWriteQuotaCooldown();
        quotaReadOnly = true;
      } else {
        handleFirestoreError(error, OperationType.WRITE, `chats/${savedChatId}`);
      }
    }
  }

  const [freshPublic, freshPrivate] = await Promise.all([
    didWritePublic ? getDocWithCacheFallback(publicRef).catch(() => preloadedPublicSnap) : Promise.resolve(preloadedPublicSnap),
    didWritePrivate && privateSnap
      ? getDocWithCacheFallback(doc(db, 'users_private', user.uid)).catch(() => privateSnap)
      : Promise.resolve(privateSnap),
  ]);

  const pubData = freshPublic?.data() || {};
  const privData = freshPrivate?.data() || {};

  return {
    publicUser: {
      uid: user.uid,
      displayName: pubData.displayName || displayName,
      username: pubData.username || buildDefaultUsername(user),
      photoURL: pubData.photoURL,
      bio: pubData.bio || '',
      isDiscoverable: pubData.isDiscoverable ?? true,
      lastSeen: tsToMillis(pubData.lastSeen),
      createdAt: tsToMillis(pubData.createdAt),
    },
    privateUser: {
      uid: user.uid,
      email: privData.email || user.email || '',
      theme: privData.theme || 'light',
      fontSize: privData.fontSize || 'medium',
      notificationsEnabled: privData.notificationsEnabled ?? true,
      phoneNumber: typeof privData.phoneNumber === 'string' ? privData.phoneNumber : '',
      whatsappEnabled: typeof privData.whatsappEnabled === 'boolean' ? privData.whatsappEnabled : false,
      phoneDiscoverable: typeof privData.phoneDiscoverable === 'boolean' ? privData.phoneDiscoverable : false,
      updatedAt: tsToMillis(privData.updatedAt),
    },
    quotaReadOnly,
  };
}

export async function pingPresence(user: PublicUser): Promise<void> {
  if (isWriteQuotaCooldownActive()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try {
    await updateDoc(doc(db, 'users_public', user.uid), {
      lastSeen: serverTimestamp(),
    });
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markWriteQuotaCooldown();
    }
    // Non-blocking heartbeat
  }
}

export async function updateUserProfile(
  user: PublicUser,
  updates: { displayName: string; username: string; bio: string }
): Promise<void> {
  const cleanName = clampString(updates.displayName, 80);
  const cleanUsername = normalizeUsernameInput(updates.username);

  if (!cleanName) throw new Error('يرجى إدخال الاسم');
  if (cleanUsername.length < 3 || !/^[a-z0-9_]+$/.test(cleanUsername)) {
    throw new Error('اليوزر يجب أن يتكون من 3 إلى 32 حرفاً إنجليزياً أو رقماً أو _');
  }

  const availability = await checkUsernameAvailability(cleanUsername, user.uid);
  if (!availability.available) {
    throw new Error(availability.reason || 'هذا اليوزر محجوز لمستخدم آخر');
  }

  try {
    await runTransaction(db, async (tx) => {
      const publicRef = doc(db, 'users_public', user.uid);
      const publicSnap = await tx.get(publicRef);
      if (!publicSnap.exists()) {
        throw new Error('تعذر العثور على ملف المستخدم');
      }

      const existingUsername = String(publicSnap.data().username || '');
      const newResRef = doc(db, 'usernames', cleanUsername);
      const newResSnap = await tx.get(newResRef);

      if (newResSnap.exists() && newResSnap.data().uid !== user.uid) {
        throw new Error('هذا اليوزر محجوز لمستخدم آخر، يرجى اختيار يوزر مختلف');
      }

      let oldResToDelete: ReturnType<typeof doc> | null = null;
      if (existingUsername && existingUsername !== cleanUsername) {
        const oldResRef = doc(db, 'usernames', existingUsername);
        const oldResSnap = await tx.get(oldResRef);
        if (oldResSnap.exists() && oldResSnap.data().uid === user.uid) {
          oldResToDelete = oldResRef;
        }
      }

      if (oldResToDelete) {
        tx.delete(oldResToDelete);
      }
      if (!newResSnap.exists()) {
        tx.set(newResRef, {
          username: cleanUsername,
          uid: user.uid,
          createdAt: serverTimestamp(),
        });
      }

      tx.update(publicRef, {
        displayName: cleanName,
        username: cleanUsername,
        bio: clampString(updates.bio, 200),
        lastSeen: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('محجوز')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${user.uid}`);
  }
}

export async function updateUserPhoto(
  uid: string,
  photoDataUrl: string | null
): Promise<void> {
  if (photoDataUrl && photoDataUrl.length > 150000) {
    throw new Error('حجم الصورة كبير جداً، يرجى اختيار صورة أصغر');
  }
  try {
    await updateDoc(doc(db, 'users_public', uid), {
      photoURL: photoDataUrl ? photoDataUrl : deleteField(),
      lastSeen: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_public/${uid}`);
  }
}

export async function updateUserPreferences(
  uid: string,
  updates: Partial<Pick<PrivateUser, 'theme' | 'fontSize' | 'notificationsEnabled' | 'whatsappEnabled'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'users_private', uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users_private/${uid}`);
  }
}

export async function blockUser(blockerUid: string, blockedUid: string): Promise<void> {
  if (!blockerUid || !blockedUid || blockerUid === blockedUid) return;
  const blockId = `${blockerUid}_${blockedUid}`;
  try {
    await setDoc(doc(db, 'user_blocks', blockId), {
      id: blockId,
      blockerUid,
      blockedUid,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `user_blocks/${blockId}`);
  }
}

export async function unblockUser(blockerUid: string, blockedUid: string): Promise<void> {
  if (!blockerUid || !blockedUid || blockerUid === blockedUid) return;
  const blockId = `${blockerUid}_${blockedUid}`;
  try {
    await deleteDoc(doc(db, 'user_blocks', blockId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `user_blocks/${blockId}`);
  }
}

export async function isDirectPairBlocked(
  uidA: string,
  uidB: string
): Promise<{ blockedByMe: boolean; blockedByPeer: boolean }> {
  try {
    const [myBlockSnap, peerBlockSnap] = await Promise.all([
      getDoc(doc(db, 'user_blocks', `${uidA}_${uidB}`)),
      getDoc(doc(db, 'user_blocks', `${uidB}_${uidA}`)),
    ]);
    return {
      blockedByMe: myBlockSnap.exists(),
      blockedByPeer: peerBlockSnap.exists(),
    };
  } catch {
    return { blockedByMe: false, blockedByPeer: false };
  }
}

export function mapUserBlock(data: Record<string, unknown>, id: string): UserBlock {
  return {
    id,
    blockerUid: String(data.blockerUid || ''),
    blockedUid: String(data.blockedUid || ''),
    createdAt: tsToMillis(data.createdAt),
  };
}

export async function deleteUserAccount(uid: string): Promise<void> {
  const savedChatId = `saved_${uid}`.slice(0, 128);
  let savedExists = false;
  let ownedUsername = '';
  let ownedPhoneDigits = '';
  let myBlockIds: string[] = [];
  let myUserChatIds: string[] = [];
  try {
    const [savedSnap, publicSnap, privateSnap, blocksSnap, userChatsSnap] = await Promise.all([
      getDoc(doc(db, 'chats', savedChatId)),
      getDoc(doc(db, 'users_public', uid)),
      getDoc(doc(db, 'users_private', uid)),
      getDocs(query(collection(db, 'user_blocks'), where('blockerUid', '==', uid))),
      getDocs(collection(db, 'user_chats', uid, 'items')),
    ]);
    savedExists = savedSnap.exists();
    myBlockIds = blocksSnap.docs.map((d) => d.id);
    myUserChatIds = userChatsSnap.docs.map((d) => d.id);
    if (!myUserChatIds.includes(savedChatId)) {
      myUserChatIds.push(savedChatId);
    }
    if (publicSnap.exists() && typeof publicSnap.data().username === 'string') {
      const candidate = publicSnap.data().username;
      const resSnap = await getDoc(doc(db, 'usernames', candidate));
      if (resSnap.exists() && resSnap.data().uid === uid) {
        ownedUsername = candidate;
      }
    }
    if (privateSnap.exists() && typeof privateSnap.data().phoneNumber === 'string') {
      const candidateDigits = normalizePhoneDigits(privateSnap.data().phoneNumber);
      if (candidateDigits.length >= 7) {
        const phoneSnap = await getDoc(doc(db, 'phone_numbers', candidateDigits));
        if (phoneSnap.exists() && phoneSnap.data().uid === uid) {
          ownedPhoneDigits = candidateDigits;
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `chats/${savedChatId}`);
  }

  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users_public', uid));
    batch.delete(doc(db, 'users_private', uid));
    for (const chatId of myUserChatIds) {
      batch.delete(doc(db, 'user_chats', uid, 'items', chatId));
    }
    if (ownedUsername) {
      batch.delete(doc(db, 'usernames', ownedUsername));
    }
    if (ownedPhoneDigits) {
      batch.delete(doc(db, 'phone_numbers', ownedPhoneDigits));
    }
    for (const blockId of myBlockIds) {
      batch.delete(doc(db, 'user_blocks', blockId));
    }
    if (savedExists) {
      batch.delete(doc(db, 'chats', savedChatId));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users_private/${uid}`);
  }

  if (auth.currentUser && auth.currentUser.uid === uid) {
    try {
      await deleteUser(auth.currentUser);
    } catch {
      await signOut(auth);
    }
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // Ignore secondary signOut failure
      }
    }
  }
}

export async function startDirectChat(
  currentUser: PublicUser,
  peerUser: PublicUser
): Promise<string> {
  if (currentUser.uid === peerUser.uid) {
    return `saved_${currentUser.uid}`.slice(0, 128);
  }

  const [first, second] =
    currentUser.uid < peerUser.uid
      ? [currentUser.uid, peerUser.uid]
      : [peerUser.uid, currentUser.uid];
  const chatId = `dm_${first}_${second}`.slice(0, 128);
  const directKey = `${first}_${second}`;

  const currentName = safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80);
  const peerName = safeDisplayName(peerUser.displayName, 'مستخدم ZENO', 80);
  const currentPhoto = safePhotoUrl(currentUser.photoURL);
  const peerPhoto = safePhotoUrl(peerUser.photoURL);
  const currentUname = safeUsername(currentUser.username);
  const peerUname = safeUsername(peerUser.username);

  try {
    const [existingChat, blockState] = await Promise.all([
      getDoc(doc(db, 'chats', chatId)),
      isDirectPairBlocked(currentUser.uid, peerUser.uid),
    ]);

    if (existingChat.exists()) {
      // Ensure current user's sidebar item & membership exist if not blocked
      const [myItemSnap, myMemberSnap] = await Promise.all([
        getDoc(doc(db, 'user_chats', currentUser.uid, 'items', chatId)),
        getDoc(doc(db, 'chats', chatId, 'members', currentUser.uid)),
      ]);
      if (!myItemSnap.exists() || !myMemberSnap.exists()) {
        if (blockState.blockedByMe) {
          throw new Error('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر أولاً من الإعدادات لإعادة المحادثة.');
        }
        if (blockState.blockedByPeer) {
          throw new Error('تعذر بدء المحادثة لأن هذا المستخدم قام بحظرك.');
        }
        const repairBatch = writeBatch(db);
        if (!myMemberSnap.exists()) {
          const existingOwnerId = existingChat.data()?.ownerId;
          repairBatch.set(doc(db, 'chats', chatId, 'members', currentUser.uid), {
            uid: currentUser.uid,
            chatId,
            role: existingOwnerId === currentUser.uid ? 'owner' : 'member',
            displayName: currentName,
            ...(currentUname ? { username: currentUname } : {}),
            ...(currentPhoto ? { photoURL: currentPhoto } : {}),
            joinedAt: serverTimestamp(),
          });
        }
        if (!myItemSnap.exists()) {
          repairBatch.set(doc(db, 'user_chats', currentUser.uid, 'items', chatId), {
            chatId,
            userId: currentUser.uid,
            type: 'direct',
            title: clampString(peerName, 100),
            ...(peerPhoto ? { photoURL: peerPhoto } : {}),
            folder: 'personal',
            pinned: false,
            muted: false,
            peerUserId: peerUser.uid,
            createdBy: currentUser.uid,
            lastReadAt: serverTimestamp(),
            joinedAt: serverTimestamp(),
          });
        }
        await repairBatch.commit();
      }
      return chatId;
    }

    if (blockState.blockedByMe) {
      throw new Error('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر أولاً لبدء المحادثة.');
    }
    if (blockState.blockedByPeer) {
      throw new Error('تعذر بدء المحادثة لأن هذا المستخدم قام بحظرك.');
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chatId), {
      id: chatId,
      type: 'direct',
      title: clampString(peerName, 100),
      isPublic: false,
      ownerId: currentUser.uid,
      directKey,
      memberCount: 2,
      lastMessageText: 'بدأت محادثة جديدة',
      lastMessageSenderId: currentUser.uid,
      lastMessageSenderName: currentName,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      chatId,
      role: 'owner',
      displayName: currentName,
      ...(currentUname ? { username: currentUname } : {}),
      ...(currentPhoto ? { photoURL: currentPhoto } : {}),
      joinedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'chats', chatId, 'members', peerUser.uid), {
      uid: peerUser.uid,
      chatId,
      role: 'member',
      displayName: peerName,
      ...(peerUname ? { username: peerUname } : {}),
      ...(peerPhoto ? { photoURL: peerPhoto } : {}),
      joinedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', currentUser.uid, 'items', chatId), {
      chatId,
      userId: currentUser.uid,
      type: 'direct',
      title: clampString(peerName, 100),
      ...(peerPhoto ? { photoURL: peerPhoto } : {}),
      folder: 'personal',
      pinned: false,
      muted: false,
      peerUserId: peerUser.uid,
      createdBy: currentUser.uid,
      lastReadAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', peerUser.uid, 'items', chatId), {
      chatId,
      userId: peerUser.uid,
      type: 'direct',
      title: clampString(currentName, 100),
      ...(currentPhoto ? { photoURL: currentPhoto } : {}),
      folder: 'personal',
      pinned: false,
      muted: false,
      peerUserId: currentUser.uid,
      createdBy: currentUser.uid,
      joinedAt: serverTimestamp(),
    });

    const sysMsgId = makeSafeId('msg');
    batch.set(doc(db, 'chats', chatId, 'messages', sysMsgId), {
      id: sysMsgId,
      chatId,
      senderId: currentUser.uid,
      senderName: currentName,
      type: 'system',
      text: `بدأ ${currentName} محادثة خاصة`,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function createGroupOrChannel(
  currentUser: PublicUser,
  params: {
    type: 'group' | 'channel';
    title: string;
    description: string;
    isPublic: boolean;
    username?: string;
    photoURL?: string;
    members: PublicUser[];
  }
): Promise<string> {
  const chatId = makeSafeId(params.type === 'channel' ? 'ch' : 'grp');
  const cleanTitle = clampString(params.title, 100);
  if (!cleanTitle) throw new Error('يرجى إدخال اسم المجموعة أو القناة');

  const cleanUsername = params.username
    ? params.username.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32)
    : '';
  const cleanPhotoURL =
    params.photoURL && params.photoURL.length <= 150000 ? params.photoURL : undefined;
  const uniquePeers = params.members.filter((m) => m.uid !== currentUser.uid);
  const folder: FolderKey = params.type === 'channel' ? 'channels' : 'groups';
  const initText =
    params.type === 'channel'
      ? `تم إنشاء القناة "${cleanTitle}"`
      : `أنشأ ${currentUser.displayName} المجموعة "${cleanTitle}"`;

  try {
    const batch = writeBatch(db);

    const chatPayload: Record<string, unknown> = {
      id: chatId,
      type: params.type,
      title: cleanTitle,
      description: clampString(params.description, 300),
      isPublic: params.isPublic,
      ownerId: currentUser.uid,
      memberCount: 1 + uniquePeers.length,
      lastMessageText: clampString(initText, 300),
      lastMessageSenderId: currentUser.uid,
      lastMessageSenderName: clampString(currentUser.displayName, 80),
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (cleanUsername) chatPayload.username = cleanUsername;
    if (cleanPhotoURL) chatPayload.photoURL = cleanPhotoURL;

    batch.set(doc(db, 'chats', chatId), chatPayload);

    const ownerName = safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80);
    const ownerPhoto = safePhotoUrl(currentUser.photoURL);
    const ownerUname = safeUsername(currentUser.username);

    batch.set(doc(db, 'chats', chatId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      chatId,
      role: 'owner',
      displayName: ownerName,
      ...(ownerUname ? { username: ownerUname } : {}),
      ...(ownerPhoto ? { photoURL: ownerPhoto } : {}),
      joinedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', currentUser.uid, 'items', chatId), {
      chatId,
      userId: currentUser.uid,
      type: params.type,
      title: cleanTitle,
      ...(cleanPhotoURL ? { photoURL: cleanPhotoURL } : {}),
      folder,
      pinned: false,
      muted: false,
      createdBy: currentUser.uid,
      lastReadAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
    });

    for (const peer of uniquePeers) {
      const peerName = safeDisplayName(peer.displayName, 'مستخدم ZENO', 80);
      const peerPhoto = safePhotoUrl(peer.photoURL);
      const peerUname = safeUsername(peer.username);
      batch.set(doc(db, 'chats', chatId, 'members', peer.uid), {
        uid: peer.uid,
        chatId,
        role: 'member',
        displayName: peerName,
        ...(peerUname ? { username: peerUname } : {}),
        ...(peerPhoto ? { photoURL: peerPhoto } : {}),
        joinedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'user_chats', peer.uid, 'items', chatId), {
        chatId,
        userId: peer.uid,
        type: params.type,
        title: cleanTitle,
        ...(cleanPhotoURL ? { photoURL: cleanPhotoURL } : {}),
        folder,
        pinned: false,
        muted: false,
        createdBy: currentUser.uid,
        joinedAt: serverTimestamp(),
      });
    }

    const sysMsgId = makeSafeId('msg');
    batch.set(doc(db, 'chats', chatId, 'messages', sysMsgId), {
      id: sysMsgId,
      chatId,
      senderId: currentUser.uid,
      senderName: ownerName,
      type: 'system',
      text: clampString(initText, 4000) || cleanTitle,
      isDeleted: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    return chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
  }
}

export async function joinPublicChat(currentUser: PublicUser, chat: Chat): Promise<void> {
  try {
    const memberSnap = await getDoc(doc(db, 'chats', chat.id, 'members', currentUser.uid));
    const batch = writeBatch(db);
    const folder: FolderKey = chat.type === 'channel' ? 'channels' : 'groups';
    const memberPhoto = safePhotoUrl(currentUser.photoURL);
    const memberUname = safeUsername(currentUser.username);
    const chatPhoto = safePhotoUrl(chat.photoURL);

    if (!memberSnap.exists()) {
      batch.set(doc(db, 'chats', chat.id, 'members', currentUser.uid), {
        uid: currentUser.uid,
        chatId: chat.id,
        role: 'member',
        displayName: safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80),
        ...(memberUname ? { username: memberUname } : {}),
        ...(memberPhoto ? { photoURL: memberPhoto } : {}),
        joinedAt: serverTimestamp(),
      });

      batch.update(doc(db, 'chats', chat.id), {
        memberCount: (chat.memberCount || 1) + 1,
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(doc(db, 'user_chats', currentUser.uid, 'items', chat.id), {
      chatId: chat.id,
      userId: currentUser.uid,
      type: chat.type,
      title: safeDisplayName(chat.title, 'محادثة', 100),
      ...(chatPhoto ? { photoURL: chatPhoto } : {}),
      folder,
      pinned: false,
      muted: false,
      createdBy: currentUser.uid,
      lastReadAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/members/${currentUser.uid}`);
  }
}

export async function addMemberToChat(
  currentUser: PublicUser,
  chat: Chat,
  targetUser: PublicUser
): Promise<void> {
  try {
    const memberSnap = await getDoc(doc(db, 'chats', chat.id, 'members', targetUser.uid));
    if (memberSnap.exists()) return;

    const batch = writeBatch(db);
    const folder: FolderKey = chat.type === 'channel' ? 'channels' : 'groups';
    const targetPhoto = safePhotoUrl(targetUser.photoURL);
    const targetUname = safeUsername(targetUser.username);
    const chatPhoto = safePhotoUrl(chat.photoURL);

    batch.set(doc(db, 'chats', chat.id, 'members', targetUser.uid), {
      uid: targetUser.uid,
      chatId: chat.id,
      role: 'member',
      displayName: safeDisplayName(targetUser.displayName, 'مستخدم ZENO', 80),
      ...(targetUname ? { username: targetUname } : {}),
      ...(targetPhoto ? { photoURL: targetPhoto } : {}),
      joinedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', targetUser.uid, 'items', chat.id), {
      chatId: chat.id,
      userId: targetUser.uid,
      type: chat.type,
      title: safeDisplayName(chat.title, 'محادثة', 100),
      ...(chatPhoto ? { photoURL: chatPhoto } : {}),
      folder,
      pinned: false,
      muted: false,
      createdBy: currentUser.uid,
      joinedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'chats', chat.id), {
      memberCount: (chat.memberCount || 1) + 1,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/members/${targetUser.uid}`);
  }
}

export async function updateMemberRole(
  chatId: string,
  targetUid: string,
  role: Exclude<MemberRole, 'owner'>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId, 'members', targetUid), { role });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/members/${targetUid}`);
  }
}

export async function removeMemberFromChat(
  chat: Chat,
  targetUid: string
): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'chats', chat.id, 'members', targetUid));
    batch.update(doc(db, 'chats', chat.id), {
      memberCount: Math.max(1, (chat.memberCount || 1) - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chat.id}/members/${targetUid}`);
  }
}

export async function leaveChat(uid: string, chat: Chat): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'user_chats', uid, 'items', chat.id));
    if (chat.ownerId !== uid && (chat.type === 'group' || chat.type === 'channel')) {
      batch.delete(doc(db, 'chats', chat.id, 'members', uid));
      batch.update(doc(db, 'chats', chat.id), {
        memberCount: Math.max(1, (chat.memberCount || 1) - 1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `user_chats/${uid}/items/${chat.id}`);
  }
}

export async function deleteDirectChatForBoth(
  currentUid: string,
  chat: Chat,
  peerUid?: string
): Promise<void> {
  if (chat.type !== 'direct') {
    throw new Error('الحذف بين الطرفين متاح للمحادثات الثنائية فقط');
  }

  let resolvedPeerUid = peerUid || '';
  if (!resolvedPeerUid && chat.directKey) {
    const parts = chat.directKey.split('_');
    if (parts.length === 2) {
      resolvedPeerUid = parts[0] === currentUid ? parts[1] : parts[0];
    }
  }

  try {
    const [messagesSnap, chunksSnap, reactionsSnap, votesSnap, membersSnap] = await Promise.all([
      getDocs(collection(db, 'chats', chat.id, 'messages')),
      getDocs(collection(db, 'chats', chat.id, 'file_chunks')),
      getDocs(collection(db, 'chats', chat.id, 'reactions')),
      getDocs(collection(db, 'chats', chat.id, 'poll_votes')),
      getDocs(collection(db, 'chats', chat.id, 'members')),
    ]);

    if (!resolvedPeerUid) {
      const otherMember = membersSnap.docs.find((d) => d.id !== currentUid);
      if (otherMember) resolvedPeerUid = otherMember.id;
    }

    const subcollectionRefs = [
      ...messagesSnap.docs.map((d) => d.ref),
      ...chunksSnap.docs.map((d) => d.ref),
      ...reactionsSnap.docs.map((d) => d.ref),
      ...votesSnap.docs.map((d) => d.ref),
    ];

    for (let i = 0; i < subcollectionRefs.length; i += 400) {
      const chunkBatch = writeBatch(db);
      for (const ref of subcollectionRefs.slice(i, i + 400)) {
        chunkBatch.delete(ref);
      }
      await chunkBatch.commit();
    }

    const finalBatch = writeBatch(db);
    finalBatch.delete(doc(db, 'user_chats', currentUid, 'items', chat.id));
    if (resolvedPeerUid) {
      finalBatch.delete(doc(db, 'user_chats', resolvedPeerUid, 'items', chat.id));
    }
    for (const memberDoc of membersSnap.docs) {
      finalBatch.delete(memberDoc.ref);
    }
    finalBatch.delete(doc(db, 'chats', chat.id));
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chat.id}`);
  }
}

export async function updateChatDetails(
  chatId: string,
  updates: { title: string; description: string; isPublic: boolean }
): Promise<void> {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      title: clampString(updates.title, 100),
      description: clampString(updates.description, 300),
      isPublic: updates.isPublic,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function updateChatPhoto(
  chatId: string,
  photoDataUrl: string | null
): Promise<void> {
  if (photoDataUrl && photoDataUrl.length > 150000) {
    throw new Error('حجم الصورة كبير جداً، يرجى اختيار صورة أصغر');
  }
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      photoURL: photoDataUrl ? photoDataUrl : deleteField(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function updateChatAutoDeleteTimer(
  currentUser: PublicUser,
  chat: Chat,
  seconds: number
): Promise<void> {
  if (chat.type !== 'direct' && chat.type !== 'saved') {
    throw new Error('مؤقت التدمير الذاتي متاح للمحادثات الخاصة فقط');
  }
  const cleanSeconds = seconds <= 0 ? 0 : Math.max(5, Math.min(2592000, Math.round(seconds)));
  if ((chat.autoDeleteSeconds || 0) === cleanSeconds) return;

  try {
    await updateDoc(doc(db, 'chats', chat.id), {
      autoDeleteSeconds: cleanSeconds,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chat.id}`);
  }

  const notice =
    cleanSeconds > 0
      ? `فعّل ${currentUser.displayName} مؤقت الرسائل ذاتية التدمير (${formatAutoDeleteLabel(cleanSeconds)})`
      : `أوقف ${currentUser.displayName} مؤقت الرسائل ذاتية التدمير`;

  try {
    await sendMessage(currentUser, { ...chat, autoDeleteSeconds: 0 }, {
      type: 'system',
      text: notice,
    });
  } catch {
    // Non-critical notice if chat state changed concurrently
  }
}

const INLINE_MEDIA_MAX_CHARS = 700000;
const BINARY_CHUNK_SIZE = 880000;
const UPLOAD_CHUNK_BATCH_LIMIT = 4;
const DOWNLOAD_CHUNK_BATCH_LIMIT = 6;
const MAX_CHUNKS_ALLOWED = 150;

const blobCache = new Map<string, Blob>();
const objectUrlCache = new Map<string, string>();

export async function getMessageMediaBlob(
  message: Message,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const cacheKey = `${message.chatId}_${message.id}`;
  const cachedBlob = blobCache.get(cacheKey);
  if (cachedBlob) {
    onProgress?.(100);
    return cachedBlob;
  }

  if (message.mediaDataUrl) {
    const blob = dataUrlToBlob(message.mediaDataUrl, message.fileMimeType || 'application/octet-stream');
    blobCache.set(cacheKey, blob);
    onProgress?.(100);
    return blob;
  }

  const persistedBlob = await getCachedMediaBlob(`msg_${cacheKey}`);
  if (persistedBlob) {
    blobCache.set(cacheKey, persistedBlob);
    onProgress?.(100);
    return persistedBlob;
  }

  if (message.mediaUrl) {
    try {
      const response = await fetch(message.mediaUrl);
      if (!response.ok) {
        throw new Error('تعذر تحميل الملف المرفق');
      }
      const fetchedBlob = await response.blob();
      blobCache.set(cacheKey, fetchedBlob);
      void setCachedMediaBlob(`msg_${cacheKey}`, fetchedBlob);
      onProgress?.(100);
      return fetchedBlob;
    } catch {
      throw new Error('تعذر تحميل الملف المرفق من التخزين السحابي');
    }
  }

  const expectedCount = message.mediaChunkCount || 0;
  try {
    let orderedData: (Bytes | string)[] = [];

    if (expectedCount > 0) {
      for (let start = 0; start < expectedCount; start += DOWNLOAD_CHUNK_BATCH_LIMIT) {
        const end = Math.min(start + DOWNLOAD_CHUNK_BATCH_LIMIT, expectedCount);
        const indices = Array.from({ length: end - start }, (_, i) => start + i);
        const snaps = await Promise.all(
          indices.map((idx) =>
            getImmutableChunkDoc(doc(db, 'chats', message.chatId, 'file_chunks', `${message.id}_${idx}`))
          )
        );
        for (const snap of snaps) {
          if (!snap.exists()) {
            throw new Error('تعذر العثور على أحد أجزاء الملف المرفق');
          }
          const raw = snap.data()!.data;
          orderedData.push(raw);
        }
        onProgress?.(Math.round((end / expectedCount) * 100));
      }
    } else {
      if (isReadQuotaCooldownActive()) {
        throw new Error(
          'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.'
        );
      }
      const snap = await getDocs(
        query(
          collection(db, 'chats', message.chatId, 'file_chunks'),
          where('messageId', '==', message.id)
        )
      );
      if (snap.empty) {
        throw new Error('تعذر العثور على بيانات الملف المرفق');
      }
      orderedData = snap.docs
        .map((d) => d.data() as { chunkIndex?: number; data: Bytes | string })
        .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
        .map((c) => c.data);
      onProgress?.(100);
    }

    const mime = message.fileMimeType || 'application/octet-stream';
    const hasStringChunks = orderedData.some((d) => typeof d === 'string');

    let finalBlob: Blob;
    if (hasStringChunks) {
      const fullDataUrl = orderedData.map((d) => (typeof d === 'string' ? d : '')).join('');
      finalBlob = dataUrlToBlob(fullDataUrl, mime);
    } else {
      const parts = orderedData.map((d) => {
        const u8 = (d as Bytes).toUint8Array();
        return new Uint8Array(u8);
      });
      finalBlob = new Blob(parts, { type: mime });
    }

    blobCache.set(cacheKey, finalBlob);
    void setCachedMediaBlob(`msg_${cacheKey}`, finalBlob);
    return finalBlob;
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      throw new Error(formatAppErrorMessage(error, 'تعذر تحميل الملف حالياً'));
    }
    if (error instanceof Error && error.message.includes('تعذر العثور')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, `chats/${message.chatId}/file_chunks`);
  }
}

export async function getMessageDownloadUrl(
  message: Message,
  onProgress?: (percent: number) => void
): Promise<string> {
  const cacheKey = `${message.chatId}_${message.id}`;
  const cachedObj = objectUrlCache.get(cacheKey);
  if (cachedObj) {
    onProgress?.(100);
    return cachedObj;
  }

  if (message.mediaDataUrl) {
    const objUrl = dataUrlToObjectUrl(
      message.mediaDataUrl,
      message.fileMimeType || 'application/octet-stream'
    );
    objectUrlCache.set(cacheKey, objUrl);
    onProgress?.(100);
    return objUrl;
  }

  if (message.mediaUrl) {
    onProgress?.(100);
    return message.mediaUrl;
  }

  if (!message.mediaChunkCount) {
    throw new Error('لا توجد بيانات قابلة للتنزيل لهذه الرسالة');
  }

  const blob = await getMessageMediaBlob(message, onProgress);
  const objUrl = URL.createObjectURL(blob);
  objectUrlCache.set(cacheKey, objUrl);
  return objUrl;
}

export async function sendMessage(
  currentUser: PublicUser,
  chat: Chat,
  payload: {
    type: MessageType;
    text: string;
    mediaDataUrl?: string;
    mediaUrl?: string;
    mediaFile?: Blob;
    mediaDurationSec?: number;
    fileName?: string;
    fileSize?: number;
    fileMimeType?: string;
    replyTo?: Message | null;
    forwardedFromName?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    stickerId?: string;
    stickerPackId?: string;
    stickerAnim?: StickerAnimation;
    onProgress?: (percent: number) => void;
  }
): Promise<string> {
  if (isWriteQuotaCooldownActive()) {
    throw new Error(
      'تم استهلاك الحد اليومي المجاني لعمليات الكتابة في قاعدة البيانات. يُعاد تصفير الحصة تلقائياً في اليوم التالي.'
    );
  }
  const messageId = makeSafeId('msg');
  const cleanText = clampString(payload.text, 4000);
  const senderName = safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80);

  let previewText = cleanText;
  if (payload.type === 'image') {
    previewText = cleanText ? `صورة: ${cleanText}` : 'صورة';
  } else if (payload.type === 'audio') {
    previewText = payload.fileName ? `ملف صوتي: ${payload.fileName}` : 'رسالة صوتية';
  } else if (payload.type === 'file') {
    previewText = payload.fileName ? `ملف: ${payload.fileName}` : 'ملف مرفق';
  } else if (payload.type === 'poll') {
    previewText = `استطلاع: ${payload.pollQuestion || ''}`;
  } else if (payload.type === 'sticker') {
    previewText = cleanText ? `ملصق: ${cleanText}` : 'ملصق متحرك';
  }

  const msgDoc: Record<string, unknown> = {
    id: messageId,
    chatId: chat.id,
    senderId: currentUser.uid,
    senderName,
    type: payload.type,
    text: cleanText,
    isDeleted: false,
    createdAt: serverTimestamp(),
  };

  if (
    payload.type !== 'system' &&
    typeof chat.autoDeleteSeconds === 'number' &&
    chat.autoDeleteSeconds >= 5
  ) {
    msgDoc.ttlSeconds = Math.min(2592000, Math.round(chat.autoDeleteSeconds));
  }

  if (currentUser.photoURL && currentUser.photoURL.length <= 150000) {
    msgDoc.senderPhotoURL = currentUser.photoURL;
  }
  if (typeof payload.mediaDurationSec === 'number' && Number.isFinite(payload.mediaDurationSec)) {
    msgDoc.mediaDurationSec = Math.min(3600, Math.max(0, payload.mediaDurationSec));
  }
  const cleanFileName = payload.fileName ? clampString(payload.fileName, 180) : '';
  if (cleanFileName) msgDoc.fileName = cleanFileName;
  if (typeof payload.fileSize === 'number' && Number.isFinite(payload.fileSize)) {
    msgDoc.fileSize = Math.min(104857600, Math.max(0, Math.round(payload.fileSize)));
  }
  if (payload.fileMimeType) msgDoc.fileMimeType = clampString(payload.fileMimeType, 120);
  if (payload.stickerId) msgDoc.stickerId = clampString(payload.stickerId, 128);
  if (payload.stickerPackId) msgDoc.stickerPackId = clampString(payload.stickerPackId, 128);
  if (payload.stickerAnim) msgDoc.stickerAnim = payload.stickerAnim;

  if (payload.replyTo) {
    msgDoc.replyToId = payload.replyTo.id;
    msgDoc.replyToSenderName = safeDisplayName(payload.replyTo.senderName, 'مستخدم', 80);
    const replySnippet =
      payload.replyTo.text ||
      (payload.replyTo.type === 'image'
        ? 'صورة'
        : payload.replyTo.type === 'sticker'
        ? 'ملصق متحرك'
        : payload.replyTo.type === 'audio'
        ? payload.replyTo.fileName || 'رسالة صوتية'
        : payload.replyTo.type === 'file'
        ? payload.replyTo.fileName || 'ملف مرفق'
        : payload.replyTo.pollQuestion || 'رسالة');
    msgDoc.replyToText = clampString(replySnippet, 200);
  }
  const cleanForwardName = payload.forwardedFromName ? clampString(payload.forwardedFromName, 80) : '';
  if (cleanForwardName) {
    msgDoc.forwardedFromName = cleanForwardName;
  }
  if (payload.type === 'poll' && payload.pollQuestion && payload.pollOptions) {
    msgDoc.pollQuestion = clampString(payload.pollQuestion, 250);
    msgDoc.pollOptions = payload.pollOptions.slice(0, 8).map((o) => clampString(o, 120) || 'خيار');
  }

  const uploadedChunkIds: string[] = [];
  let uploadedStorageUrl: string | undefined;

  const rollbackUploadedChunks = async () => {
    if (uploadedStorageUrl) {
      await tryDeleteStorageByUrl(uploadedStorageUrl);
      uploadedStorageUrl = undefined;
    }
    for (let i = 0; i < uploadedChunkIds.length; i += 200) {
      try {
        const rb = writeBatch(db);
        for (const cid of uploadedChunkIds.slice(i, i + 200)) {
          rb.delete(doc(db, 'chats', chat.id, 'file_chunks', cid));
        }
        await rb.commit();
      } catch {
        // Best-effort cleanup
      }
    }
  };

  if (payload.mediaUrl && !payload.mediaFile) {
    const cleanUrl = clampString(payload.mediaUrl, 2048);
    if (cleanUrl) {
      msgDoc.mediaUrl = cleanUrl;
    }
  } else if (payload.mediaFile) {
    const fileBlob = payload.mediaFile;
    if (fileBlob.size > MAX_FILE_BYTES) {
      throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_FILE_BYTES)})`);
    }

    const storageUrl = await tryUploadBlobToStorage(
      `chats/${chat.id}/${messageId}`,
      fileBlob,
      payload.fileMimeType || fileBlob.type || 'application/octet-stream',
      (pct) => payload.onProgress?.(Math.min(95, pct))
    );

    if (storageUrl) {
      uploadedStorageUrl = storageUrl;
      msgDoc.mediaUrl = storageUrl;
      blobCache.set(`${chat.id}_${messageId}`, fileBlob);
      void setCachedMediaBlob(`msg_${chat.id}_${messageId}`, fileBlob);
    } else {
      const totalChunks = Math.ceil(fileBlob.size / BINARY_CHUNK_SIZE);
      if (totalChunks > MAX_CHUNKS_ALLOWED) {
        throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_FILE_BYTES)})`);
      }

      try {
        for (let startIdx = 0; startIdx < totalChunks; startIdx += UPLOAD_CHUNK_BATCH_LIMIT) {
          const endIdx = Math.min(startIdx + UPLOAD_CHUNK_BATCH_LIMIT, totalChunks);
          const chunkBatch = writeBatch(db);
          for (let idx = startIdx; idx < endIdx; idx += 1) {
            const byteStart = idx * BINARY_CHUNK_SIZE;
            const byteEnd = Math.min(byteStart + BINARY_CHUNK_SIZE, fileBlob.size);
            const buffer = await fileBlob.slice(byteStart, byteEnd).arrayBuffer();
            const chunkId = `${messageId}_${idx}`;
            chunkBatch.set(doc(db, 'chats', chat.id, 'file_chunks', chunkId), {
              id: chunkId,
              chatId: chat.id,
              messageId,
              senderId: currentUser.uid,
              chunkIndex: idx,
              data: Bytes.fromUint8Array(new Uint8Array(buffer)),
              createdAt: serverTimestamp(),
            });
          }
          await chunkBatch.commit();
          for (let idx = startIdx; idx < endIdx; idx += 1) {
            uploadedChunkIds.push(`${messageId}_${idx}`);
          }
          payload.onProgress?.(Math.round((endIdx / totalChunks) * 95));
        }
        msgDoc.mediaChunkCount = totalChunks;
        blobCache.set(`${chat.id}_${messageId}`, fileBlob);
        void setCachedMediaBlob(`msg_${chat.id}_${messageId}`, fileBlob);
      } catch (error) {
        await rollbackUploadedChunks();
        handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/file_chunks`);
      }
    }
  } else if (payload.mediaDataUrl) {
    if (payload.mediaDataUrl.length <= INLINE_MEDIA_MAX_CHARS) {
      msgDoc.mediaDataUrl = payload.mediaDataUrl;
    } else {
      const blob = dataUrlToBlob(
        payload.mediaDataUrl,
        payload.fileMimeType || 'application/octet-stream'
      );
      const storageUrl = await tryUploadBlobToStorage(
        `chats/${chat.id}/${messageId}`,
        blob,
        payload.fileMimeType || blob.type || 'application/octet-stream',
        (pct) => payload.onProgress?.(Math.min(95, pct))
      );

      if (storageUrl) {
        uploadedStorageUrl = storageUrl;
        msgDoc.mediaUrl = storageUrl;
        blobCache.set(`${chat.id}_${messageId}`, blob);
        void setCachedMediaBlob(`msg_${chat.id}_${messageId}`, blob);
      } else {
        const totalChunks = Math.ceil(blob.size / BINARY_CHUNK_SIZE);
        if (totalChunks > MAX_CHUNKS_ALLOWED) {
          throw new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(MAX_FILE_BYTES)})`);
        }
        try {
          for (let startIdx = 0; startIdx < totalChunks; startIdx += UPLOAD_CHUNK_BATCH_LIMIT) {
            const endIdx = Math.min(startIdx + UPLOAD_CHUNK_BATCH_LIMIT, totalChunks);
            const chunkBatch = writeBatch(db);
            for (let idx = startIdx; idx < endIdx; idx += 1) {
              const byteStart = idx * BINARY_CHUNK_SIZE;
              const byteEnd = Math.min(byteStart + BINARY_CHUNK_SIZE, blob.size);
              const buffer = await blob.slice(byteStart, byteEnd).arrayBuffer();
              const chunkId = `${messageId}_${idx}`;
              chunkBatch.set(doc(db, 'chats', chat.id, 'file_chunks', chunkId), {
                id: chunkId,
                chatId: chat.id,
                messageId,
                senderId: currentUser.uid,
                chunkIndex: idx,
                data: Bytes.fromUint8Array(new Uint8Array(buffer)),
                createdAt: serverTimestamp(),
              });
            }
            await chunkBatch.commit();
            for (let idx = startIdx; idx < endIdx; idx += 1) {
              uploadedChunkIds.push(`${messageId}_${idx}`);
            }
            payload.onProgress?.(Math.round((endIdx / totalChunks) * 95));
          }
          msgDoc.mediaChunkCount = totalChunks;
          blobCache.set(`${chat.id}_${messageId}`, blob);
        } catch (error) {
          await rollbackUploadedChunks();
          handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/file_chunks`);
        }
      }
    }
  }

  const chatPreviewUpdate = {
    lastMessageText: clampString(previewText || 'رسالة', 300),
    lastMessageSenderId: currentUser.uid,
    lastMessageSenderName: senderName,
    lastMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const commitMessageAndChat = async () => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'chats', chat.id, 'messages', messageId), msgDoc);
    batch.update(doc(db, 'chats', chat.id), chatPreviewUpdate);
    await batch.commit();
  };

  const isPermissionError = (err: unknown): boolean => {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    return (
      msg.includes('permission-denied') ||
      msg.includes('permission_denied') ||
      msg.includes('missing or insufficient permissions')
    );
  };

  try {
    await commitMessageAndChat();
    payload.onProgress?.(100);
    return messageId;
  } catch (error) {
    if (isPermissionError(error)) {
      if (!auth.currentUser) {
        await rollbackUploadedChunks();
        throw new Error('انتهت جلسة تسجيل الدخول. يرجى تسجيل الخروج ثم إعادة الدخول بحساب Google.');
      }

      // Refresh auth token once in case claims/session grew stale
      try {
        await auth.currentUser.getIdToken(true);
      } catch {
        // Non-fatal token refresh attempt
      }

      if (chat.type === 'direct') {
        let peerUid = '';
        if (chat.directKey) {
          const parts = chat.directKey.split('_');
          if (parts.length === 2) {
            peerUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
          }
        }
        if (!peerUid && chat.id.startsWith('dm_')) {
          const rest = chat.id.slice(3);
          const parts = rest.split('_');
          if (parts.length === 2) {
            peerUid = parts[0] === currentUser.uid ? parts[1] : parts[0];
          }
        }
        if (peerUid) {
          const blockState = await isDirectPairBlocked(currentUser.uid, peerUid);
          if (blockState.blockedByMe) {
            await rollbackUploadedChunks();
            throw new Error('لقد قمت بحظر هذا المستخدم. قم بإلغاء الحظر أولاً لإرسال الرسائل.');
          }
          if (blockState.blockedByPeer) {
            await rollbackUploadedChunks();
            throw new Error('تعذر إرسال الرسالة لأن هذا المستخدم قام بحظرك.');
          }
        }
      }

      let chatSnap: Awaited<ReturnType<typeof getDoc>> | null = null;
      let memberSnap: Awaited<ReturnType<typeof getDoc>> | null = null;

      try {
        chatSnap = await getDoc(doc(db, 'chats', chat.id));
      } catch {
        chatSnap = null;
      }

      if (chatSnap && !chatSnap.exists()) {
        await rollbackUploadedChunks();
        throw new Error('تعذر إرسال الرسالة لأن المحادثة حُذفت أو لم تعد موجودة.');
      }

      try {
        memberSnap = await getDoc(doc(db, 'chats', chat.id, 'members', currentUser.uid));
      } catch {
        memberSnap = null;
      }

      let memberExists = Boolean(memberSnap?.exists());
      const memberRole =
        memberSnap?.exists() && typeof (memberSnap.data() as Record<string, unknown>)?.role === 'string'
          ? String((memberSnap.data() as Record<string, unknown>).role)
          : undefined;

      const liveChatData = chatSnap?.exists()
        ? (chatSnap.data() as Record<string, unknown>)
        : undefined;
      const effectiveChatType =
        typeof liveChatData?.type === 'string' ? liveChatData.type : chat.type;
      const effectiveOwnerId =
        typeof liveChatData?.ownerId === 'string' ? liveChatData.ownerId : chat.ownerId;
      const effectiveIsPublic =
        typeof liveChatData?.isPublic === 'boolean' ? liveChatData.isPublic : chat.isPublic;

      if (!memberExists) {
        if (effectiveChatType === 'direct' || effectiveChatType === 'saved') {
          try {
            const myPhoto = safePhotoUrl(currentUser.photoURL);
            const myUname = safeUsername(currentUser.username);
            await setDoc(doc(db, 'chats', chat.id, 'members', currentUser.uid), {
              uid: currentUser.uid,
              chatId: chat.id,
              role: effectiveOwnerId === currentUser.uid ? 'owner' : 'member',
              displayName: senderName,
              ...(myUname ? { username: myUname } : {}),
              ...(myPhoto ? { photoURL: myPhoto } : {}),
              joinedAt: serverTimestamp(),
            });
            memberExists = true;
            await commitMessageAndChat();
            payload.onProgress?.(100);
            return messageId;
          } catch {
            // Continue to fallback message write below
          }
        } else if (memberSnap) {
          await rollbackUploadedChunks();
          throw new Error(
            effectiveIsPublic
              ? 'يرجى الانضمام إلى المحادثة أولاً لتتمكن من الإرسال.'
              : 'أنت لست عضواً في هذه المحادثة.'
          );
        }
      }

      if (effectiveChatType === 'channel' && memberRole === 'member') {
        await rollbackUploadedChunks();
        throw new Error('النشر متاح لمشرفي القناة فقط.');
      }

      // Fallback: write message directly in case an older chat doc schema fails chat update validation
      try {
        await setDoc(doc(db, 'chats', chat.id, 'messages', messageId), msgDoc);
        updateDoc(doc(db, 'chats', chat.id), chatPreviewUpdate).catch(() => {});
        payload.onProgress?.(100);
        return messageId;
      } catch (msgErr) {
        if (isPermissionError(msgErr)) {
          await rollbackUploadedChunks();
          if (!memberExists) {
            throw new Error(
              effectiveIsPublic
                ? 'يرجى الانضمام إلى المحادثة أولاً لتتمكن من الإرسال.'
                : 'تعذر التحقق من عضويتك في هذه المحادثة.'
            );
          }
          const fbUser = auth.currentUser;
          const hasVerifiedProvider =
            Boolean(fbUser?.emailVerified) ||
            Boolean(fbUser?.phoneNumber) ||
            fbUser?.providerData?.some((p) => p.providerId === 'google.com' || p.providerId === 'phone');
          if (!hasVerifiedProvider) {
            throw new Error('يرجى تأكيد حسابك أو إعادة تسجيل الدخول بحساب Google لتفعيل الإرسال.');
          }
          throw new Error('تعذر إرسال الرسالة بسبب قيود الصلاحية في هذه المحادثة.');
        }
        await rollbackUploadedChunks();
        handleFirestoreError(msgErr, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
      }
    }

    await rollbackUploadedChunks();
    handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/messages/${messageId}`);
  }
}

export async function editMessage(
  chatId: string,
  messageId: string,
  newText: string
): Promise<void> {
  const cleanText = clampString(newText, 4000);
  if (!cleanText) return;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
      text: cleanText,
      editedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages/${messageId}`);
  }
}

export async function deleteMessage(
  chatId: string,
  messageId: string,
  options?: { forBoth?: boolean; chat?: Chat | null }
): Promise<void> {
  try {
    const forBoth = options?.forBoth ?? true;
    if (!forBoth) {
      await updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
        isDeleted: true,
        text: '',
        editedAt: serverTimestamp(),
      });
      return;
    }

    let mediaUrlToDelete: string | undefined;
    try {
      const cachedMsg = await getDocFromCache(doc(db, 'chats', chatId, 'messages', messageId));
      if (cachedMsg.exists() && typeof cachedMsg.data()?.mediaUrl === 'string') {
        mediaUrlToDelete = String(cachedMsg.data()?.mediaUrl);
      }
    } catch {
      // Ignore cache miss
    }

    const [chunksSnap, reactionsSnap, votesSnap] = await Promise.all([
      getDocs(query(collection(db, 'chats', chatId, 'file_chunks'), where('messageId', '==', messageId))),
      getDocs(query(collection(db, 'chats', chatId, 'reactions'), where('messageId', '==', messageId))),
      getDocs(query(collection(db, 'chats', chatId, 'poll_votes'), where('messageId', '==', messageId))),
    ]);

    const refsToDelete = [
      doc(db, 'chats', chatId, 'messages', messageId),
      ...chunksSnap.docs.map((d) => d.ref),
      ...reactionsSnap.docs.map((d) => d.ref),
      ...votesSnap.docs.map((d) => d.ref),
    ];

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of refsToDelete.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    if (mediaUrlToDelete) {
      void tryDeleteStorageByUrl(mediaUrlToDelete);
    }

    // Refresh chat pinned state and lastMessageText after permanent deletion
    try {
      const latestSnap = await getDocs(
        query(collection(db, 'chats', chatId, 'messages'), orderBy('createdAt', 'desc'), limit(1))
      );
      const latestDoc = latestSnap.docs[0]?.data();
      let nextLastText = 'لا توجد رسائل بعد';
      if (latestDoc) {
        if (latestDoc.isDeleted) {
          nextLastText = 'تم حذف رسالة';
        } else if (latestDoc.type === 'image') {
          nextLastText = latestDoc.text ? `صورة: ${latestDoc.text}` : 'صورة';
        } else if (latestDoc.type === 'audio') {
          nextLastText = latestDoc.fileName ? `ملف صوتي: ${latestDoc.fileName}` : 'رسالة صوتية';
        } else if (latestDoc.type === 'file') {
          nextLastText = latestDoc.fileName ? `ملف: ${latestDoc.fileName}` : 'ملف مرفق';
        } else if (latestDoc.type === 'poll') {
          nextLastText = `استطلاع: ${latestDoc.pollQuestion || ''}`;
        } else if (latestDoc.type === 'sticker') {
          nextLastText = latestDoc.text ? `ملصق: ${latestDoc.text}` : 'ملصق متحرك';
        } else {
          nextLastText = String(latestDoc.text || 'رسالة');
        }
      }

      const chatUpdates: Record<string, unknown> = {
        lastMessageText: clampString(nextLastText, 300),
        updatedAt: serverTimestamp(),
      };
      if (options?.chat?.pinnedMessageId === messageId) {
        let nextPinnedId = '';
        let nextPinnedText = '';
        try {
          const remainingPinnedSnap = await getDocs(
            query(collection(db, 'chats', chatId, 'messages'), where('isPinned', '==', true))
          );
          const remaining = remainingPinnedSnap.docs
            .map((d) => mapMessageDoc(d.data(), d.id))
            .filter((m) => !m.isDeleted && m.id !== messageId)
            .sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt));
          if (remaining[0]) {
            nextPinnedId = remaining[0].id;
            nextPinnedText = clampString(buildPinnedSnippet(remaining[0]), 300);
          }
        } catch {
          // Fallback to clearing pinned banner
        }
        chatUpdates.pinnedMessageId = nextPinnedId;
        chatUpdates.pinnedMessageText = nextPinnedText;
      }
      await updateDoc(doc(db, 'chats', chatId), chatUpdates);
    } catch {
      // Non-critical metadata refresh
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/messages/${messageId}`);
  }
}

export function buildPinnedSnippet(message: Message): string {
  if (message.text.trim()) return message.text.trim();
  if (message.type === 'image') return 'صورة مثبتة';
  if (message.type === 'sticker') return 'ملصق متحرك';
  if (message.type === 'audio') return message.fileName || 'رسالة صوتية';
  if (message.type === 'file') return message.fileName || 'ملف مرفق';
  if (message.type === 'poll') return message.pollQuestion ? `استطلاع: ${message.pollQuestion}` : 'استطلاع رأي';
  return 'رسالة مثبتة';
}

export async function pinMessage(
  chatId: string,
  message: Message | null,
  options?: {
    uid?: string;
    pinned?: boolean;
    currentMessages?: Message[];
    currentPinnedMessageId?: string;
  }
): Promise<void> {
  try {
    if (!message) {
      const batch = writeBatch(db);
      const existingPinned = (options?.currentMessages || []).filter(
        (m) => !m.isDeleted && m.isPinned
      );
      for (const m of existingPinned.slice(0, 400)) {
        batch.update(doc(db, 'chats', chatId, 'messages', m.id), {
          isPinned: false,
          pinnedAt: deleteField(),
          pinnedBy: deleteField(),
        });
      }
      batch.update(doc(db, 'chats', chatId), {
        pinnedMessageId: '',
        pinnedMessageText: '',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return;
    }

    const currentlyPinned = Boolean(
      message.isPinned || (options?.currentPinnedMessageId && options.currentPinnedMessageId === message.id)
    );
    const shouldPin = options?.pinned ?? !currentlyPinned;
    const uid = options?.uid || auth.currentUser?.uid || '';

    const batch = writeBatch(db);
    if (shouldPin) {
      if (uid) {
        batch.update(doc(db, 'chats', chatId, 'messages', message.id), {
          isPinned: true,
          pinnedAt: serverTimestamp(),
          pinnedBy: uid,
        });
      }
    } else {
      batch.update(doc(db, 'chats', chatId, 'messages', message.id), {
        isPinned: false,
        pinnedAt: deleteField(),
        pinnedBy: deleteField(),
      });
    }

    const allMsgs = options?.currentMessages || [];
    const remainingPinned = allMsgs
      .filter((m) => {
        if (m.isDeleted || m.id === message.id) return false;
        return Boolean(m.isPinned || m.id === options?.currentPinnedMessageId);
      })
      .concat(shouldPin ? [{ ...message, isPinned: true, pinnedAt: Date.now() }] : [])
      .sort((a, b) => (b.pinnedAt || b.createdAt) - (a.pinnedAt || a.createdAt));

    const topPinned = remainingPinned[0];
    batch.update(doc(db, 'chats', chatId), {
      pinnedMessageId: topPinned ? topPinned.id : '',
      pinnedMessageText: topPinned ? clampString(buildPinnedSnippet(topPinned), 300) : '',
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function unpinAllMessages(
  chatId: string,
  pinnedMessages: Message[]
): Promise<void> {
  try {
    const flagged = pinnedMessages.filter((m) => !m.isDeleted && m.isPinned);
    for (let i = 0; i < flagged.length; i += 400) {
      const batch = writeBatch(db);
      for (const m of flagged.slice(i, i + 400)) {
        batch.update(doc(db, 'chats', chatId, 'messages', m.id), {
          isPinned: false,
          pinnedAt: deleteField(),
          pinnedBy: deleteField(),
        });
      }
      if (i + 400 >= flagged.length) {
        batch.update(doc(db, 'chats', chatId), {
          pinnedMessageId: '',
          pinnedMessageText: '',
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
    if (flagged.length === 0) {
      await updateDoc(doc(db, 'chats', chatId), {
        pinnedMessageId: '',
        pinnedMessageText: '',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

export async function toggleReaction(
  currentUser: PublicUser,
  chatId: string,
  messageId: string,
  emoji: string,
  currentEmoji?: string
): Promise<void> {
  const reactionId = `${messageId}_${currentUser.uid}`;
  const ref = doc(db, 'chats', chatId, 'reactions', reactionId);

  try {
    if (currentEmoji === emoji) {
      await deleteDoc(ref);
      return;
    }
    if (currentEmoji) {
      await updateDoc(ref, {
        emoji,
        createdAt: serverTimestamp(),
      });
      return;
    }
    await setDoc(ref, {
      id: reactionId,
      chatId,
      messageId,
      uid: currentUser.uid,
      emoji,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/reactions/${reactionId}`);
  }
}

export async function castPollVote(
  currentUser: PublicUser,
  chatId: string,
  messageId: string,
  optionIndex: number,
  alreadyVoted: boolean
): Promise<void> {
  const voteId = `${messageId}_${currentUser.uid}`;
  const ref = doc(db, 'chats', chatId, 'poll_votes', voteId);

  try {
    if (alreadyVoted) {
      await updateDoc(ref, {
        optionIndex,
        createdAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: voteId,
        chatId,
        messageId,
        uid: currentUser.uid,
        optionIndex,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}/poll_votes/${voteId}`);
  }
}

export async function updateTypingIndicator(
  chatId: string,
  uid: string,
  isTyping = true
): Promise<void> {
  if (isWriteQuotaCooldownActive()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    await updateDoc(doc(db, 'chats', chatId, 'members', uid), {
      typingAt: isTyping ? serverTimestamp() : deleteField(),
    });
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markWriteQuotaCooldown();
    }
    // Silent non-blocking typing update
  }
}

export async function markChatAsRead(
  uid: string,
  chatId: string,
  chatType?: ChatType
): Promise<void> {
  if (isWriteQuotaCooldownActive()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    if (chatType === 'saved') {
      await updateDoc(doc(db, 'user_chats', uid, 'items', chatId), {
        lastReadAt: serverTimestamp(),
      });
      return;
    }
    const batch = writeBatch(db);
    batch.update(doc(db, 'user_chats', uid, 'items', chatId), {
      lastReadAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chats', chatId, 'members', uid), {
      lastReadAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markWriteQuotaCooldown();
    }
    // Non-blocking read mark
  }
}

export async function updateChatItemPrefs(
  uid: string,
  chatId: string,
  updates: Partial<Pick<UserChatItem, 'pinned' | 'muted' | 'folder'>>
): Promise<void> {
  try {
    await updateDoc(doc(db, 'user_chats', uid, 'items', chatId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `user_chats/${uid}/items/${chatId}`);
  }
}

export async function forwardMessage(
  currentUser: PublicUser,
  targetChat: Chat,
  original: Message
): Promise<void> {
  let mediaFile: Blob | undefined;
  if (!original.mediaDataUrl && !original.mediaUrl && original.mediaChunkCount) {
    mediaFile = await getMessageMediaBlob(original);
  }

  await sendMessage(currentUser, targetChat, {
    type: original.type === 'system' ? 'text' : original.type,
    text: original.text,
    mediaDataUrl: original.mediaDataUrl,
    mediaUrl: original.mediaUrl,
    mediaFile,
    mediaDurationSec: original.mediaDurationSec,
    fileName: original.fileName,
    fileSize: original.fileSize,
    fileMimeType: original.fileMimeType,
    forwardedFromName: original.senderName,
    pollQuestion: original.pollQuestion,
    pollOptions: original.pollOptions,
    stickerId: original.stickerId,
    stickerPackId: original.stickerPackId,
    stickerAnim: original.stickerAnim,
  });
}

export function mapChatDoc(data: Record<string, unknown>, id: string): Chat {
  return {
    id,
    type: (data.type as ChatType) || 'group',
    title: String(data.title || 'محادثة'),
    description: typeof data.description === 'string' ? data.description : undefined,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
    isPublic: Boolean(data.isPublic),
    username: typeof data.username === 'string' ? data.username : undefined,
    ownerId: String(data.ownerId || ''),
    directKey: typeof data.directKey === 'string' ? data.directKey : undefined,
    memberCount: typeof data.memberCount === 'number' ? data.memberCount : 1,
    pinnedMessageId: typeof data.pinnedMessageId === 'string' ? data.pinnedMessageId : undefined,
    pinnedMessageText: typeof data.pinnedMessageText === 'string' ? data.pinnedMessageText : undefined,
    lastMessageText: typeof data.lastMessageText === 'string' ? data.lastMessageText : undefined,
    lastMessageSenderId: typeof data.lastMessageSenderId === 'string' ? data.lastMessageSenderId : undefined,
    lastMessageSenderName: typeof data.lastMessageSenderName === 'string' ? data.lastMessageSenderName : undefined,
    lastMessageAt: data.lastMessageAt ? tsToMillis(data.lastMessageAt) : undefined,
    autoDeleteSeconds: typeof data.autoDeleteSeconds === 'number' ? data.autoDeleteSeconds : undefined,
    inviteCode: typeof data.inviteCode === 'string' && data.inviteCode ? data.inviteCode : undefined,
    slowModeSeconds: typeof data.slowModeSeconds === 'number' ? data.slowModeSeconds : 0,
    protectContent: Boolean(data.protectContent),
    allowComments: data.allowComments !== false,
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function mapMemberDoc(data: Record<string, unknown>): ChatMember {
  return {
    uid: String(data.uid || ''),
    chatId: String(data.chatId || ''),
    role: (data.role as MemberRole) || 'member',
    displayName: String(data.displayName || 'مستخدم'),
    username: typeof data.username === 'string' ? data.username : undefined,
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
    typingAt: data.typingAt ? tsToMillis(data.typingAt) : undefined,
    lastReadAt: data.lastReadAt ? tsToMillis(data.lastReadAt) : undefined,
    joinedAt: tsToMillis(data.joinedAt),
  };
}

export function mapMessageDoc(data: Record<string, unknown>, id: string): Message {
  return {
    id,
    chatId: String(data.chatId || ''),
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || 'مستخدم'),
    senderPhotoURL: typeof data.senderPhotoURL === 'string' ? data.senderPhotoURL : undefined,
    type: (data.type as MessageType) || 'text',
    text: String(data.text || ''),
    mediaDataUrl: typeof data.mediaDataUrl === 'string' ? data.mediaDataUrl : undefined,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    mediaChunkCount: typeof data.mediaChunkCount === 'number' ? data.mediaChunkCount : undefined,
    mediaDurationSec: typeof data.mediaDurationSec === 'number' ? data.mediaDurationSec : undefined,
    fileName: typeof data.fileName === 'string' ? data.fileName : undefined,
    fileSize: typeof data.fileSize === 'number' ? data.fileSize : undefined,
    fileMimeType: typeof data.fileMimeType === 'string' ? data.fileMimeType : undefined,
    replyToId: typeof data.replyToId === 'string' ? data.replyToId : undefined,
    replyToSenderName: typeof data.replyToSenderName === 'string' ? data.replyToSenderName : undefined,
    replyToText: typeof data.replyToText === 'string' ? data.replyToText : undefined,
    forwardedFromName: typeof data.forwardedFromName === 'string' ? data.forwardedFromName : undefined,
    pollQuestion: typeof data.pollQuestion === 'string' ? data.pollQuestion : undefined,
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions.map(String) : undefined,
    editedAt: data.editedAt ? tsToMillis(data.editedAt) : undefined,
    ttlSeconds: typeof data.ttlSeconds === 'number' ? data.ttlSeconds : undefined,
    stickerId: typeof data.stickerId === 'string' ? data.stickerId : undefined,
    stickerPackId: typeof data.stickerPackId === 'string' ? data.stickerPackId : undefined,
    stickerAnim: typeof data.stickerAnim === 'string' ? (data.stickerAnim as StickerAnimation) : undefined,
    isPinned: typeof data.isPinned === 'boolean' ? data.isPinned : undefined,
    pinnedAt: data.pinnedAt ? tsToMillis(data.pinnedAt) : undefined,
    pinnedBy: typeof data.pinnedBy === 'string' ? data.pinnedBy : undefined,
    isDeleted: Boolean(data.isDeleted),
    createdAt: tsToMillis(data.createdAt),
  };
}

export function mapUserChatItem(data: Record<string, unknown>): UserChatItem {
  return {
    chatId: String(data.chatId || ''),
    userId: String(data.userId || ''),
    type: (data.type as ChatType) || 'direct',
    title: String(data.title || 'محادثة'),
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : undefined,
    folder: (data.folder as FolderKey) || 'all',
    pinned: Boolean(data.pinned),
    muted: Boolean(data.muted),
    peerUserId: typeof data.peerUserId === 'string' ? data.peerUserId : undefined,
    createdBy: String(data.createdBy || ''),
    lastReadAt: data.lastReadAt ? tsToMillis(data.lastReadAt) : undefined,
    joinedAt: tsToMillis(data.joinedAt),
  };
}

export function mapStickerPackDoc(data: Record<string, unknown>, id: string): StickerPack {
  return {
    id,
    ownerId: String(data.ownerId || ''),
    title: String(data.title || 'حزمة ملصقات'),
    coverDataUrl: typeof data.coverDataUrl === 'string' ? data.coverDataUrl : undefined,
    stickerCount: typeof data.stickerCount === 'number' ? data.stickerCount : 0,
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function mapCustomStickerDoc(data: Record<string, unknown>, id: string): CustomSticker {
  return {
    id,
    packId: String(data.packId || ''),
    ownerId: String(data.ownerId || ''),
    label: String(data.label || 'ملصق'),
    mediaDataUrl: String(data.mediaDataUrl || ''),
    mimeType: String(data.mimeType || 'image/png'),
    animation: (data.animation as StickerAnimation) || 'none',
    createdAt: tsToMillis(data.createdAt),
  };
}

export async function createStickerPack(
  ownerUid: string,
  title: string,
  stickers: Array<{
    label: string;
    mediaDataUrl: string;
    mimeType: string;
    animation: StickerAnimation;
  }>,
  coverDataUrl?: string
): Promise<string> {
  const cleanTitle = clampString(title, 60);
  if (!cleanTitle) throw new Error('يرجى إدخال اسم حزمة الملصقات');
  if (stickers.length === 0) throw new Error('يرجى اختيار ملصق واحد على الأقل من المعرض');
  if (stickers.length > 50) throw new Error('الحد الأقصى لكل حزمة هو 50 ملصقاً');

  const packId = makeSafeId('stkpack');
  try {
    const batch = writeBatch(db);
    const packPayload: Record<string, unknown> = {
      id: packId,
      ownerId: ownerUid,
      title: cleanTitle,
      stickerCount: stickers.length,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (coverDataUrl && coverDataUrl.length <= 200000) {
      packPayload.coverDataUrl = coverDataUrl;
    }

    batch.set(doc(db, 'sticker_packs', packId), packPayload);

    for (const st of stickers) {
      const stickerId = makeSafeId('stk');
      batch.set(doc(db, 'sticker_packs', packId, 'stickers', stickerId), {
        id: stickerId,
        packId,
        ownerId: ownerUid,
        label: clampString(st.label || 'ملصق', 60),
        mediaDataUrl: st.mediaDataUrl,
        mimeType: clampString(st.mimeType || 'image/png', 80),
        animation: st.animation,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return packId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sticker_packs/${packId}`);
  }
}

export async function addStickersToPack(
  ownerUid: string,
  pack: StickerPack,
  stickers: Array<{
    label: string;
    mediaDataUrl: string;
    mimeType: string;
    animation: StickerAnimation;
  }>,
  coverDataUrl?: string
): Promise<void> {
  if (stickers.length === 0) return;
  const nextCount = pack.stickerCount + stickers.length;
  if (nextCount > 50) {
    throw new Error('لا يمكن إضافة أكثر من 50 ملصقاً في الحزمة الواحدة');
  }

  try {
    const batch = writeBatch(db);
    for (const st of stickers) {
      const stickerId = makeSafeId('stk');
      batch.set(doc(db, 'sticker_packs', pack.id, 'stickers', stickerId), {
        id: stickerId,
        packId: pack.id,
        ownerId: ownerUid,
        label: clampString(st.label || 'ملصق', 60),
        mediaDataUrl: st.mediaDataUrl,
        mimeType: clampString(st.mimeType || 'image/png', 80),
        animation: st.animation,
        createdAt: serverTimestamp(),
      });
    }

    const packUpdate: Record<string, unknown> = {
      stickerCount: nextCount,
      updatedAt: serverTimestamp(),
    };
    if (!pack.coverDataUrl && coverDataUrl && coverDataUrl.length <= 200000) {
      packUpdate.coverDataUrl = coverDataUrl;
    }
    batch.update(doc(db, 'sticker_packs', pack.id), packUpdate);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sticker_packs/${pack.id}`);
  }
}

export async function deleteCustomSticker(pack: StickerPack, stickerId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'sticker_packs', pack.id, 'stickers', stickerId));
    batch.update(doc(db, 'sticker_packs', pack.id), {
      stickerCount: Math.max(0, pack.stickerCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sticker_packs/${pack.id}/stickers/${stickerId}`);
  }
}

export async function deleteStickerPack(packId: string): Promise<void> {
  try {
    const stickersSnap = await getDocs(collection(db, 'sticker_packs', packId, 'stickers'));
    const stickerRefs = stickersSnap.docs.map((d) => d.ref);
    for (let i = 0; i < stickerRefs.length; i += 200) {
      const batch = writeBatch(db);
      for (const ref of stickerRefs.slice(i, i + 200)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
    await deleteDoc(doc(db, 'sticker_packs', packId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sticker_packs/${packId}`);
  }
}

export function collectionMessages(chatId: string) {
  return collection(db, 'chats', chatId, 'messages');
}

export function mapScheduledMessageDoc(
  data: Record<string, unknown>,
  id: string
): ScheduledMessage {
  return {
    id,
    chatId: String(data.chatId || ''),
    senderId: String(data.senderId || ''),
    senderName: String(data.senderName || 'مستخدم'),
    senderPhotoURL: typeof data.senderPhotoURL === 'string' ? data.senderPhotoURL : undefined,
    type: (data.type as MessageType) || 'text',
    text: String(data.text || ''),
    mediaDataUrl: typeof data.mediaDataUrl === 'string' ? data.mediaDataUrl : undefined,
    fileMimeType: typeof data.fileMimeType === 'string' ? data.fileMimeType : undefined,
    replyToId: typeof data.replyToId === 'string' ? data.replyToId : undefined,
    replyToSenderName: typeof data.replyToSenderName === 'string' ? data.replyToSenderName : undefined,
    replyToText: typeof data.replyToText === 'string' ? data.replyToText : undefined,
    stickerId: typeof data.stickerId === 'string' ? data.stickerId : undefined,
    stickerPackId: typeof data.stickerPackId === 'string' ? data.stickerPackId : undefined,
    stickerAnim: typeof data.stickerAnim === 'string' ? (data.stickerAnim as StickerAnimation) : undefined,
    scheduledFor: tsToMillis(data.scheduledFor),
    status:
      data.status === 'sent' || data.status === 'cancelled'
        ? data.status
        : 'pending',
    createdAt: tsToMillis(data.createdAt),
  };
}

export async function scheduleMessage(
  currentUser: PublicUser,
  chat: Chat,
  payload: {
    type: 'text' | 'image' | 'sticker';
    text: string;
    scheduledFor: number;
    mediaDataUrl?: string;
    fileMimeType?: string;
    replyTo?: Message | null;
    stickerId?: string;
    stickerPackId?: string;
    stickerAnim?: StickerAnimation;
  }
): Promise<string> {
  const minTime = Date.now() + 15000;
  if (!Number.isFinite(payload.scheduledFor) || payload.scheduledFor < minTime) {
    throw new Error('يرجى اختيار وقت مستقبلي بعد 15 ثانية على الأقل من الآن');
  }

  const cleanText = clampString(payload.text, 4000);
  if (payload.type === 'text' && !cleanText) {
    throw new Error('لا يمكن جدولة رسالة نصية فارغة');
  }

  const scheduledId = makeSafeId('sched');
  const docPayload: Record<string, unknown> = {
    id: scheduledId,
    chatId: chat.id,
    senderId: currentUser.uid,
    senderName: clampString(currentUser.displayName, 80),
    type: payload.type,
    text: cleanText,
    scheduledFor: Timestamp.fromMillis(Math.round(payload.scheduledFor)),
    status: 'pending',
    createdAt: serverTimestamp(),
  };

  if (currentUser.photoURL && currentUser.photoURL.length <= 150000) {
    docPayload.senderPhotoURL = currentUser.photoURL;
  }
  if (payload.mediaDataUrl && payload.mediaDataUrl.length <= 800000) {
    docPayload.mediaDataUrl = payload.mediaDataUrl;
  }
  if (payload.fileMimeType) docPayload.fileMimeType = clampString(payload.fileMimeType, 120);
  if (payload.stickerId) docPayload.stickerId = clampString(payload.stickerId, 128);
  if (payload.stickerPackId) docPayload.stickerPackId = clampString(payload.stickerPackId, 128);
  if (payload.stickerAnim) docPayload.stickerAnim = payload.stickerAnim;

  if (payload.replyTo) {
    docPayload.replyToId = payload.replyTo.id;
    docPayload.replyToSenderName = clampString(payload.replyTo.senderName, 80);
    const replySnippet =
      payload.replyTo.text ||
      (payload.replyTo.type === 'image'
        ? 'صورة'
        : payload.replyTo.type === 'sticker'
        ? 'ملصق متحرك'
        : payload.replyTo.type === 'audio'
        ? payload.replyTo.fileName || 'رسالة صوتية'
        : payload.replyTo.type === 'file'
        ? payload.replyTo.fileName || 'ملف مرفق'
        : payload.replyTo.pollQuestion || 'رسالة');
    docPayload.replyToText = clampString(replySnippet, 200);
  }

  try {
    await setDoc(doc(db, 'chats', chat.id, 'scheduled_messages', scheduledId), docPayload);
    return scheduledId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}/scheduled_messages/${scheduledId}`);
  }
}

export async function rescheduleMessage(
  chatId: string,
  scheduledId: string,
  scheduledFor: number,
  newText?: string
): Promise<void> {
  if (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() + 15000) {
    throw new Error('يرجى اختيار وقت مستقبلي بعد 15 ثانية على الأقل من الآن');
  }

  const updates: Record<string, unknown> = {
    scheduledFor: Timestamp.fromMillis(Math.round(scheduledFor)),
  };
  if (typeof newText === 'string') {
    const clean = clampString(newText, 4000);
    if (!clean) throw new Error('نص الرسالة المجدولة لا يمكن أن يكون فارغاً');
    updates.text = clean;
  }

  try {
    await updateDoc(doc(db, 'chats', chatId, 'scheduled_messages', scheduledId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/scheduled_messages/${scheduledId}`);
  }
}

export async function cancelScheduledMessage(chatId: string, scheduledId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'scheduled_messages', scheduledId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/scheduled_messages/${scheduledId}`);
  }
}

export async function dispatchScheduledMessageNow(
  currentUser: PublicUser,
  chat: Chat,
  scheduled: ScheduledMessage
): Promise<boolean> {
  const schedRef = doc(db, 'chats', chat.id, 'scheduled_messages', scheduled.id);
  let claimed = false;

  try {
    claimed = await runTransaction(db, async (tx) => {
      const snap = await tx.get(schedRef);
      if (!snap.exists()) return false;
      const data = snap.data();
      if (data.status !== 'pending') return false;
      tx.update(schedRef, { status: 'sent' });
      return true;
    });
  } catch {
    return false;
  }

  if (!claimed) return false;

  const syntheticReply: Message | null = scheduled.replyToId
    ? {
        id: scheduled.replyToId,
        chatId: chat.id,
        senderId: '',
        senderName: scheduled.replyToSenderName || 'مستخدم',
        type: 'text',
        text: scheduled.replyToText || '',
        isDeleted: false,
        createdAt: 0,
      }
    : null;

  try {
    await sendMessage(currentUser, chat, {
      type: scheduled.type,
      text: scheduled.text,
      mediaDataUrl: scheduled.mediaDataUrl,
      fileMimeType: scheduled.fileMimeType,
      replyTo: syntheticReply,
      stickerId: scheduled.stickerId,
      stickerPackId: scheduled.stickerPackId,
      stickerAnim: scheduled.stickerAnim,
    });
    await deleteDoc(schedRef).catch(() => {});
    return true;
  } catch (error) {
    await updateDoc(schedRef, { status: 'pending' }).catch(() => {});
    throw error;
  }
}

export async function updateChatAdvancedSettings(
  chatId: string,
  updates: {
    slowModeSeconds?: number;
    protectContent?: boolean;
    allowComments?: boolean;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (typeof updates.slowModeSeconds === 'number') {
    payload.slowModeSeconds = Math.max(0, Math.min(3600, Math.round(updates.slowModeSeconds)));
  }
  if (typeof updates.protectContent === 'boolean') {
    payload.protectContent = updates.protectContent;
  }
  if (typeof updates.allowComments === 'boolean') {
    payload.allowComments = updates.allowComments;
  }
  try {
    await updateDoc(doc(db, 'chats', chatId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}`);
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = 'zn';
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function createOrRegenerateInviteLink(
  currentUser: PublicUser,
  chat: Chat
): Promise<string> {
  if (chat.type !== 'group' && chat.type !== 'channel') {
    throw new Error('روابط الدعوة متاحة للمجموعات والقنوات فقط');
  }
  const newCode = generateInviteCode();
  const batch = writeBatch(db);
  if (chat.inviteCode && chat.inviteCode.length >= 6) {
    batch.delete(doc(db, 'invite_links', chat.inviteCode));
  }
  const invitePayload: Record<string, unknown> = {
    code: newCode,
    chatId: chat.id,
    title: clampString(chat.title, 100),
    type: chat.type,
    memberCount: Math.max(1, chat.memberCount || 1),
    createdBy: currentUser.uid,
    createdAt: serverTimestamp(),
  };
  if (chat.photoURL && chat.photoURL.length <= 150000) {
    invitePayload.photoURL = chat.photoURL;
  }
  batch.set(doc(db, 'invite_links', newCode), invitePayload);
  batch.update(doc(db, 'chats', chat.id), {
    inviteCode: newCode,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    return newCode;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `invite_links/${newCode}`);
  }
}

export async function revokeInviteLink(chat: Chat): Promise<void> {
  if (!chat.inviteCode) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'invite_links', chat.inviteCode));
  batch.update(doc(db, 'chats', chat.id), {
    inviteCode: '',
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${chat.id}`);
  }
}

export async function resolveInviteLink(rawCode: string): Promise<InviteLink | null> {
  const code = rawCode.trim();
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(code)) return null;
  try {
    const snap = await getDoc(doc(db, 'invite_links', code));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      code: String(d.code || code),
      chatId: String(d.chatId || ''),
      title: String(d.title || 'مجموعة ZENO'),
      type: d.type === 'channel' ? 'channel' : 'group',
      photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined,
      memberCount: typeof d.memberCount === 'number' ? d.memberCount : 1,
      createdBy: String(d.createdBy || ''),
      createdAt: tsToMillis(d.createdAt),
    };
  } catch {
    return null;
  }
}

export async function joinChatByInvite(
  currentUser: PublicUser,
  invite: InviteLink
): Promise<string> {
  try {
    const existingItem = await getDoc(
      doc(db, 'user_chats', currentUser.uid, 'items', invite.chatId)
    );
    if (existingItem.exists()) {
      return invite.chatId;
    }

    const batch = writeBatch(db);
    const folder: FolderKey = invite.type === 'channel' ? 'channels' : 'groups';

    const memberPhoto = safePhotoUrl(currentUser.photoURL);
    const memberUname = safeUsername(currentUser.username);
    const invitePhoto = safePhotoUrl(invite.photoURL);

    batch.set(doc(db, 'chats', invite.chatId, 'members', currentUser.uid), {
      uid: currentUser.uid,
      chatId: invite.chatId,
      role: 'member',
      displayName: safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80),
      ...(memberUname ? { username: memberUname } : {}),
      ...(memberPhoto ? { photoURL: memberPhoto } : {}),
      joinedAt: serverTimestamp(),
    });

    batch.update(doc(db, 'chats', invite.chatId), {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    batch.set(doc(db, 'user_chats', currentUser.uid, 'items', invite.chatId), {
      chatId: invite.chatId,
      userId: currentUser.uid,
      type: invite.type,
      title: safeDisplayName(invite.title, 'مجموعة', 100),
      ...(invitePhoto ? { photoURL: invitePhoto } : {}),
      folder,
      pinned: false,
      muted: false,
      createdBy: currentUser.uid,
      lastReadAt: serverTimestamp(),
      joinedAt: serverTimestamp(),
    });

    await batch.commit();
    return invite.chatId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chats/${invite.chatId}/members/${currentUser.uid}`);
  }
}

export async function batchDeleteMessages(
  chatId: string,
  messagesToDelete: Message[]
): Promise<void> {
  if (messagesToDelete.length === 0) return;
  try {
    for (let i = 0; i < messagesToDelete.length; i += 400) {
      const batch = writeBatch(db);
      for (const msg of messagesToDelete.slice(i, i + 400)) {
        batch.update(doc(db, 'chats', chatId, 'messages', msg.id), {
          isDeleted: true,
          text: '',
          editedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `chats/${chatId}/messages`);
  }
}

export function mapChannelCommentDoc(data: Record<string, unknown>, id: string): ChannelComment {
  return {
    id: String(data.id || id),
    chatId: String(data.chatId || ''),
    messageId: String(data.messageId || ''),
    authorId: String(data.authorId || ''),
    authorName: String(data.authorName || 'مستخدم'),
    authorPhotoURL: typeof data.authorPhotoURL === 'string' ? data.authorPhotoURL : undefined,
    text: String(data.text || ''),
    createdAt: tsToMillis(data.createdAt),
  };
}

export async function addChannelComment(
  currentUser: PublicUser,
  chatId: string,
  messageId: string,
  text: string
): Promise<void> {
  const cleanText = clampString(text, 1000);
  if (!cleanText) return;
  const commentId = makeSafeId('cmt');
  const payload: Record<string, unknown> = {
    id: commentId,
    chatId,
    messageId,
    authorId: currentUser.uid,
    authorName: clampString(currentUser.displayName, 80),
    text: cleanText,
    createdAt: serverTimestamp(),
  };
  if (currentUser.photoURL && currentUser.photoURL.length <= 150000) {
    payload.authorPhotoURL = currentUser.photoURL;
  }
  try {
    await setDoc(doc(db, 'chats', chatId, 'comments', commentId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/comments/${commentId}`);
  }
}

export async function deleteChannelComment(chatId: string, commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'chats', chatId, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `chats/${chatId}/comments/${commentId}`);
  }
}

const storyBlobCache = new Map<string, Blob>();
const storyObjectUrlCache = new Map<string, string>();
const STORY_MAX_CHUNKS = 125;

export function mapStoryDoc(data: Record<string, unknown>, id: string): Story {
  const rawType = String(data.type || 'text');
  const storyType: Story['type'] =
    rawType === 'video' ? 'video' : rawType === 'image' ? 'image' : 'text';

  return {
    id: String(data.id || id),
    ownerId: String(data.ownerId || ''),
    ownerName: String(data.ownerName || 'مستخدم'),
    ownerPhotoURL: typeof data.ownerPhotoURL === 'string' ? data.ownerPhotoURL : undefined,
    type: storyType,
    text: String(data.text || ''),
    mediaDataUrl: typeof data.mediaDataUrl === 'string' ? data.mediaDataUrl : undefined,
    mediaUrl: typeof data.mediaUrl === 'string' ? data.mediaUrl : undefined,
    fileMimeType: typeof data.fileMimeType === 'string' ? data.fileMimeType : undefined,
    mediaDurationSec:
      typeof data.mediaDurationSec === 'number' && Number.isFinite(data.mediaDurationSec)
        ? data.mediaDurationSec
        : undefined,
    mediaChunkCount:
      typeof data.mediaChunkCount === 'number' && Number.isFinite(data.mediaChunkCount)
        ? data.mediaChunkCount
        : undefined,
    thumbnailDataUrl:
      typeof data.thumbnailDataUrl === 'string' ? data.thumbnailDataUrl : undefined,
    bgColor: typeof data.bgColor === 'string' ? data.bgColor : undefined,
    isActive: data.isActive !== false,
    expiresAt: tsToMillis(data.expiresAt),
    createdAt: tsToMillis(data.createdAt),
  };
}

export function mapStoryViewDoc(data: Record<string, unknown>, id: string): StoryView {
  return {
    uid: String(data.uid || id),
    storyId: String(data.storyId || ''),
    storyOwnerId: String(data.storyOwnerId || ''),
    viewerName: String(data.viewerName || 'مستخدم'),
    viewerPhotoURL: typeof data.viewerPhotoURL === 'string' ? data.viewerPhotoURL : undefined,
    viewedAt: tsToMillis(data.viewedAt),
  };
}

const STORY_UPLOAD_BATCH_SIZE = 3;
const STORY_UPLOAD_CONCURRENCY = 4;
const STORY_DOWNLOAD_CONCURRENCY = 12;

export async function createStory(
  currentUser: PublicUser,
  payload: {
    type: 'text' | 'image' | 'video';
    text: string;
    mediaDataUrl?: string;
    mediaFile?: Blob;
    fileMimeType?: string;
    mediaDurationSec?: number;
    thumbnailDataUrl?: string;
    bgColor?: string;
    onProgress?: (percent: number) => void;
  }
): Promise<string> {
  const storyId = makeSafeId('st');
  const cleanText = clampString(payload.text, 400);
  if (payload.type === 'text' && !cleanText) {
    throw new Error('يرجى كتابة نص للحالة');
  }
  if (isWriteQuotaCooldownActive()) {
    throw new Error(
      'تم استهلاك الحد اليومي المجاني لعمليات الكتابة في قاعدة البيانات. يُعاد تصفير الحصة تلقائياً في اليوم التالي.'
    );
  }
  if (
    payload.type === 'video' &&
    typeof payload.mediaDurationSec === 'number' &&
    Number.isFinite(payload.mediaDurationSec) &&
    payload.mediaDurationSec > MAX_STORY_VIDEO_DURATION_SEC
  ) {
    throw new Error('الحد الأقصى لمدة فيديو الحالة هو دقيقة واحدة (60 ثانية)');
  }

  const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
  const docPayload: Record<string, unknown> = {
    id: storyId,
    ownerId: currentUser.uid,
    ownerName: safeDisplayName(currentUser.displayName, 'مستخدم ZENO', 80),
    type: payload.type,
    text: cleanText,
    isActive: true,
    expiresAt,
    createdAt: serverTimestamp(),
  };

  const ownerPhoto = safePhotoUrl(currentUser.photoURL);
  if (ownerPhoto) {
    docPayload.ownerPhotoURL = ownerPhoto;
  }
  if (payload.bgColor) {
    docPayload.bgColor = clampString(payload.bgColor, 160);
  }
  if (payload.fileMimeType) {
    docPayload.fileMimeType = clampString(payload.fileMimeType, 120);
  }
  if (typeof payload.mediaDurationSec === 'number' && Number.isFinite(payload.mediaDurationSec)) {
    docPayload.mediaDurationSec = Math.min(
      MAX_STORY_VIDEO_DURATION_SEC,
      Math.max(0, Math.round(payload.mediaDurationSec * 10) / 10)
    );
  }
  if (payload.thumbnailDataUrl && payload.thumbnailDataUrl.length <= 150000) {
    docPayload.thumbnailDataUrl = payload.thumbnailDataUrl;
  }

  let chunkedBlob: Blob | null = null;
  let totalChunks = 0;
  let uploadedStoryStorageUrl: string | undefined;

  if (payload.mediaFile) {
    const fileBlob = payload.mediaFile;
    if (fileBlob.size > MAX_STORY_VIDEO_BYTES) {
      throw new Error(`حجم الفيديو يتجاوز الحد المسموح (${formatFileSize(MAX_STORY_VIDEO_BYTES)})`);
    }
    if (!docPayload.fileMimeType && fileBlob.type) {
      docPayload.fileMimeType = clampString(fileBlob.type, 120);
    }

    if (fileBlob.size <= 460 * 1024) {
      const inlineUrl = await blobToDataUrl(fileBlob, 500 * 1024);
      if (inlineUrl.length <= 740000) {
        docPayload.mediaDataUrl = inlineUrl;
        storyBlobCache.set(storyId, fileBlob);
      } else {
        chunkedBlob = fileBlob;
      }
    } else {
      chunkedBlob = fileBlob;
    }
  } else if (payload.mediaDataUrl) {
    if (payload.mediaDataUrl.length <= 740000) {
      docPayload.mediaDataUrl = payload.mediaDataUrl;
    } else {
      chunkedBlob = dataUrlToBlob(
        payload.mediaDataUrl,
        payload.fileMimeType || 'video/webm'
      );
    }
  }

  if (chunkedBlob) {
    const storageUrl = await tryUploadBlobToStorage(
      `stories/${currentUser.uid}/${storyId}`,
      chunkedBlob,
      String(docPayload.fileMimeType || chunkedBlob.type || 'video/mp4'),
      (pct) => payload.onProgress?.(Math.min(95, pct))
    );

    if (storageUrl) {
      uploadedStoryStorageUrl = storageUrl;
      docPayload.mediaUrl = storageUrl;
      docPayload.isActive = true;
      storyBlobCache.set(storyId, chunkedBlob);
      void setCachedMediaBlob(`story_${storyId}`, chunkedBlob);
      chunkedBlob = null;
    } else {
      totalChunks = Math.ceil(chunkedBlob.size / BINARY_CHUNK_SIZE);
      if (totalChunks > STORY_MAX_CHUNKS) {
        throw new Error(`حجم الفيديو يتجاوز الحد الأقصى (${formatFileSize(MAX_STORY_VIDEO_BYTES)})`);
      }
      docPayload.mediaChunkCount = totalChunks;
      // Keep story hidden until every chunk finishes committing
      docPayload.isActive = false;
    }
  }

  try {
    await setDoc(doc(db, 'stories', storyId), docPayload);
  } catch (error) {
    if (uploadedStoryStorageUrl) {
      void tryDeleteStorageByUrl(uploadedStoryStorageUrl);
    }
    handleFirestoreError(error, OperationType.CREATE, `stories/${storyId}`);
  }

  if (chunkedBlob && totalChunks > 0) {
    storyBlobCache.set(storyId, chunkedBlob);
    void setCachedMediaBlob(`story_${storyId}`, chunkedBlob);
    const uploadedChunkIds: string[] = [];
    const batchRanges: Array<{ start: number; end: number }> = [];
    for (let start = 0; start < totalChunks; start += STORY_UPLOAD_BATCH_SIZE) {
      batchRanges.push({
        start,
        end: Math.min(start + STORY_UPLOAD_BATCH_SIZE, totalChunks),
      });
    }

    let nextBatchIndex = 0;
    let completedChunks = 0;
    let firstFailure: unknown = null;

    const uploadWorker = async () => {
      while (!firstFailure) {
        const myIndex = nextBatchIndex;
        nextBatchIndex += 1;
        if (myIndex >= batchRanges.length) return;

        const { start, end } = batchRanges[myIndex];
        try {
          const sliceBuffers = await Promise.all(
            Array.from({ length: end - start }, async (_, offset) => {
              const idx = start + offset;
              const byteStart = idx * BINARY_CHUNK_SIZE;
              const byteEnd = Math.min(byteStart + BINARY_CHUNK_SIZE, chunkedBlob.size);
              const buffer = await chunkedBlob.slice(byteStart, byteEnd).arrayBuffer();
              return { idx, chunkId: `${storyId}_${idx}`, data: Bytes.fromUint8Array(new Uint8Array(buffer)) };
            })
          );

          let lastBatchErr: unknown;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            if (firstFailure) return;
            try {
              const batch = writeBatch(db);
              for (const item of sliceBuffers) {
                batch.set(doc(db, 'stories', storyId, 'chunks', item.chunkId), {
                  id: item.chunkId,
                  storyId,
                  ownerId: currentUser.uid,
                  chunkIndex: item.idx,
                  data: item.data,
                  createdAt: serverTimestamp(),
                });
              }
              await batch.commit();
              lastBatchErr = undefined;
              break;
            } catch (batchErr) {
              lastBatchErr = batchErr;
              if (isFirestoreQuotaError(batchErr) || attempt === 2) {
                throw batchErr;
              }
              await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
            }
          }
          if (lastBatchErr) {
            throw lastBatchErr;
          }

          for (const item of sliceBuffers) {
            uploadedChunkIds.push(item.chunkId);
          }
          completedChunks += sliceBuffers.length;
          payload.onProgress?.(Math.min(97, Math.round((completedChunks / totalChunks) * 97)));
        } catch (err) {
          if (!firstFailure) {
            firstFailure = err;
          }
          return;
        }
      }
    };

    try {
      const workerCount = Math.min(STORY_UPLOAD_CONCURRENCY, batchRanges.length);
      await Promise.all(Array.from({ length: workerCount }, () => uploadWorker()));
      if (firstFailure) {
        throw firstFailure;
      }

      // Activate story only after 100% of chunks are safely committed
      await updateDoc(doc(db, 'stories', storyId), { isActive: true });
      payload.onProgress?.(100);
    } catch (error) {
      storyBlobCache.delete(storyId);
      void deleteCachedMediaBlob(`story_${storyId}`);
      for (let i = 0; i < uploadedChunkIds.length; i += 200) {
        try {
          const rb = writeBatch(db);
          for (const cid of uploadedChunkIds.slice(i, i + 200)) {
            rb.delete(doc(db, 'stories', storyId, 'chunks', cid));
          }
          await rb.commit();
        } catch {
          // Best-effort cleanup
        }
      }
      try {
        await deleteDoc(doc(db, 'stories', storyId));
      } catch {
        // Best-effort cleanup
      }
      handleFirestoreError(error, OperationType.WRITE, `stories/${storyId}/chunks`);
    }
  } else {
    payload.onProgress?.(100);
  }

  return storyId;
}

function resolvePlayableVideoMime(bytes: Uint8Array, declaredMime?: string): string {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return 'video/webm';
  }
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'video/mp4';
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return 'video/ogg';
  }
  const clean = (declaredMime || '').trim().toLowerCase();
  if (clean === 'video/quicktime') return 'video/mp4';
  if (clean.startsWith('video/')) return clean;
  return 'video/mp4';
}

export async function getStoryMediaUrl(
  story: Story,
  onProgress?: (percent: number) => void
): Promise<string> {
  if (story.mediaUrl) {
    onProgress?.(100);
    return story.mediaUrl;
  }

  const cachedObj = storyObjectUrlCache.get(story.id);
  if (cachedObj) {
    onProgress?.(100);
    return cachedObj;
  }

  if (story.mediaDataUrl) {
    if (story.type === 'video') {
      const rawBlob = dataUrlToBlob(
        story.mediaDataUrl,
        story.fileMimeType || 'video/mp4'
      );
      const header = new Uint8Array(await rawBlob.slice(0, 16).arrayBuffer());
      const playableMime = resolvePlayableVideoMime(header, story.fileMimeType || rawBlob.type);
      const finalBlob =
        rawBlob.type === playableMime ? rawBlob : new Blob([rawBlob], { type: playableMime });
      storyBlobCache.set(story.id, finalBlob);
      const objUrl = URL.createObjectURL(finalBlob);
      storyObjectUrlCache.set(story.id, objUrl);
      onProgress?.(100);
      return objUrl;
    }

    const objUrl = dataUrlToObjectUrl(
      story.mediaDataUrl,
      story.fileMimeType || 'image/jpeg'
    );
    storyObjectUrlCache.set(story.id, objUrl);
    onProgress?.(100);
    return objUrl;
  }

  const cachedBlob = storyBlobCache.get(story.id);
  if (cachedBlob) {
    let finalBlob = cachedBlob;
    if (story.type === 'video') {
      const header = new Uint8Array(await cachedBlob.slice(0, 16).arrayBuffer());
      const playableMime = resolvePlayableVideoMime(header, story.fileMimeType || cachedBlob.type);
      if (cachedBlob.type !== playableMime) {
        finalBlob = new Blob([cachedBlob], { type: playableMime });
        storyBlobCache.set(story.id, finalBlob);
      }
    }
    const objUrl = URL.createObjectURL(finalBlob);
    storyObjectUrlCache.set(story.id, objUrl);
    onProgress?.(100);
    return objUrl;
  }

  const persistedBlob = await getCachedMediaBlob(`story_${story.id}`);
  if (persistedBlob) {
    let finalBlob = persistedBlob;
    if (story.type === 'video') {
      const header = new Uint8Array(await persistedBlob.slice(0, 16).arrayBuffer());
      const playableMime = resolvePlayableVideoMime(header, story.fileMimeType || persistedBlob.type);
      if (persistedBlob.type !== playableMime) {
        finalBlob = new Blob([persistedBlob], { type: playableMime });
      }
    }
    storyBlobCache.set(story.id, finalBlob);
    const objUrl = URL.createObjectURL(finalBlob);
    storyObjectUrlCache.set(story.id, objUrl);
    onProgress?.(100);
    return objUrl;
  }

  const expectedCount = story.mediaChunkCount || 0;
  try {
    let orderedData: (Bytes | string)[] = [];
    if (expectedCount > 0) {
      let missingChunkDetected = false;
      for (let start = 0; start < expectedCount; start += STORY_DOWNLOAD_CONCURRENCY) {
        const end = Math.min(start + STORY_DOWNLOAD_CONCURRENCY, expectedCount);
        const indices = Array.from({ length: end - start }, (_, i) => start + i);
        const snaps = await Promise.all(
          indices.map((idx) =>
            getImmutableChunkDoc(doc(db, 'stories', story.id, 'chunks', `${story.id}_${idx}`))
          )
        );
        const missingOffsets = snaps
          .map((snap, offset) => (snap.exists() ? -1 : offset))
          .filter((offset) => offset >= 0);

        if (missingOffsets.length > 0) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const retried = await Promise.all(
            missingOffsets.map((offset) =>
              getImmutableChunkDoc(doc(db, 'stories', story.id, 'chunks', `${story.id}_${indices[offset]}`))
            )
          );
          missingOffsets.forEach((offset, i) => {
            snaps[offset] = retried[i];
          });
        }

        if (snaps.some((s) => !s.exists())) {
          missingChunkDetected = true;
          break;
        }
        for (const snap of snaps) {
          orderedData.push(snap.data()!.data as Bytes | string);
        }
        onProgress?.(Math.round((end / expectedCount) * 100));
      }

      if (missingChunkDetected) {
        if (isReadQuotaCooldownActive()) {
          throw new Error(
            'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.'
          );
        }
        const fallbackSnap = await getDocs(
          query(collection(db, 'stories', story.id, 'chunks'), where('storyId', '==', story.id))
        );
        if (fallbackSnap.docs.length >= expectedCount) {
          orderedData = fallbackSnap.docs
            .map((d) => d.data() as { chunkIndex?: number; data: Bytes | string })
            .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
            .map((c) => c.data);
          onProgress?.(100);
        } else {
          throw new Error('لم يكتمل رفع مقطع الفيديو لهذه الحالة (بعض الأجزاء مفقودة).');
        }
      }
    } else {
      if (isReadQuotaCooldownActive()) {
        throw new Error(
          'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.'
        );
      }
      const snap = await getDocs(
        query(collection(db, 'stories', story.id, 'chunks'), where('storyId', '==', story.id))
      );
      if (snap.empty) {
        throw new Error('لا توجد بيانات وسائط لهذه الحالة');
      }
      orderedData = snap.docs
        .map((d) => d.data() as { chunkIndex?: number; data: Bytes | string })
        .sort((a, b) => (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0))
        .map((c) => c.data);
      onProgress?.(100);
    }

    const fallbackMime = story.fileMimeType || (story.type === 'video' ? 'video/mp4' : 'image/jpeg');
    let finalBlob: Blob;
    if (orderedData.some((d) => typeof d === 'string')) {
      const fullDataUrl = orderedData.map((d) => (typeof d === 'string' ? d : '')).join('');
      const rawBlob = dataUrlToBlob(fullDataUrl, fallbackMime);
      if (story.type === 'video') {
        const header = new Uint8Array(await rawBlob.slice(0, 16).arrayBuffer());
        const playableMime = resolvePlayableVideoMime(header, story.fileMimeType || rawBlob.type);
        finalBlob = rawBlob.type === playableMime ? rawBlob : new Blob([rawBlob], { type: playableMime });
      } else {
        finalBlob = rawBlob;
      }
    } else {
      const parts = orderedData.map((d) => new Uint8Array((d as Bytes).toUint8Array()));
      let mime = fallbackMime;
      if (story.type === 'video' && parts.length > 0) {
        mime = resolvePlayableVideoMime(parts[0].slice(0, 16), story.fileMimeType);
      }
      finalBlob = new Blob(parts, { type: mime });
    }

    storyBlobCache.set(story.id, finalBlob);
    void setCachedMediaBlob(`story_${story.id}`, finalBlob);
    const objUrl = URL.createObjectURL(finalBlob);
    storyObjectUrlCache.set(story.id, objUrl);
    return objUrl;
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
      throw new Error(formatAppErrorMessage(error, 'تعذر تحميل الوسائط حالياً'));
    }
    if (
      error instanceof Error &&
      (error.message.includes('تعذر تحميل') ||
        error.message.includes('لم يكتمل رفع') ||
        error.message.includes('لا توجد بيانات'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.GET, `stories/${story.id}/chunks`);
  }
}

export async function deleteStory(storyId: string): Promise<void> {
  try {
    let mediaUrlToDelete: string | undefined;
    try {
      const cachedStory = await getDocFromCache(doc(db, 'stories', storyId));
      if (cachedStory.exists() && typeof cachedStory.data()?.mediaUrl === 'string') {
        mediaUrlToDelete = String(cachedStory.data()?.mediaUrl);
      }
    } catch {
      // Ignore cache miss
    }

    const [chunksSnap, viewsSnap] = await Promise.all([
      getDocs(query(collection(db, 'stories', storyId, 'chunks'), where('storyId', '==', storyId))).catch(() => null),
      getDocs(collection(db, 'stories', storyId, 'views')).catch(() => null),
    ]);

    const refs = [
      ...(chunksSnap ? chunksSnap.docs.map((d) => d.ref) : []),
      ...(viewsSnap ? viewsSnap.docs.map((d) => d.ref) : []),
    ];

    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    await deleteDoc(doc(db, 'stories', storyId));
    if (mediaUrlToDelete) {
      void tryDeleteStorageByUrl(mediaUrlToDelete);
    }
    const cachedObj = storyObjectUrlCache.get(storyId);
    if (cachedObj) {
      URL.revokeObjectURL(cachedObj);
      storyObjectUrlCache.delete(storyId);
    }
    storyBlobCache.delete(storyId);
    void deleteCachedMediaBlob(`story_${storyId}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
  }
}

export async function markStoryViewed(currentUser: PublicUser, story: Story): Promise<void> {
  if (story.ownerId === currentUser.uid) return;
  if (isWriteQuotaCooldownActive()) return;
  try {
    const viewRef = doc(db, 'stories', story.id, 'views', currentUser.uid);
    const existing = await getDoc(viewRef);
    if (existing.exists()) return;
    const payload: Record<string, unknown> = {
      uid: currentUser.uid,
      storyId: story.id,
      storyOwnerId: story.ownerId,
      viewerName: clampString(currentUser.displayName, 80),
      viewedAt: serverTimestamp(),
    };
    if (currentUser.photoURL && currentUser.photoURL.length <= 150000) {
      payload.viewerPhotoURL = currentUser.photoURL;
    }
    await setDoc(viewRef, payload);
  } catch (err) {
    if (isFirestoreQuotaError(err)) {
      markWriteQuotaCooldown();
    }
    // Non-blocking view receipt
  }
}

export async function listStoryViews(storyId: string): Promise<StoryView[]> {
  try {
    const snap = await getDocs(
      query(collection(db, 'stories', storyId, 'views'), orderBy('viewedAt', 'desc'), limit(100))
    );
    return snap.docs.map((d) => mapStoryViewDoc(d.data(), d.id));
  } catch {
    return [];
  }
}

export async function fetchMessagesForAdvancedSearch(
  chatIds: string[],
  options?: {
    startMs?: number;
    endMs?: number;
    perChatLimit?: number;
  }
): Promise<Message[]> {
  const uniqueIds = Array.from(new Set(chatIds.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const perChatLimit = Math.min(300, Math.max(20, options?.perChatLimit ?? 150));
  const hasDateRange =
    typeof options?.startMs === 'number' && typeof options?.endMs === 'number';
  const results: Message[] = [];

  for (let i = 0; i < uniqueIds.length; i += 6) {
    const batchIds = uniqueIds.slice(i, i + 6);
    const batchResults = await Promise.all(
      batchIds.map(async (chatId) => {
        try {
          const msgCol = collection(db, 'chats', chatId, 'messages');
          const q = hasDateRange
            ? query(
                msgCol,
                where('createdAt', '>=', Timestamp.fromMillis(options!.startMs!)),
                where('createdAt', '<=', Timestamp.fromMillis(options!.endMs!)),
                orderBy('createdAt', 'desc'),
                limit(perChatLimit)
              )
            : query(msgCol, orderBy('createdAt', 'desc'), limit(perChatLimit));

          const snap = await getDocs(q);
          return snap.docs
            .map((d) => mapMessageDoc(d.data(), d.id))
            .filter((m) => !m.isDeleted && m.type !== 'system');
        } catch {
          return [];
        }
      })
    );
    for (const list of batchResults) {
      results.push(...list);
    }
  }

  return results.sort((a, b) => b.createdAt - a.createdAt);
}



