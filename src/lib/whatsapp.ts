import { MessageType } from '../types/telegram';

export interface CountryDialOption {
  code: string;
  label: string;
}

export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: '964', label: 'العراق (+964)' },
  { code: '966', label: 'السعودية (+966)' },
  { code: '971', label: 'الإمارات (+971)' },
  { code: '20', label: 'مصر (+20)' },
  { code: '962', label: 'الأردن (+962)' },
  { code: '965', label: 'الكويت (+965)' },
  { code: '974', label: 'قطر (+974)' },
  { code: '973', label: 'البحرين (+973)' },
  { code: '968', label: 'عُمان (+968)' },
  { code: '961', label: 'لبنان (+961)' },
  { code: '963', label: 'سوريا (+963)' },
  { code: '967', label: 'اليمن (+967)' },
  { code: '970', label: 'فلسطين (+970)' },
  { code: '212', label: 'المغرب (+212)' },
  { code: '213', label: 'الجزائر (+213)' },
  { code: '216', label: 'تونس (+216)' },
  { code: '218', label: 'ليبيا (+218)' },
  { code: '249', label: 'السودان (+249)' },
  { code: '90', label: 'تركيا (+90)' },
  { code: '', label: 'دولي كامل (+)' },
];

export function normalizePhoneDigits(raw: string, dialCode?: string): string {
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  if (dialCode) {
    const cleanCode = dialCode.replace(/[^\d]/g, '');
    if (cleanCode && !digits.startsWith(cleanCode)) {
      digits = digits.replace(/^0+/, '');
      digits = `${cleanCode}${digits}`;
    }
  } else {
    digits = digits.replace(/^0+/, '');
  }

  if (digits.length > 16) {
    digits = digits.slice(0, 16);
  }
  return digits;
}

export function formatE164Phone(raw: string, dialCode?: string): string {
  const digits = normalizePhoneDigits(raw, dialCode);
  return digits.length >= 7 ? `+${digits}` : '';
}

export function splitPhoneForEditor(phoneNumber?: string): { dialCode: string; localNumber: string } {
  if (!phoneNumber) return { dialCode: '964', localNumber: '' };
  const digits = phoneNumber.replace(/[^\d]/g, '');
  if (!digits) return { dialCode: '964', localNumber: '' };

  const sortedCodes = [...COUNTRY_DIAL_OPTIONS]
    .filter((c) => c.code.length > 0)
    .sort((a, b) => b.code.length - a.code.length);

  for (const option of sortedCodes) {
    if (digits.startsWith(option.code)) {
      return {
        dialCode: option.code,
        localNumber: digits.slice(option.code.length),
      };
    }
  }

  return { dialCode: '', localNumber: digits };
}

export function formatMessageForWhatsApp(params: {
  chatTitle?: string;
  senderName: string;
  text: string;
  type: MessageType;
  fileName?: string;
  pollQuestion?: string;
}): string {
  const header = params.chatTitle
    ? `*ZENO* — ${params.chatTitle}\nمن: ${params.senderName}`
    : `*ZENO*\nمن: ${params.senderName}`;

  let body = params.text.trim();
  if (!body) {
    if (params.type === 'image') body = '[صورة مرفقة في ZENO]';
    else if (params.type === 'audio') body = params.fileName ? `[رسالة صوتية: ${params.fileName}]` : '[رسالة صوتية في ZENO]';
    else if (params.type === 'file') body = params.fileName ? `[ملف مرفق: ${params.fileName}]` : '[ملف مرفق في ZENO]';
    else if (params.type === 'sticker') body = '[ملصق متحرك من ZENO]';
    else if (params.type === 'poll') body = `استطلاع رأي: ${params.pollQuestion || ''}`;
  }

  return `${header}\n\n${body}`;
}

export function buildWhatsAppUrl(phoneNumber: string | undefined, text: string): string {
  const digits = phoneNumber ? phoneNumber.replace(/[^\d]/g, '') : '';
  const encoded = encodeURIComponent(text);
  if (digits.length >= 7 && digits.length <= 16) {
    return `https://wa.me/${digits}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function openWhatsAppLink(url: string): void {
  if (typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
