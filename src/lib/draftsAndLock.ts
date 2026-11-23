// Per-user local drafts and SHA-256 PIN Passcode Lock storage helpers

function draftsKey(uid: string): string {
  return `zeno_drafts_${uid}`;
}

function passcodeKey(uid: string): string {
  return `zeno_passcode_hash_${uid}`;
}

export function loadDraftsMap(uid: string): Record<string, string> {
  if (!uid) return {};
  try {
    const raw = localStorage.getItem(draftsKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim().length > 0) {
        result[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function saveChatDraft(uid: string, chatId: string, text: string): Record<string, string> {
  const current = loadDraftsMap(uid);
  const next = { ...current };
  if (text.trim().length > 0) {
    next[chatId] = text;
  } else {
    delete next[chatId];
  }
  try {
    if (Object.keys(next).length > 0) {
      localStorage.setItem(draftsKey(uid), JSON.stringify(next));
    } else {
      localStorage.removeItem(draftsKey(uid));
    }
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export async function hashPasscode(pin: string, uid: string): Promise<string> {
  const normalized = `${uid}:${pin.trim()}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(normalized);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic hash when subtle crypto is unavailable in insecure contexts
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function hasPasscodeEnabled(uid: string): boolean {
  if (!uid) return false;
  try {
    return Boolean(localStorage.getItem(passcodeKey(uid)));
  } catch {
    return false;
  }
}

export async function setPasscode(uid: string, pin: string): Promise<void> {
  const hashed = await hashPasscode(pin, uid);
  try {
    localStorage.setItem(passcodeKey(uid), hashed);
  } catch {
    // Ignore storage restrictions
  }
}

export async function verifyPasscode(uid: string, pin: string): Promise<boolean> {
  try {
    const stored = localStorage.getItem(passcodeKey(uid));
    if (!stored) return true;
    const hashed = await hashPasscode(pin, uid);
    return stored === hashed;
  } catch {
    return false;
  }
}

export function clearPasscode(uid: string): void {
  if (!uid) return;
  try {
    localStorage.removeItem(passcodeKey(uid));
  } catch {
    // Ignore storage restrictions
  }
}
