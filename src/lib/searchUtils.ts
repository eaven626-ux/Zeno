import { Message } from '../types/telegram';

export type MessageSearchTypeFilter =
  | 'all'
  | 'text'
  | 'image'
  | 'file'
  | 'links'
  | 'audio'
  | 'poll';

export type MessageSearchDatePreset = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface AdvancedSearchFilters {
  query: string;
  typeFilter: MessageSearchTypeFilter;
  datePreset: MessageSearchDatePreset;
  customDate: string;
  chatId?: string;
  senderId?: string;
}

export const DEFAULT_ADVANCED_SEARCH_FILTERS: AdvancedSearchFilters = {
  query: '',
  typeFilter: 'all',
  datePreset: 'all',
  customDate: '',
  chatId: '',
  senderId: '',
};

export const MESSAGE_TYPE_FILTER_OPTIONS: {
  key: MessageSearchTypeFilter;
  label: string;
}[] = [
  { key: 'all', label: 'الكل' },
  { key: 'image', label: 'صور' },
  { key: 'file', label: 'ملفات' },
  { key: 'links', label: 'روابط' },
  { key: 'audio', label: 'صوتيات' },
  { key: 'poll', label: 'استطلاعات' },
  { key: 'text', label: 'نصوص' },
];

export const DATE_PRESET_OPTIONS: {
  key: MessageSearchDatePreset;
  label: string;
}[] = [
  { key: 'all', label: 'كل الأوقات' },
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'آخر 7 أيام' },
  { key: 'month', label: 'آخر 30 يوماً' },
  { key: 'custom', label: 'تاريخ محدد' },
];

const URL_PATTERN_SOURCE = '(?:https?:\\/\\/|www\\.)[^\\s<>"\']+';

export function extractUrlsFromText(text?: string): string[] {
  if (!text) return [];
  const matches = text.match(new RegExp(URL_PATTERN_SOURCE, 'gi'));
  return matches ? matches : [];
}

export function hasLinksInText(text?: string): boolean {
  if (!text) return false;
  return new RegExp(URL_PATTERN_SOURCE, 'i').test(text);
}

export function getLocalDayBounds(dateStr: string): { startMs: number; endMs: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function getDateRangeBounds(
  datePreset: MessageSearchDatePreset,
  customDate: string,
  nowMs: number = Date.now()
): { startMs: number; endMs: number } | null {
  if (datePreset === 'all') return null;

  if (datePreset === 'custom') {
    return getLocalDayBounds(customDate);
  }

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();

  if (datePreset === 'today') {
    return { startMs: startOfToday, endMs: endOfToday };
  }
  if (datePreset === 'week') {
    return { startMs: startOfToday - 6 * 86400000, endMs: endOfToday };
  }
  if (datePreset === 'month') {
    return { startMs: startOfToday - 29 * 86400000, endMs: endOfToday };
  }
  return null;
}

export function hasActiveAdvancedFilters(filters: AdvancedSearchFilters): boolean {
  return (
    filters.typeFilter !== 'all' ||
    filters.datePreset !== 'all' ||
    Boolean(filters.senderId) ||
    Boolean(filters.chatId)
  );
}

export function messageMatchesAdvancedFilters(
  msg: Message,
  filters: AdvancedSearchFilters,
  nowMs: number = Date.now()
): boolean {
  if (msg.isDeleted || msg.type === 'system') return false;
  if (msg.ttlSeconds && msg.createdAt > 0 && nowMs >= msg.createdAt + msg.ttlSeconds * 1000) {
    return false;
  }

  if (filters.chatId && msg.chatId !== filters.chatId) {
    return false;
  }

  if (filters.senderId && msg.senderId !== filters.senderId) {
    return false;
  }

  switch (filters.typeFilter) {
    case 'text':
      if (msg.type !== 'text') return false;
      break;
    case 'image':
      if (msg.type !== 'image') return false;
      break;
    case 'file':
      if (msg.type !== 'file') return false;
      break;
    case 'audio':
      if (msg.type !== 'audio') return false;
      break;
    case 'poll':
      if (msg.type !== 'poll') return false;
      break;
    case 'links':
      if (!hasLinksInText(msg.text)) return false;
      break;
    case 'all':
    default:
      break;
  }

  if (filters.datePreset !== 'all') {
    if (msg.createdAt <= 0) return false;
    const bounds = getDateRangeBounds(filters.datePreset, filters.customDate, nowMs);
    if (bounds) {
      if (msg.createdAt < bounds.startMs || msg.createdAt > bounds.endMs) {
        return false;
      }
    }
  }

  const q = filters.query.trim().toLowerCase();
  if (q) {
    const inText = msg.text.toLowerCase().includes(q);
    const inFile = Boolean(msg.fileName && msg.fileName.toLowerCase().includes(q));
    const inPollQ = Boolean(msg.pollQuestion && msg.pollQuestion.toLowerCase().includes(q));
    const inPollOpts = Boolean(
      msg.pollOptions && msg.pollOptions.some((opt) => opt.toLowerCase().includes(q))
    );
    const inSender = msg.senderName.toLowerCase().includes(q);
    const inForwarded = Boolean(
      msg.forwardedFromName && msg.forwardedFromName.toLowerCase().includes(q)
    );
    if (!inText && !inFile && !inPollQ && !inPollOpts && !inSender && !inForwarded) {
      return false;
    }
  }

  return true;
}

export function getTodayInputDateString(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
