import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { CustomSticker, StickerAnimation, StickerPack } from '../types/telegram';
import { createStickerCoverDataUrl, prepareStickerFile } from '../lib/mediaUtils';
import { formatAppErrorMessage } from '../lib/firebase';
import { STICKER_ANIMATIONS } from '../lib/stickers';
import { StickerVisual } from './StickerArt';

interface DraftSticker {
  tempId: string;
  label: string;
  mediaDataUrl: string;
  mimeType: string;
  isNativelyAnimated: boolean;
  animation: StickerAnimation;
}

interface StickerPackModalProps {
  existingPack?: StickerPack | null;
  existingStickers?: CustomSticker[];
  onClose: () => void;
  onCreatePack: (
    title: string,
    stickers: Array<{
      label: string;
      mediaDataUrl: string;
      mimeType: string;
      animation: StickerAnimation;
    }>,
    coverDataUrl?: string
  ) => Promise<void>;
  onAddStickers?: (
    pack: StickerPack,
    stickers: Array<{
      label: string;
      mediaDataUrl: string;
      mimeType: string;
      animation: StickerAnimation;
    }>,
    coverDataUrl?: string
  ) => Promise<void>;
  onDeleteSticker?: (pack: StickerPack, stickerId: string) => Promise<void>;
  onDeletePack?: (packId: string) => Promise<void>;
}

