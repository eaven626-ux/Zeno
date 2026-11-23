import { StickerAnimation } from '../types/telegram';

export interface BuiltinSticker {
  id: string;
  packId: string;
  label: string;
  animation: StickerAnimation;
}

export interface BuiltinStickerPack {
  id: string;
  title: string;
  stickers: BuiltinSticker[];
}

export const STICKER_ANIMATIONS: { id: StickerAnimation; label: string }[] = [
  { id: 'bounce', label: 'قفز' },
  { id: 'pulse', label: 'نبض' },
  { id: 'float', label: 'طفو' },
  { id: 'wiggle', label: 'اهتزاز' },
  { id: 'heartbeat', label: 'خفقان' },
  { id: 'spin', label: 'دوران' },
  { id: 'none', label: 'بدون حركة' },
];

export function getStickerAnimClass(anim?: StickerAnimation): string {
  switch (anim) {
    case 'bounce':
      return 'sticker-anim-bounce';
    case 'pulse':
      return 'sticker-anim-pulse';
    case 'float':
      return 'sticker-anim-float';
    case 'wiggle':
      return 'sticker-anim-wiggle';
    case 'spin':
      return 'sticker-anim-spin';
    case 'heartbeat':
      return 'sticker-anim-heartbeat';
    default:
      return '';
  }
}

export const BUILTIN_STICKER_PACKS: BuiltinStickerPack[] = [
  {
    id: 'pack_zeno_vibes',
    title: 'مشاعر زينو',
    stickers: [
      { id: 'zeno_wave', packId: 'pack_zeno_vibes', label: 'مرحباً', animation: 'wiggle' },
      { id: 'zeno_heart', packId: 'pack_zeno_vibes', label: 'حب كبير', animation: 'heartbeat' },
      { id: 'zeno_laugh', packId: 'pack_zeno_vibes', label: 'ضحكة سعيدة', animation: 'bounce' },
      { id: 'zeno_thumbs', packId: 'pack_zeno_vibes', label: 'ممتاز', animation: 'pulse' },
      { id: 'zeno_think', packId: 'pack_zeno_vibes', label: 'تفكير', animation: 'float' },
      { id: 'zeno_clap', packId: 'pack_zeno_vibes', label: 'تصفيق', animation: 'bounce' },
    ],
  },
  {
    id: 'pack_reactions',
    title: 'تفاعلات سريعة',
    stickers: [
      { id: 'react_fire', packId: 'pack_reactions', label: 'حماس', animation: 'pulse' },
      { id: 'react_star', packId: 'pack_reactions', label: 'تألق', animation: 'spin' },
      { id: 'react_rocket', packId: 'pack_reactions', label: 'انطلاق', animation: 'float' },
      { id: 'react_trophy', packId: 'pack_reactions', label: 'إنجاز', animation: 'bounce' },
      { id: 'react_wow', packId: 'pack_reactions', label: 'مدهش', animation: 'wiggle' },
      { id: 'react_100', packId: 'pack_reactions', label: 'مئة بالمئة', animation: 'heartbeat' },
    ],
  },
  {
    id: 'pack_daily',
    title: 'لمسات يومية',
    stickers: [
      { id: 'daily_coffee', packId: 'pack_daily', label: 'قهوة الصباح', animation: 'float' },
      { id: 'daily_moon', packId: 'pack_daily', label: 'مساء هادئ', animation: 'pulse' },
      { id: 'daily_music', packId: 'pack_daily', label: 'نغمة', animation: 'wiggle' },
      { id: 'daily_bolt', packId: 'pack_daily', label: 'طاقة', animation: 'bounce' },
      { id: 'daily_gift', packId: 'pack_daily', label: 'هدية', animation: 'wiggle' },
      { id: 'daily_ok', packId: 'pack_daily', label: 'تم بنجاح', animation: 'pulse' },
    ],
  },
];

const BUILTIN_STICKER_MAP = new Map<string, BuiltinSticker>(
  BUILTIN_STICKER_PACKS.flatMap((p) => p.stickers.map((s) => [s.id, s]))
);

export function getBuiltinStickerById(stickerId?: string): BuiltinSticker | undefined {
  if (!stickerId) return undefined;
  return BUILTIN_STICKER_MAP.get(stickerId);
}
