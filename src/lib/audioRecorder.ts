export function getPreferredAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
  ];

  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Ignore unsupported mime check errors
    }
  }
  return '';
}

export function getAudioExtensionFromMime(mimeType?: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

export function getMicrophoneErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as { name?: unknown }).name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'تم رفض إذن الميكروفون. يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح ثم المحاولة مجدداً.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'لم يتم العثور على ميكروفون متصل بهذا الجهاز.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'تعذر تشغيل الميكروفون لأن تطبيقاً آخر يستخدمه حالياً.';
    }
    if (name === 'SecurityError') {
      return 'يتطلب تسجيل الصوت اتصالاً آمناً (HTTPS) وصلاحية الميكروفون.';
    }
  }
  return 'يرجى السماح بالوصول إلى الميكروفون لتسجيل الرسائل الصوتية.';
}