export const StickerPackModal: React.FC<StickerPackModalProps> = ({
  existingPack,
  existingStickers = [],
  onClose,
  onCreatePack,
  onAddStickers,
  onDeleteSticker,
  onDeletePack,
}) => {
  const [title, setTitle] = useState(existingPack?.title || '');
  const [drafts, setDrafts] = useState<DraftSticker[]>([]);
  const [defaultAnim, setDefaultAnim] = useState<StickerAnimation>('bounce');
  const [processingFiles, setProcessingFiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDeletePack, setConfirmDeletePack] = useState(false);
  const [deletingStickerId, setDeletingStickerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const isEditMode = Boolean(existingPack);
  const remainingSlots = Math.max(0, 50 - existingStickers.length - drafts.length);

  const handleFilesChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    if (files.length > remainingSlots) {
      setError(`يمكنك إضافة ${remainingSlots} ملصقاً كحد أقصى في هذه الحزمة`);
    } else {
      setError(null);
    }

    const slice = files.slice(0, remainingSlots);
    if (slice.length === 0) return;

    setProcessingFiles(true);
    const added: DraftSticker[] = [];
    const errors: string[] = [];

    for (const file of slice) {
      try {
        const prepared = await prepareStickerFile(file);
        added.push({
          tempId: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label: prepared.label,
          mediaDataUrl: prepared.dataUrl,
          mimeType: prepared.mimeType,
          isNativelyAnimated: prepared.isNativelyAnimated,
          animation: prepared.isNativelyAnimated ? 'none' : defaultAnim,
        });
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `تعذر تجهيز ${file.name}`);
      }
    }

    if (added.length > 0) {
      setDrafts((prev) => [...prev, ...added]);
    }
    if (errors.length > 0) {
      setError(errors[0]);
    }
    setProcessingFiles(false);
  };

  const handleApplyAnimToAll = (anim: StickerAnimation) => {
    setDefaultAnim(anim);
    setDrafts((prev) =>
      prev.map((d) => ({
        ...d,
        animation: anim,
      }))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    if (!isEditMode && !title.trim()) {
      setError('يرجى إدخال اسم للحزمة');
      return;
    }
    if (drafts.length === 0) {
      setError('اختر ملصقاً واحداً على الأقل من معرض الجهاز');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = drafts.map((d) => ({
        label: d.label,
        mediaDataUrl: d.mediaDataUrl,
        mimeType: d.mimeType,
        animation: d.animation,
      }));
      const cover = await createStickerCoverDataUrl(drafts[0].mediaDataUrl);

      if (existingPack && onAddStickers) {
        await onAddStickers(existingPack, payload, cover);
      } else {
        await onCreatePack(title.trim(), payload, cover);
      }
      onClose();
    } catch (err) {
      setError(formatAppErrorMessage(err, 'تعذر حفظ حزمة الملصقات'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="animate-zeno-fade fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-zeno-modal w-full sm:max-w-lg max-h-[90dvh] flex flex-col bg-white dark:bg-[#17212b] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
                {isEditMode ? `إدارة حزمة: ${existingPack?.title}` : 'إنشاء حزمة ملصقات مخصصة'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                أضف صوراً متحركة (GIF / WebP) أو صوراً من المعرض مع حركة مخصصة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="tap-press p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto slim-scroll p-5 space-y-4">
          {!isEditMode && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                اسم حزمة الملصقات
              </label>
              <input
                type="text"
                maxLength={60}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: ملصقاتي المفضلة"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
          )}

          {/* Gallery Upload Drop/Button */}
          <div className="space-y-2">
            <input
              ref={galleryInputRef}
              type="file"
              multiple
              accept="image/gif,image/webp,image/png,image/jpeg,image/*"
              onChange={handleFilesChosen}
              className="hidden"
            />
            <button
              type="button"
              disabled={processingFiles || remainingSlots === 0}
              onClick={() => galleryInputRef.current?.click()}
              className="tap-press w-full py-3.5 px-4 rounded-2xl border-2 border-dashed border-sky-400/60 dark:border-sky-500/40 bg-sky-50/70 dark:bg-sky-950/20 hover:bg-sky-100/70 dark:hover:bg-sky-950/35 text-sky-700 dark:text-sky-300 flex items-center justify-center gap-2.5 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              {processingFiles ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  <span>جاري تجهيز الملصقات...</span>
                </>
              ) : (
                <>
                  <ImagePlus className="w-5 h-5" />
                  <span>اختيار صور أو GIF من معرض الجهاز</span>
                </>
              )}
            </button>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1">
              <span>يدعم GIF و WebP المتحركة + PNG و JPEG</span>
              <span className="tabular-nums">المتبقي: {remainingSlots} من 50</span>
            </div>
          </div>

          {/* Animation Style Selector for Newly Added Stickers */}
          {drafts.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  تأثير الحركة للصور الجديدة ({drafts.length})
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {STICKER_ANIMATIONS.map((anim) => (
                    <button
                      key={anim.id}
                      type="button"
                      onClick={() => handleApplyAnimToAll(anim.id)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                        defaultAnim === anim.id
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 dark:bg-[#242f3d] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {drafts.map((draft) => (
                  <div
                    key={draft.tempId}
                    className="relative rounded-2xl bg-slate-100/80 dark:bg-[#242f3d]/80 border border-slate-200/80 dark:border-slate-700 p-2 flex flex-col items-center gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => setDrafts((prev) => prev.filter((d) => d.tempId !== draft.tempId))}
                      aria-label="إزالة الملصق"
                      className="absolute -top-1.5 -end-1.5 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm cursor-pointer z-10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-16 h-16 flex items-center justify-center">
                      <StickerVisual
                        mediaDataUrl={draft.mediaDataUrl}
                        animation={draft.animation}
                        label={draft.label}
                        className="w-16 h-16"
                      />
                    </div>
                    <select
                      value={draft.animation}
                      onChange={(e) => {
                        const val = e.target.value as StickerAnimation;
                        setDrafts((prev) =>
                          prev.map((d) => (d.tempId === draft.tempId ? { ...d, animation: val } : d))
                        );
                      }}
                      className="w-full text-[11px] rounded-lg bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-600 px-1.5 py-1 text-slate-700 dark:text-slate-200 focus:outline-none"
                    >
                      {STICKER_ANIMATIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Stickers when editing a pack */}
          {isEditMode && existingStickers.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                الملصقات الحالية في الحزمة ({existingStickers.length})
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {existingStickers.map((st) => (
                  <div
                    key={st.id}
                    className="relative rounded-xl bg-slate-100/70 dark:bg-[#242f3d]/70 border border-slate-200/70 dark:border-slate-700 p-1.5 flex items-center justify-center"
                  >
                    <StickerVisual
                      mediaDataUrl={st.mediaDataUrl}
                      animation={st.animation}
                      label={st.label}
                      className="w-14 h-14"
                    />
                    {existingPack && onDeleteSticker && (
                      <button
                        type="button"
                        disabled={deletingStickerId === st.id}
                        onClick={async () => {
                          setDeletingStickerId(st.id);
                          try {
                            await onDeleteSticker(existingPack, st.id);
                          } finally {
                            setDeletingStickerId(null);
                          }
                        }}
                        title="حذف الملصق"
                        className="absolute -top-1.5 -end-1.5 w-6 h-6 rounded-full bg-slate-800/85 hover:bg-red-600 text-white flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {deletingStickerId === st.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <X className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Actions Footer */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 dark:border-slate-800">
            {isEditMode && existingPack && onDeletePack ? (
              confirmDeletePack ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onDeletePack(existingPack.id);
                        onClose();
                      } catch (err) {
                        setError(formatAppErrorMessage(err, 'تعذر حذف الحزمة'));
                        setSaving(false);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    تأكيد حذف الحزمة
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePack(false)}
                    className="px-2.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeletePack(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف الحزمة</span>
                </button>
              )
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2 ms-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#242f3d] hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                إغلاق
              </button>
              <button
                type="submit"
                disabled={saving || processingFiles || drafts.length === 0}
                className="tap-press inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isEditMode ? `إضافة (${drafts.length})` : 'حفظ الحزمة'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
