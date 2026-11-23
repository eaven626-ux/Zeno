import React from 'react';
import { getStickerAnimClass } from '../lib/stickers';
import { StickerAnimation } from '../types/telegram';

interface BuiltinStickerSvgProps {
  stickerId: string;
  className?: string;
}

export const BuiltinStickerSvg: React.FC<BuiltinStickerSvgProps> = ({ stickerId, className = 'w-full h-full' }) => {
  switch (stickerId) {
    case 'zeno_wave':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="مرحباً">
          <defs>
            <linearGradient id="zw_bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="48" fill="url(#zw_bg)" />
          <path d="M40 52c3-5 10-5 13 0M67 52c3-5 10-5 13 0" stroke="#451a03" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <path d="M42 71c5 11 31 11 36 0" stroke="#451a03" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <ellipse cx="36" cy="64" rx="6" ry="3.5" fill="#fb7185" opacity="0.65" />
          <ellipse cx="84" cy="64" rx="6" ry="3.5" fill="#fb7185" opacity="0.65" />
          <path d="M92 34c6-6 14 2 8 9l-10 10-8-8 10-11z" fill="#fef08a" stroke="#b45309" strokeWidth="2.5" />
        </svg>
      );
    case 'zeno_heart':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="حب كبير">
          <defs>
            <linearGradient id="zh_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>
          <path
            d="M60 100C57 98 18 72 18 44c0-14 11-24 24-24 8 0 15 4 18 10 3-6 10-10 18-10 13 0 24 10 24 24 0 28-39 54-42 56z"
            fill="url(#zh_g)"
          />
          <path d="M35 37c2-6 8-9 14-8" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" fill="none" opacity="0.7" />
          <circle cx="94" cy="24" r="4" fill="#fda4af" />
          <circle cx="24" cy="28" r="3" fill="#fecdd3" />
        </svg>
      );
    case 'zeno_laugh':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="ضحكة سعيدة">
          <defs>
            <linearGradient id="zl_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="48" fill="url(#zl_g)" />
          <path d="M35 50l13 5-13 5M85 50l-13 5 13 5" stroke="#451a03" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M36 68h48c-2 17-12 25-24 25s-22-8-24-25z" fill="#7c2d12" />
          <path d="M46 84c6-4 22-4 28 0-4 6-10 8-14 8s-10-2-14-8z" fill="#fb7185" />
          <ellipse cx="26" cy="65" rx="7" ry="4" fill="#38bdf8" transform="rotate(-25 26 65)" />
          <ellipse cx="94" cy="65" rx="7" ry="4" fill="#38bdf8" transform="rotate(25 94 65)" />
        </svg>
      );
    case 'zeno_thumbs':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="ممتاز">
          <defs>
            <linearGradient id="zt_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="48" fill="url(#zt_g)" />
          <rect x="30" y="56" width="16" height="32" rx="5" fill="#e0f2fe" />
          <path
            d="M49 56l10-24c2-4 8-3 8 2v14h19c5 0 9 5 8 10l-4 22c-1 5-5 8-10 8H49V56z"
            fill="#ffffff"
          />
          <circle cx="88" cy="28" r="4.5" fill="#bae6fd" />
        </svg>
      );
    case 'zeno_think':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="تفكير">
          <defs>
            <linearGradient id="zth_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="58" r="46" fill="url(#zth_g)" />
          <path d="M36 42c4-4 11-4 15-1" stroke="#451a03" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M68 46h16" stroke="#451a03" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <circle cx="44" cy="54" r="5" fill="#451a03" />
          <circle cx="76" cy="54" r="5" fill="#451a03" />
          <path d="M48 74c6-2 16-2 22 2" stroke="#451a03" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M34 86c0-6 6-10 12-9l10 3-4 19c-1 5-7 7-12 5l-5-3c-2-2-1-10-1-15z" fill="#fef3c7" stroke="#92400e" strokeWidth="2.5" />
        </svg>
      );
    case 'zeno_clap':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="تصفيق">
          <circle cx="60" cy="60" r="48" fill="#10b981" opacity="0.16" />
          <path d="M26 30l8 10M60 16v12M94 30l-8 10" stroke="#f59e0b" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M40 96c-8-6-12-16-9-26l10-30c2-5 9-3 7 3l-5 15 11-24c2-5 9-2 7 3l-8 20 12-20c3-5 9-1 7 4L60 66l14-14c4-4 9 1 6 6L66 78c-7 11-16 24-26 18z" fill="#fbbf24" stroke="#92400e" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M52 100c-6-4-8-14-4-23l14-26c3-5 9-2 7 3l-8 16 14-18c3-4 9 0 6 5l-10 16 14-13c4-4 9 2 5 6L74 86c-6 9-15 18-22 14z" fill="#fde047" stroke="#b45309" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case 'react_fire':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="حماس">
          <defs>
            <linearGradient id="rf_g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fde047" />
              <stop offset="45%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>
          <path
            d="M62 14c4 17-7 25-11 35-3-7-5-13-4-20-14 10-23 26-23 42 0 21 16 37 36 37s36-16 36-37c0-21-14-41-34-57z"
            fill="url(#rf_g)"
          />
          <path
            d="M60 54c3 9-4 15-6 20-2-4-3-8-2-12-8 6-12 15-12 24 0 12 9 20 20 20s20-8 20-20c0-12-8-23-20-32z"
            fill="#fef08a"
          />
        </svg>
      );
    case 'react_star':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="تألق">
          <defs>
            <linearGradient id="rs_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#eab308" />
            </linearGradient>
          </defs>
          <path
            d="M60 12l13.8 29.8 32.6 4.1-24 22.5 6.2 32.3L60 85 31.4 100.7l6.2-32.3-24-22.5 32.6-4.1z"
            fill="url(#rs_g)"
            stroke="#ca8a04"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <circle cx="60" cy="60" r="14" fill="#fffbeb" opacity="0.55" />
        </svg>
      );
    case 'react_rocket':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="انطلاق">
          <circle cx="60" cy="60" r="50" fill="#0ea5e9" opacity="0.14" />
          <path d="M36 84c-8 4-14 16-14 16s12-6 16-14z" fill="#f97316" />
          <path d="M40 76c-12 4-22 22-22 22s18-10 22-22z" fill="#fde047" />
          <path d="M88 22c-22 2-40 16-50 38l22 22c22-10 36-28 38-50 0-6-4-10-10-10z" fill="#f8fafc" stroke="#0f172a" strokeWidth="3" strokeLinejoin="round" />
          <path d="M42 54l-18 4 12 14M66 78l-4 18-14-12" fill="#ef4444" stroke="#991b1b" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="69" cy="49" r="9" fill="#38bdf8" stroke="#0369a1" strokeWidth="3" />
        </svg>
      );
    case 'react_trophy':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="إنجاز">
          <path d="M34 28H20c0 16 8 26 20 28M86 28h14c0 16-8 26-20 28" stroke="#eab308" strokeWidth="6" strokeLinecap="round" fill="none" />
          <path d="M34 22h52v28c0 16-12 28-26 28S34 66 34 50V22z" fill="#facc15" stroke="#ca8a04" strokeWidth="3" />
          <rect x="54" y="76" width="12" height="16" fill="#eab308" />
          <rect x="38" y="92" width="44" height="10" rx="4" fill="#92400e" />
          <path d="M60 36l4 8 9 1-6.5 6 1.5 9-8-4.5-8 4.5 1.5-9-6.5-6 9-1z" fill="#fffbeb" />
        </svg>
      );
    case 'react_wow':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="مدهش">
          <circle cx="60" cy="60" r="48" fill="#a855f7" opacity="0.16" />
          <circle cx="60" cy="60" r="42" fill="#fde047" />
          <circle cx="45" cy="48" r="6" fill="#451a03" />
          <circle cx="75" cy="48" r="6" fill="#451a03" />
          <path d="M38 35c4-4 10-4 14 0M68 35c4-4 10-4 14 0" stroke="#451a03" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <ellipse cx="60" cy="76" rx="11" ry="14" fill="#7c2d12" />
        </svg>
      );
    case 'react_100':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="مئة بالمئة">
          <rect x="14" y="22" width="92" height="76" rx="22" fill="#ef4444" opacity="0.12" />
          <text
            x="60"
            y="68"
            textAnchor="middle"
            fontSize="44"
            fontWeight="900"
            fill="#e11d48"
            fontFamily="system-ui, sans-serif"
          >
            100
          </text>
          <path d="M26 82c22-4 46-4 68 0" stroke="#e11d48" strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <path d="M30 92c20-3 40-3 60 0" stroke="#f43f5e" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        </svg>
      );
    case 'daily_coffee':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="قهوة الصباح">
          <path d="M44 26c-4 6 4 10 0 16M60 22c-4 6 4 10 0 16M76 26c-4 6 4 10 0 16" stroke="#94a3b8" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M28 50h54v26c0 15-12 26-27 26S28 91 28 76V50z" fill="#fff" stroke="#475569" strokeWidth="3.5" />
          <path d="M82 56h10c7 0 12 5 12 11s-5 11-12 11H82" stroke="#475569" strokeWidth="4.5" strokeLinecap="round" fill="none" />
          <rect x="33" y="54" width="44" height="10" rx="4" fill="#78350f" />
          <rect x="22" y="102" width="66" height="6" rx="3" fill="#64748b" />
        </svg>
      );
    case 'daily_moon':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="مساء هادئ">
          <circle cx="60" cy="60" r="48" fill="#1e293b" />
          <path d="M74 28c-16 4-26 20-22 36 4 16 19 26 35 22-8 10-21 15-35 12-18-4-30-21-26-39 4-19 22-32 41-31 2 0 5 0 7 0z" fill="#fde047" />
          <circle cx="82" cy="38" r="3" fill="#fef08a" />
          <circle cx="92" cy="58" r="2.5" fill="#fef08a" />
          <circle cx="72" cy="62" r="2" fill="#e2e8f0" />
        </svg>
      );
    case 'daily_music':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="نغمة">
          <circle cx="60" cy="60" r="48" fill="#ec4899" opacity="0.14" />
          <path d="M48 82V34l44-10v48" stroke="#db2777" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M48 46l44-10" stroke="#f472b6" strokeWidth="5" strokeLinecap="round" />
          <circle cx="38" cy="84" r="13" fill="#db2777" />
          <circle cx="82" cy="74" r="13" fill="#db2777" />
        </svg>
      );
    case 'daily_bolt':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="طاقة">
          <circle cx="60" cy="60" r="48" fill="#0ea5e9" opacity="0.14" />
          <path d="M68 14L28 66h28l-6 40 42-54H64l4-38z" fill="#facc15" stroke="#ca8a04" strokeWidth="3" strokeLinejoin="round" />
        </svg>
      );
    case 'daily_gift':
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="هدية">
          <rect x="24" y="50" width="72" height="52" rx="10" fill="#ef4444" />
          <rect x="20" y="38" width="80" height="16" rx="6" fill="#dc2626" />
          <rect x="54" y="38" width="12" height="64" fill="#fde047" />
          <path d="M60 38c-12 0-22-14-12-20 8-5 12 10 12 20zm0 0c12 0 22-14 12-20-8-5-12 10-12 20z" fill="none" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'daily_ok':
    default:
      return (
        <svg viewBox="0 0 120 120" className={className} aria-label="تم بنجاح">
          <defs>
            <linearGradient id="do_g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="46" fill="url(#do_g)" />
          <path d="M38 61l15 15 30-32" stroke="#ffffff" strokeWidth="8.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      );
  }
};

interface StickerVisualProps {
  stickerId?: string;
  mediaDataUrl?: string;
  animation?: StickerAnimation;
  label?: string;
  className?: string;
}

export const StickerVisual: React.FC<StickerVisualProps> = ({
  stickerId,
  mediaDataUrl,
  animation,
  label = 'ملصق متحرك',
  className = 'w-full h-full',
}) => {
  const animClass = getStickerAnimClass(animation);

  if (mediaDataUrl) {
    return (
      <img
        src={mediaDataUrl}
        alt={label}
        referrerPolicy="no-referrer"
        draggable={false}
        className={`${className} object-contain select-none ${animClass}`}
      />
    );
  }

  if (stickerId) {
    return (
      <div className={`${className} select-none ${animClass}`}>
        <BuiltinStickerSvg stickerId={stickerId} className="w-full h-full" />
      </div>
    );
  }

  return null;
};
