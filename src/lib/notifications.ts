export interface AppNotificationPayload {
  title: string;
  body: string;
  chatId?: string;
  tag?: string;
  silent?: boolean;
  icon?: string;
}

export type AppNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): AppNotificationPermission {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function ensureNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) {
      return existing;
    }
    // In Vite dev mode VitePWA SW is disabled; register sw-notifications.js directly
    // so Android WebView/dev testing and ServiceWorkerRegistration.showNotification work everywhere.
    const reg = await navigator.serviceWorker.register('/sw-notifications.js', { scope: '/' });
    return reg;
  } catch {
    return null;
  }
}

export async function requestAppNotificationPermission(): Promise<AppNotificationPermission> {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') {
    await ensureNotificationServiceWorker();
    return 'granted';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await ensureNotificationServiceWorker();
    }
    return result;
  } catch {
    return getNotificationPermission();
  }
}

export function playNotificationChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    playTone(784, 0, 0.14, 0.07);
    playTone(1046.5, 0.09, 0.2, 0.06);

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 500);
  } catch {
    // Ignore autoplay restrictions before user gesture
  }
}

export async function showAppNotification(payload: AppNotificationPayload): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const tag = payload.tag || (payload.chatId ? `zeno-chat-${payload.chatId}` : 'zeno-general');
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: payload.body,
    icon: payload.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag,
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    silent: Boolean(payload.silent),
    vibrate: payload.silent ? undefined : [140, 60, 140],
    data: {
      chatId: payload.chatId || '',
      url: payload.chatId ? `/?chatId=${encodeURIComponent(payload.chatId)}` : '/',
    },
  };

  // Android Chrome / PWABuilder TWA requires ServiceWorkerRegistration.showNotification()
  try {
    const reg = await ensureNotificationServiceWorker();
    if (reg && typeof reg.showNotification === 'function') {
      await reg.showNotification(payload.title || 'ZENO', options);
      return true;
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const readyReg = await navigator.serviceWorker.ready;
      if (readyReg && typeof readyReg.showNotification === 'function') {
        await readyReg.showNotification(payload.title || 'ZENO', options);
        return true;
      }
    }
  } catch {
    // Fall through to Window Notification fallback for desktop browsers without active SW
  }

  try {
    const n = new Notification(payload.title || 'ZENO', options);
    n.onclick = () => {
      window.focus();
      if (payload.chatId) {
        window.dispatchEvent(
          new CustomEvent('zeno:open-chat', { detail: { chatId: payload.chatId } })
        );
      }
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function syncAppBadge(unreadCount: number): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  try {
    if (unreadCount > 0 && typeof nav.setAppBadge === 'function') {
      nav.setAppBadge(unreadCount).catch(() => {});
    } else if (unreadCount <= 0 && typeof nav.clearAppBadge === 'function') {
      nav.clearAppBadge().catch(() => {});
    }
  } catch {
    // Ignore unsupported badging API
  }
}
