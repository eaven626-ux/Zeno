const AVATAR_GRADIENTS = [
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-700',
  'from-cyan-500 to-sky-600',
];

export function getAvatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function getInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return 'ب';
  const parts = cleaned.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function formatMessageTime(ms: number): string {
  return new Intl.DateTimeFormat('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatChatListTime(ms?: number): string {
  if (!ms) return '';
  const now = new Date();
  const date = new Date(ms);
  const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);

  if (diffDays === 0) {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }
  if (diffDays === 1) {
    return 'أمس';
  }
  if (diffDays < 7) {
    return new Intl.DateTimeFormat('ar-EG', { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat('ar-EG', {
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatDateSeparator(ms: number): string {
  const now = new Date();
  const date = new Date(ms);
  const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);

  if (diffDays === 0) return 'اليوم';
  if (diffDays === 1) return 'أمس';
  return new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  }).format(date);
}

export function isSameDay(aMs: number, bMs: number): boolean {
  const a = new Date(aMs);
  const b = new Date(bMs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isUserOnline(lastSeenMs?: number): boolean {
  if (!lastSeenMs) return false;
  return Date.now() - lastSeenMs < 2 * 60 * 1000;
}

export function formatLastSeen(lastSeenMs?: number): string {
  if (!lastSeenMs) return 'آخر ظهور غير معروف';
  const diffSec = Math.floor((Date.now() - lastSeenMs) / 1000);
  if (diffSec < 120) return 'متصل الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `آخر ظهور منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `آخر ظهور منذ ${diffHours} ساعة`;
  return `آخر ظهور ${formatChatListTime(lastSeenMs)}`;
}

export function formatAudioDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح'));
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة الصورة'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 320000 && quality > 0.35) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > 345000) {
          reject(new Error('حجم الصورة كبير جداً بعد الضغط، يرجى اختيار صورة أصغر'));
          return;
        }
        resolve(dataUrl);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const AVATAR_MAX_DATA_URL_CHARS = 140000;

export async function compressAvatarToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملف صورة صالح (JPG أو PNG أو WebP)');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف الصورة غير صالح'));
      img.onload = () => {
        const srcSize = Math.max(1, Math.min(img.width, img.height));
        const sx = Math.floor((img.width - srcSize) / 2);
        const sy = Math.floor((img.height - srcSize) / 2);

        const renderSquare = (dim: number, quality: number): string => {
          const canvas = document.createElement('canvas');
          canvas.width = dim;
          canvas.height = dim;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('تعذر معالجة الصورة');
          }
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, dim, dim);
          ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, dim, dim);
          return canvas.toDataURL('image/jpeg', quality);
        };

        try {
          for (const q of [0.86, 0.72, 0.58, 0.44]) {
            const candidate = renderSquare(256, q);
            if (candidate.length <= 120000) {
              resolve(candidate);
              return;
            }
          }
          for (const q of [0.75, 0.6, 0.45]) {
            const candidate = renderSquare(192, q);
            if (candidate.length <= AVATAR_MAX_DATA_URL_CHARS) {
              resolve(candidate);
              return;
            }
          }
          reject(new Error('حجم الصورة كبير جداً بعد الضغط، يرجى اختيار صورة أخرى'));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('تعذر معالجة الصورة'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 بايت';
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const INLINE_FILE_MAX_BYTES = 500 * 1024;

export function blobToDataUrl(blob: Blob, maxBytes = MAX_FILE_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    if (blob.size > maxBytes) {
      reject(new Error(`حجم المقطع الصوتي يتجاوز الحد المسموح (${formatFileSize(maxBytes)})`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر تحويل المقطع الصوتي'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      if (!result) {
        reject(new Error('تعذر قراءة المقطع الصوتي'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

export function fileToDataUrl(file: File, maxBytes = MAX_FILE_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`حجم الملف يتجاوز الحد الأقصى المسموح (${formatFileSize(maxBytes)})`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      if (!result) {
        reject(new Error('تعذر ترميز الملف'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export function getAudioDurationFromDataUrl(dataUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      resolve(Math.min(dur, 3600));
    };
    audio.onerror = () => resolve(0);
    audio.src = dataUrl;
  });
}

export function getAudioDurationFromBlobOrFile(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    audio.onloadedmetadata = () => {
      const dur = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      cleanup();
      resolve(Math.min(dur, 3600));
    };
    audio.onerror = () => {
      cleanup();
      resolve(0);
    };
    audio.src = objectUrl;
  });
}

export function dataUrlToBlob(
  dataUrl: string,
  fallbackMime = 'application/octet-stream'
): Blob {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1 || !dataUrl.startsWith('data:')) {
    return new Blob([], { type: fallbackMime });
  }
  const header = dataUrl.slice(5, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const semiIdx = header.indexOf(';');
  const mime = (semiIdx !== -1 ? header.slice(0, semiIdx) : header) || fallbackMime;
  const isBase64 = header.includes(';base64');

  if (!isBase64) {
    const decoded = decodeURIComponent(payload);
    return new Blob([decoded], { type: mime });
  }

  const binary = atob(payload);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function dataUrlToObjectUrl(
  dataUrl: string,
  fallbackMime = 'application/octet-stream'
): string {
  if (!dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  return URL.createObjectURL(dataUrlToBlob(dataUrl, fallbackMime));
}

export function triggerFileDownload(href: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = fileName || 'attachment';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export const AUTO_DELETE_PRESETS: { seconds: number; label: string; shortLabel: string }[] = [
  { seconds: 0, label: 'إيقاف (لا تختفي)', shortLabel: 'معطّل' },
  { seconds: 10, label: '10 ثوانٍ', shortLabel: '10 ث' },
  { seconds: 30, label: '30 ثانية', shortLabel: '30 ث' },
  { seconds: 60, label: 'دقيقة واحدة', shortLabel: '1 د' },
  { seconds: 300, label: '5 دقائق', shortLabel: '5 د' },
  { seconds: 3600, label: 'ساعة واحدة', shortLabel: '1 س' },
  { seconds: 86400, label: '24 ساعة', shortLabel: '24 س' },
  { seconds: 604800, label: '7 أيام', shortLabel: '7 ي' },
];

export function formatAutoDeleteLabel(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'معطّل';
  const preset = AUTO_DELETE_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.label;
  if (seconds < 60) return `${seconds} ثانية`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} ساعة`;
  return `${Math.round(seconds / 86400)} يوم`;
}

export function formatAutoDeleteShort(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const preset = AUTO_DELETE_PRESETS.find((p) => p.seconds === seconds);
  if (preset) return preset.shortLabel;
  if (seconds < 60) return `${seconds} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} س`;
  return `${Math.round(seconds / 86400)} ي`;
}

export function formatRemainingCountdown(remainingSeconds: number): string {
  const sec = Math.max(0, Math.ceil(remainingSeconds));
  if (sec < 60) return `${sec} ث`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m > 0 ? `${h} س ${m} د` : `${h} س`;
  }
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return h > 0 ? `${d} ي ${h} س` : `${d} ي`;
}

export const STICKER_MAX_DATA_URL_CHARS = 680000;

export async function prepareStickerFile(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  isNativelyAnimated: boolean;
  label: string;
}> {
  if (!file.type.startsWith('image/')) {
    throw new Error('يرجى اختيار ملفات صور أو صور متحركة (GIF / WebP / PNG / JPEG)');
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '').trim();
  const label = (baseName || 'ملصق').slice(0, 60);
  const isGifOrWebp = file.type === 'image/gif' || file.type === 'image/webp';

  if (isGifOrWebp) {
    // Preserve raw animated GIF/WebP frames without passing through canvas
    const dataUrl = await fileToDataUrl(file, 520 * 1024);
    if (dataUrl.length > STICKER_MAX_DATA_URL_CHARS) {
      throw new Error(`الملصق "${file.name}" كبير جداً؛ الحد الأقصى للملصقات المتحركة حوالي 480 ك.ب`);
    }
    return {
      dataUrl,
      mimeType: file.type,
      isNativelyAnimated: true,
      label,
    };
  }

  // Static image (PNG / JPEG / etc.): resize to <= 256px keeping transparency
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف "${file.name}"`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`ملف الصورة "${file.name}" غير صالح`));
      img.onload = () => {
        const maxDim = 256;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.max(1, Math.round((height * maxDim) / width));
            width = maxDim;
          } else {
            width = Math.max(1, Math.round((width * maxDim) / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر معالجة صورة الملصق'));
          return;
        }
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let mimeType = 'image/webp';
        let dataUrl = canvas.toDataURL('image/webp', 0.86);
        if (!dataUrl.startsWith('data:image/webp')) {
          mimeType = 'image/png';
          dataUrl = canvas.toDataURL('image/png');
        }
        if (dataUrl.length > 350000) {
          const fallback = canvas.toDataURL('image/webp', 0.65);
          if (fallback.startsWith('data:image/webp')) {
            mimeType = 'image/webp';
            dataUrl = fallback;
          }
        }
        if (dataUrl.length > STICKER_MAX_DATA_URL_CHARS) {
          reject(new Error(`حجم الملصق "${file.name}" كبير جداً بعد التحسين`));
          return;
        }
        resolve({
          dataUrl,
          mimeType,
          isNativelyAnimated: false,
          label,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export async function createStickerCoverDataUrl(sourceDataUrl: string): Promise<string | undefined> {
  if (!sourceDataUrl) return undefined;
  if (sourceDataUrl.length <= 160000) return sourceDataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(undefined);
    img.onload = () => {
      const dim = 96;
      const ratio = Math.min(dim / Math.max(1, img.width), dim / Math.max(1, img.height), 1);
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(undefined);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let out = canvas.toDataURL('image/webp', 0.78);
      if (!out.startsWith('data:image/webp')) {
        out = canvas.toDataURL('image/png');
      }
      resolve(out.length <= 180000 ? out : undefined);
    };
    img.src = sourceDataUrl;
  });
}

export const MAX_STORY_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_STORY_VIDEO_DURATION_SEC = 60;

export function getPreferredVideoMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return 'video/webm';
}

export async function getVideoMetadataAndThumbnail(
  source: Blob | File
): Promise<{ durationSec: number; thumbnailDataUrl?: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(source);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    let knownDurationSec = 0;
    let settled = false;
    let seekFallbackTimer: number | null = null;

    const finish = (result: {
      durationSec: number;
      thumbnailDataUrl?: string;
      width: number;
      height: number;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (seekFallbackTimer !== null) clearTimeout(seekFallbackTimer);
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    const readDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        knownDurationSec = Math.round(video.duration * 10) / 10;
      }
      return knownDurationSec;
    };

    const timeoutId = window.setTimeout(() => {
      finish({ durationSec: readDuration(), width: video.videoWidth || 0, height: video.videoHeight || 0 });
    }, 6000);

    const captureFrame = () => {
      const dur = readDuration();
      const vw = video.videoWidth || 360;
      const vh = video.videoHeight || 640;
      let thumbnailDataUrl: string | undefined;
      try {
        const maxDim = 420;
        const scale = Math.min(maxDim / Math.max(1, vw), maxDim / Math.max(1, vh), 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const candidate = canvas.toDataURL('image/jpeg', 0.72);
          if (candidate.length <= 140000) {
            thumbnailDataUrl = candidate;
          }
        }
      } catch {
        thumbnailDataUrl = undefined;
      }
      finish({ durationSec: dur, thumbnailDataUrl, width: vw, height: vh });
    };

    video.onloadedmetadata = () => {
      const dur = readDuration();
      // Reject early without waiting for frame seek when video already exceeds max story duration
      if (dur > MAX_STORY_VIDEO_DURATION_SEC) {
        finish({ durationSec: dur, width: video.videoWidth || 0, height: video.videoHeight || 0 });
      }
    };

    video.onloadeddata = () => {
      const dur = readDuration();
      if (dur > MAX_STORY_VIDEO_DURATION_SEC) {
        finish({ durationSec: dur, width: video.videoWidth || 0, height: video.videoHeight || 0 });
        return;
      }
      try {
        const seekTarget = Number.isFinite(video.duration) && video.duration > 0.4 ? Math.min(0.25, video.duration / 4) : 0;
        if (seekTarget > 0) {
          video.onseeked = captureFrame;
          seekFallbackTimer = window.setTimeout(captureFrame, 1200);
          video.currentTime = seekTarget;
        } else {
          captureFrame();
        }
      } catch {
        captureFrame();
      }
    };

    video.onerror = () => {
      finish({ durationSec: readDuration(), width: 0, height: 0 });
    };

    video.src = objectUrl;
  });
}

