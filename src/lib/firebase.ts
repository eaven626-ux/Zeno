import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  Firestore,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Timestamp,
} from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();
export const storage: FirebaseStorage | null = (() => {
  try {
    return firebaseConfig.storageBucket ? getStorage(app) : null;
  } catch {
    return null;
  }
})();
export const auth = getAuth(app);
auth.languageCode = 'ar';
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
const WRITE_QUOTA_STORAGE_KEY = `zeno_write_quota_until_${firebaseConfig.projectId}_${firebaseConfig.firestoreDatabaseId}`;
const READ_QUOTA_STORAGE_KEY = `zeno_read_quota_until_${firebaseConfig.projectId}_${firebaseConfig.firestoreDatabaseId}`;

function readStoredCooldown(key: string): number {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = Number(localStorage.getItem(key) || '0');
      return Number.isFinite(raw) ? raw : 0;
    }
  } catch {
    // Ignore storage access issues
  }
  return 0;
}

let writeQuotaCooldownUntil = readStoredCooldown(WRITE_QUOTA_STORAGE_KEY);
let readQuotaCooldownUntil = readStoredCooldown(READ_QUOTA_STORAGE_KEY);

function extractRawErrorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || '';
  if (typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || '');
  }
  return String(error);
}

function unwrapFirestoreErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: unknown };
      if (typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      // Not valid JSON
    }
  }
  return trimmed;
}

export function isFirestoreReadQuotaError(error: unknown): boolean {
  const text = unwrapFirestoreErrorMessage(extractRawErrorText(error)).toLowerCase();
  return (
    text.includes('free daily read units') ||
    text.includes('لعمليات القراءة') ||
    text.includes('لقراءة البيانات')
  );
}

export function isFirestoreWriteQuotaError(error: unknown): boolean {
  const text = unwrapFirestoreErrorMessage(extractRawErrorText(error)).toLowerCase();
  return (
    text.includes('free daily write units') ||
    text.includes('لعمليات الكتابة')
  );
}

export function isFirestoreQuotaError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const text = unwrapFirestoreErrorMessage(extractRawErrorText(error)).toLowerCase();
  return (
    code.includes('resource-exhausted') ||
    text.includes('quota limit exceeded') ||
    text.includes('quota exceeded') ||
    text.includes('free daily write units') ||
    text.includes('free daily read units') ||
    text.includes('resource-exhausted') ||
    text.includes('الحد اليومي المجاني')
  );
}

export function isFirestoreUnavailableError(error: unknown): boolean {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const text = unwrapFirestoreErrorMessage(extractRawErrorText(error)).toLowerCase();
  return (
    code.includes('unavailable') ||
    text.includes('unavailable') ||
    text.includes('could not reach cloud firestore backend') ||
    text.includes('connection failed') ||
    text.includes('client is offline') ||
    text.includes('network error')
  );
}

function notifyQuotaStateChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('zeno:quota-cooldown', {
        detail: {
          until: Math.max(writeQuotaCooldownUntil, readQuotaCooldownUntil),
          writeUntil: writeQuotaCooldownUntil,
          readUntil: readQuotaCooldownUntil,
        },
      })
    );
  }
}

export function getWriteQuotaCooldownUntil(): number {
  return writeQuotaCooldownUntil;
}

export function getReadQuotaCooldownUntil(): number {
  return readQuotaCooldownUntil;
}

export function markWriteQuotaCooldown(): void {
  writeQuotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WRITE_QUOTA_STORAGE_KEY, String(writeQuotaCooldownUntil));
    }
  } catch {
    // Ignore storage access issues
  }
  notifyQuotaStateChange();
}

export function markReadQuotaCooldown(): void {
  readQuotaCooldownUntil = Date.now() + QUOTA_COOLDOWN_MS;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(READ_QUOTA_STORAGE_KEY, String(readQuotaCooldownUntil));
    }
  } catch {
    // Ignore storage access issues
  }
  notifyQuotaStateChange();
}

export function clearWriteQuotaCooldown(): void {
  writeQuotaCooldownUntil = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(WRITE_QUOTA_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access issues
  }
  notifyQuotaStateChange();
}

export function clearReadQuotaCooldown(): void {
  readQuotaCooldownUntil = 0;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(READ_QUOTA_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access issues
  }
  notifyQuotaStateChange();
}

export function isWriteQuotaCooldownActive(): boolean {
  if (Date.now() < writeQuotaCooldownUntil) return true;
  if (writeQuotaCooldownUntil > 0) {
    clearWriteQuotaCooldown();
  }
  return false;
}

export function isReadQuotaCooldownActive(): boolean {
  if (Date.now() < readQuotaCooldownUntil) return true;
  if (readQuotaCooldownUntil > 0) {
    clearReadQuotaCooldown();
  }
  return false;
}

export function formatAppErrorMessage(error: unknown, fallback: string): string {
  if (isFirestoreReadQuotaError(error)) {
    return 'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.';
  }
  if (isFirestoreQuotaError(error)) {
    return 'تم استهلاك الحد اليومي المجاني لعمليات الكتابة في قاعدة البيانات. يُعاد تصفير الحصة تلقائياً في اليوم التالي.';
  }

  const raw = unwrapFirestoreErrorMessage(extractRawErrorText(error));
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  if (lower.includes('permission-denied') || lower.includes('permission_denied') || lower.includes('missing or insufficient permissions')) {
    return 'ليست لديك صلاحية لتنفيذ هذا الإجراء حالياً.';
  }
  if (
    lower.includes('unavailable') ||
    lower.includes('connection failed') ||
    lower.includes('client is offline') ||
    lower.includes('network')
  ) {
    return 'تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت وحاول مجدداً.';
  }

  // Never leak raw JSON error blobs into UI banners
  if (raw.startsWith('{') && raw.endsWith('}')) {
    return fallback;
  }

  return raw;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    const isReadOp =
      isFirestoreReadQuotaError(error) ||
      (!isFirestoreWriteQuotaError(error) &&
        (operationType === OperationType.GET || operationType === OperationType.LIST));
    if (isReadOp) {
      markReadQuotaCooldown();
      throw new Error(
        'تم استهلاك الحد اليومي المجاني لعمليات القراءة في قاعدة البيانات. يُعرض المحتوى المحفوظ محلياً وتُعاد الحصة تلقائياً في اليوم التالي.'
      );
    }
    markWriteQuotaCooldown();
    throw new Error(
      'تم استهلاك الحد اليومي المجاني لعمليات الكتابة في قاعدة البيانات. يُعاد تصفير الحصة تلقائياً في اليوم التالي.'
    );
  }
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function tsToMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: () => number }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void testConnection();
      }, { once: true });
    }
    return;
  }
  if (isReadQuotaCooldownActive()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isFirestoreQuotaError(error)) {
      markReadQuotaCooldown();
    } else if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
