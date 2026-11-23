import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Film,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCw,
  Send,
  Square,
  Trash2,
  Type,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { PublicUser, Story, StoryView } from '../types/telegram';
import { getStoryMediaUrl } from '../lib/chatService';
import { clearReadQuotaCooldown, formatAppErrorMessage } from '../lib/firebase';
import {
  compressImageToDataUrl,
  formatAudioDuration,
  formatFileSize,
  getPreferredVideoMimeType,
  getVideoMetadataAndThumbnail,
  MAX_STORY_VIDEO_BYTES,
  MAX_STORY_VIDEO_DURATION_SEC,
  triggerFileDownload,
} from '../lib/mediaUtils';
import { Avatar } from './Avatar';

interface StoriesBarProps {
  currentUser: PublicUser;
  stories: Story[];
  onCreateStory: (payload: {
    type: 'text' | 'image' | 'video';
    text: string;
    mediaDataUrl?: string;
    mediaFile?: Blob;
    fileMimeType?: string;
    mediaDurationSec?: number;
    thumbnailDataUrl?: string;
    bgColor?: string;
    onProgress?: (percent: number) => void;
  }) => Promise<void>;
  onDeleteStory: (storyId: string) => Promise<void>;
  onMarkViewed: (story: Story) => Promise<void>;
  onLoadViews: (storyId: string) => Promise<StoryView[]>;
  onReplyToStory: (story: Story, replyText: string) => Promise<void>;
}

const STORY_COLORS = [
  'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
  'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
  'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
  'linear-gradient(135deg, #ea580c 0%, #dc2626 100%)',
  'linear-gradient(135deg, #0f172a 0%, #334155 100%)',
  'linear-gradient(135deg, #be185d 0%, #f59e0b 100%)',
];

function formatStoryAge(ts: number): string {
  if (!ts || ts <= 0) return 'الآن';
  const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} د`;
  const diffHrs = Math.floor(diffMin / 60);
  return `منذ ${diffHrs} س`;
}

export const StoriesBar: React.FC<StoriesBarProps> = ({
  currentUser,
  stories,
  onCreateStory,
  onDeleteStory,
  onMarkViewed,
  onLoadViews,
  onReplyToStory,
}) => {
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<'text' | 'image' | 'video'>('text');
  const [createText, setCreateText] = useState('');
  const [createBg, setCreateBg] = useState(STORY_COLORS[0]);
  const [createImage, setCreateImage] = useState<string | null>(null);
  const [createVideoFile, setCreateVideoFile] = useState<Blob | null>(null);
  const [createVideoUrl, setCreateVideoUrl] = useState<string | null>(null);
  const [createVideoMime, setCreateVideoMime] = useState<string>('video/webm');
  const [createVideoDuration, setCreateVideoDuration] = useState<number>(0);
  const [createVideoThumb, setCreateVideoThumb] = useState<string | undefined>(undefined);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [videoPreparing, setVideoPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Live video recording inside Story composer
  const [recordingMode, setRecordingMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const recStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Story Viewer state
  const [viewingOwnerId, setViewingOwnerId] = useState<string | null>(null);
  const [viewingIndex, setViewingIndex] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [viewsList, setViewsList] = useState<StoryView[]>([]);
  const [showViewsSheet, setShowViewsSheet] = useState(false);

  const [viewerMediaUrl, setViewerMediaUrl] = useState<string | null>(null);
  const [viewerMediaLoading, setViewerMediaLoading] = useState(false);
  const [viewerMediaProgress, setViewerMediaProgress] = useState(0);
  const [viewerMediaError, setViewerMediaError] = useState<string | null>(null);
  const [mediaRetryNonce, setMediaRetryNonce] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [autoplayMutedNotice, setAutoplayMutedNotice] = useState(false);
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(null);
  const [storyProgress, setStoryProgress] = useState(0);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const viewerVideoRef = useRef<HTMLVideoElement>(null);
  const holdTimerRef = useRef<number | null>(null);
  const heldPauseRef = useRef(false);
  const recordElapsedRef = useRef(0);

  const onMarkViewedRef = useRef(onMarkViewed);
  onMarkViewedRef.current = onMarkViewed;
  const onLoadViewsRef = useRef(onLoadViews);
  onLoadViewsRef.current = onLoadViews;

  const groupedByOwner = useMemo(() => {
    const map = new Map<
      string,
      { ownerId: string; ownerName: string; ownerPhotoURL?: string; items: Story[] }
    >();
    const now = Date.now();
    for (const s of stories) {
      if (s.expiresAt > 0 && s.expiresAt <= now) continue;
      const existing = map.get(s.ownerId);
      if (existing) {
        existing.items.push(s);
      } else {
        map.set(s.ownerId, {
          ownerId: s.ownerId,
          ownerName: s.ownerName,
          ownerPhotoURL: s.ownerPhotoURL,
          items: [s],
        });
      }
    }
    const groups = Array.from(map.values());
    groups.sort((a, b) => {
      if (a.ownerId === currentUser.uid) return -1;
      if (b.ownerId === currentUser.uid) return 1;
      return b.items[0].createdAt - a.items[0].createdAt;
    });
    return groups;
  }, [stories, currentUser.uid]);

  const activeGroup = useMemo(
    () => groupedByOwner.find((g) => g.ownerId === viewingOwnerId) || null,
    [groupedByOwner, viewingOwnerId]
  );

  const activeStory = activeGroup?.items[viewingIndex] || null;
  const activeStoryId = activeStory?.id || null;

  const stopRecordingCamera = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    mediaRecorderRef.current = null;
    if (recStreamRef.current) {
      recStreamRef.current.getTracks().forEach((t) => t.stop());
      recStreamRef.current = null;
    }
    setIsRecording(false);
    setRecordingMode(false);
  };

  useEffect(() => {
    if (!showCreate) {
      stopRecordingCamera();
    }
  }, [showCreate]);

  useEffect(() => {
    return () => {
      if (createVideoUrl) URL.revokeObjectURL(createVideoUrl);
    };
  }, [createVideoUrl]);

  useEffect(() => {
    if (!isRecording) {
      recordElapsedRef.current = 0;
      setRecordElapsed(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecordElapsed((prev) => {
        const next = prev + 1;
        recordElapsedRef.current = next;
        if (next >= MAX_STORY_VIDEO_DURATION_SEC) {
          stopRecordingCamera();
          return MAX_STORY_VIDEO_DURATION_SEC;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!activeStory) return;
    setShowViewsSheet(false);
    setIsPaused(false);
    setStoryProgress(0);
    void onMarkViewedRef.current(activeStory);
    if (activeStory.ownerId === currentUser.uid) {
      void onLoadViewsRef.current(activeStory.id).then(setViewsList).catch(() => setViewsList([]));
    } else {
      setViewsList([]);
    }
    // Only run when viewing target story changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryId, currentUser.uid]);

  const activeStoryRef = useRef(activeStory);
  activeStoryRef.current = activeStory;

  // Resolve media URL for video/image stories (converts videos to seekable ObjectURLs)
  useEffect(() => {
    setIsVideoPlaying(false);
    setIsVideoBuffering(false);
    setAutoplayMutedNotice(false);
    setVideoPlaybackError(null);

    const story = activeStoryRef.current;
    if (!story) {
      setViewerMediaUrl(null);
      setViewerMediaLoading(false);
      setViewerMediaError(null);
      return;
    }
    if (story.type === 'text') {
      setViewerMediaUrl(null);
      setViewerMediaLoading(false);
      setViewerMediaError(null);
      return;
    }
    const directImageSrc = story.mediaUrl || story.mediaDataUrl;
    if (story.type === 'image' && directImageSrc) {
      setViewerMediaUrl(directImageSrc);
      setViewerMediaLoading(false);
      setViewerMediaError(null);
      return;
    }
    let cancelled = false;
    setViewerMediaUrl(null);
    setViewerMediaLoading(true);
    setViewerMediaProgress(0);
    setViewerMediaError(null);
    getStoryMediaUrl(story, (pct) => {
      if (!cancelled) setViewerMediaProgress(pct);
    })
      .then((url) => {
        if (!cancelled) {
          setViewerMediaUrl(url);
          setViewerMediaLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setViewerMediaLoading(false);
          setViewerMediaError(formatAppErrorMessage(err, 'تعذر تحميل الوسائط'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeStory?.id,
    activeStory?.type,
    activeStory?.mediaUrl,
    activeStory?.mediaDataUrl,
    activeStory?.mediaChunkCount,
    mediaRetryNonce,
  ]);

  const handleNextStory = () => {
    if (!activeGroup) return;
    if (viewingIndex + 1 < activeGroup.items.length) {
      setViewingIndex(viewingIndex + 1);
      return;
    }
    const groupIdx = groupedByOwner.findIndex((g) => g.ownerId === activeGroup.ownerId);
    if (groupIdx >= 0 && groupIdx + 1 < groupedByOwner.length) {
      setViewingOwnerId(groupedByOwner[groupIdx + 1].ownerId);
      setViewingIndex(0);
    } else {
      setViewingOwnerId(null);
    }
  };

  const handlePrevStory = () => {
    if (!activeGroup) return;
    if (viewingIndex > 0) {
      setViewingIndex(viewingIndex - 1);
      return;
    }
    const groupIdx = groupedByOwner.findIndex((g) => g.ownerId === activeGroup.ownerId);
    if (groupIdx > 0) {
      const prevGroup = groupedByOwner[groupIdx - 1];
      setViewingOwnerId(prevGroup.ownerId);
      setViewingIndex(Math.max(0, prevGroup.items.length - 1));
    }
  };

  // Timed progress bar for text/image stories
  useEffect(() => {
    if (!activeStory || activeStory.type === 'video' || isPaused || showViewsSheet) return;
    const durationMs = 6000;
    const startedAt = Date.now() - (storyProgress / 100) * durationMs;
    const timer = window.setInterval(() => {
      const pct = Math.min(100, ((Date.now() - startedAt) / durationMs) * 100);
      setStoryProgress(pct);
      if (pct >= 100) {
        window.clearInterval(timer);
        handleNextStory();
      }
    }, 60);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryId, activeStory?.type, isPaused, showViewsSheet]);

  const attemptPlayVideo = async (vid: HTMLVideoElement) => {
    try {
      setVideoPlaybackError(null);
      vid.muted = isMuted;
      await vid.play();
      setIsVideoPlaying(true);
    } catch {
      if (!vid.muted) {
        try {
          vid.muted = true;
          setIsMuted(true);
          setAutoplayMutedNotice(true);
          await vid.play();
          setIsVideoPlaying(true);
          return;
        } catch {
          // Even muted autoplay blocked — center Play button lets the user start playback cleanly
        }
      }
      setIsVideoPlaying(false);
    }
  };

  // Sync play/pause on video element
  useEffect(() => {
    const vid = viewerVideoRef.current;
    if (!vid || activeStory?.type !== 'video' || !viewerMediaUrl) return;
    if (isPaused || showViewsSheet) {
      vid.pause();
    } else {
      void attemptPlayVideo(vid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, showViewsSheet, activeStory?.type, viewerMediaUrl]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setCreateImage(dataUrl);
      setCreateType('image');
      setCreateErr(null);
    } catch {
      setCreateErr('تعذر قراءة الصورة المختارة');
    }
  };

  const applySelectedVideo = async (blob: Blob, mimeType: string, fallbackDurationSec = 0) => {
    if (blob.size > MAX_STORY_VIDEO_BYTES) {
      setCreateErr(`حجم الفيديو يتجاوز الحد المسموح (${formatFileSize(MAX_STORY_VIDEO_BYTES)})`);
      return;
    }
    setCreateErr(null);
    setVideoPreparing(true);
    try {
      const meta = await getVideoMetadataAndThumbnail(blob);
      const resolvedDuration = meta.durationSec > 0 ? meta.durationSec : fallbackDurationSec;
      if (resolvedDuration > MAX_STORY_VIDEO_DURATION_SEC) {
        setCreateErr('الحد الأقصى لمدة فيديو الحالة هو دقيقة واحدة (60 ثانية)');
        return;
      }
      if (createVideoUrl) URL.revokeObjectURL(createVideoUrl);
      setCreateVideoFile(blob);
      setCreateVideoUrl(URL.createObjectURL(blob));
      setCreateVideoMime(mimeType || blob.type || 'video/mp4');
      setCreateVideoDuration(resolvedDuration);
      setCreateVideoThumb(meta.thumbnailDataUrl);
      setCreateType('video');
      setCreateErr(null);
    } finally {
      setVideoPreparing(false);
    }
  };

  const inferVideoMimeFromFile = (file: File): string => {
    const raw = (file.type || '').toLowerCase().trim();
    if (raw === 'video/quicktime') return 'video/mp4';
    if (raw.startsWith('video/')) return raw;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.webm')) return 'video/webm';
    if (lowerName.endsWith('.ogv') || lowerName.endsWith('.ogg')) return 'video/ogg';
    if (/\.(mp4|m4v|mov|mkv|3gp)$/.test(lowerName)) return 'video/mp4';
    return '';
  };

  const handleVideoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const inferredMime = inferVideoMimeFromFile(file);
    if (!inferredMime) {
      setCreateErr('يرجى اختيار ملف فيديو صالح (MP4 أو WebM أو MOV)');
      return;
    }
    await applySelectedVideo(file, inferredMime);
  };

  const handleStartLiveCamera = async () => {
    setCreateErr(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCreateErr('تسجيل الفيديو المباشر غير مدعوم في هذا المتصفح، يمكنك رفع فيديو من جهازك');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      recStreamRef.current = stream;
      setRecordingMode(true);
      setTimeout(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          liveVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCreateErr('تعذر فتح الكاميرا أو الميكروفون. تحقق من الأذونات.');
    }
  };

  const handleToggleRecord = () => {
    if (!isRecording) {
      const stream = recStreamRef.current;
      if (!stream) return;
      const mimeType = getPreferredVideoMimeType();
      recordedChunksRef.current = [];
      try {
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 800_000,
        });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunksRef.current.push(ev.data);
          }
        };
        recorder.onstop = () => {
          const chunks = recordedChunksRef.current;
          const recordedSec = recordElapsedRef.current;
          recordedChunksRef.current = [];
          if (chunks.length > 0) {
            const blob = new Blob(chunks, { type: mimeType });
            void applySelectedVideo(blob, mimeType, recordedSec);
          }
          if (recStreamRef.current) {
            recStreamRef.current.getTracks().forEach((t) => t.stop());
            recStreamRef.current = null;
          }
          setIsRecording(false);
          setRecordingMode(false);
        };
        recorder.start(250);
        setIsRecording(true);
      } catch {
        setCreateErr('تعذر بدء تسجيل الفيديو');
      }
    } else {
      mediaRecorderRef.current?.stop();
    }
  };

  const resetComposer = () => {
    setCreateText('');
    setCreateImage(null);
    setCreateVideoFile(null);
    if (createVideoUrl) URL.revokeObjectURL(createVideoUrl);
    setCreateVideoUrl(null);
    setCreateVideoDuration(0);
    setCreateVideoThumb(undefined);
    setUploadProgress(0);
    setCreateErr(null);
    stopRecordingCamera();
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createType === 'text' && !createText.trim()) {
      setCreateErr('اكتب نصاً للحالة');
      return;
    }
    if (createType === 'image' && !createImage) {
      setCreateErr('اختر صورة للحالة');
      return;
    }
    if (createType === 'video' && !createVideoFile) {
      setCreateErr('اختر أو سجّل فيديو للحالة');
      return;
    }
    if (createType === 'video' && createVideoDuration > MAX_STORY_VIDEO_DURATION_SEC) {
      setCreateErr('الحد الأقصى لمدة فيديو الحالة هو دقيقة واحدة (60 ثانية)');
      return;
    }
    setSubmitting(true);
    setUploadProgress(5);
    setCreateErr(null);
    try {
      await onCreateStory({
        type: createType,
        text: createText.trim(),
        mediaDataUrl: createType === 'image' && createImage ? createImage : undefined,
        mediaFile: createType === 'video' && createVideoFile ? createVideoFile : undefined,
        fileMimeType: createType === 'video' ? createVideoMime : undefined,
        mediaDurationSec: createType === 'video' ? createVideoDuration : undefined,
        thumbnailDataUrl: createType === 'video' ? createVideoThumb : undefined,
        bgColor: createType === 'text' ? createBg : undefined,
        onProgress: (pct) => setUploadProgress(pct),
      });
      resetComposer();
      setShowCreate(false);
    } catch (err) {
      setCreateErr(formatAppErrorMessage(err, 'تعذر نشر الحالة'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStory || !replyText.trim() || sendingReply) return;
    setSendingReply(true);
    try {
      await onReplyToStory(activeStory, replyText.trim());
      setReplyText('');
      setViewingOwnerId(null);
    } catch {
      // Reply error is surfaced via parent toastError handler
    } finally {
      setSendingReply(false);
    }
  };

  const myGroup = groupedByOwner.find((g) => g.ownerId === currentUser.uid);

  return (
    <>
      {/* Modern Visual Story Cards Strip */}
      <div className="px-3 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center gap-2.5 overflow-x-auto">
        {/* Add Story / My Story Card */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              if (myGroup && myGroup.items.length > 0) {
                setViewingOwnerId(currentUser.uid);
                setViewingIndex(0);
              } else {
                setShowCreate(true);
              }
            }}
            className="tap-press relative w-[78px] h-[104px] rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#1e2c3a] border border-slate-200/90 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between text-start"
          >
            {myGroup && myGroup.items.length > 0 ? (
              <>
                {myGroup.items[0].type === 'image' && (myGroup.items[0].mediaUrl || myGroup.items[0].mediaDataUrl) ? (
                  <img
                    src={myGroup.items[0].mediaUrl || myGroup.items[0].mediaDataUrl}
                    alt="حالتي"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : myGroup.items[0].type === 'video' ? (
                  myGroup.items[0].thumbnailDataUrl ? (
                    <img
                      src={myGroup.items[0].thumbnailDataUrl}
                      alt="فيديو حالتي"
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-sky-900 to-indigo-950" />
                  )
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center p-2 text-center"
                    style={{ background: myGroup.items[0].bgColor || STORY_COLORS[0] }}
                  >
                    <span className="text-[9.5px] font-semibold text-white/95 line-clamp-3 leading-snug">
                      {myGroup.items[0].text}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-black/25" />
                <div className="relative z-10 p-1.5 flex items-center justify-between gap-1">
                  <div className="rounded-full ring-2 ring-sky-400">
                    <Avatar
                      photoURL={currentUser.photoURL}
                      seed={currentUser.uid}
                      name={currentUser.displayName}
                      size="2xs"
                    />
                  </div>
                  {myGroup.items[0].type === 'video' && (
                    <span className="w-5 h-5 rounded-full bg-black/55 backdrop-blur-xs text-white flex items-center justify-center">
                      <Play className="w-2.5 h-2.5 fill-white" />
                    </span>
                  )}
                </div>
                <div className="relative z-10 px-1.5 pb-1.5 flex items-center justify-between">
                  <span className="text-[10.5px] font-bold text-white truncate">حالتي</span>
                  {myGroup.items.length > 1 && (
                    <span className="px-1 py-0.2 rounded bg-white/25 text-[9px] font-bold text-white tabular-nums">
                      {myGroup.items.length}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center gap-1.5 bg-gradient-to-b from-sky-50 to-white dark:from-[#1f2e3d] dark:to-[#17212b]">
                <div className="w-9 h-9 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  إضافة حالة
                </span>
              </div>
            )}
          </button>

          {myGroup && myGroup.items.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCreate(true);
              }}
              title="نشر حالة جديدة"
              aria-label="نشر حالة جديدة"
              className="absolute -top-1 -end-1 z-20 w-6 h-6 rounded-full bg-sky-600 hover:bg-sky-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-[#17212b] shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Other Users' Story Cards */}
        {groupedByOwner
          .filter((g) => g.ownerId !== currentUser.uid)
          .map((group) => {
            const latest = group.items[0];
            return (
              <button
                key={group.ownerId}
                type="button"
                onClick={() => {
                  setViewingOwnerId(group.ownerId);
                  setViewingIndex(0);
                }}
                className="tap-press relative w-[78px] h-[104px] rounded-2xl overflow-hidden shrink-0 ring-2 ring-sky-500/80 ring-offset-2 ring-offset-white dark:ring-offset-[#17212b] shadow-xs hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between text-start"
              >
                {latest.type === 'image' && (latest.mediaUrl || latest.mediaDataUrl) ? (
                  <img
                    src={latest.mediaUrl || latest.mediaDataUrl}
                    alt={group.ownerName}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : latest.type === 'video' ? (
                  latest.thumbnailDataUrl ? (
                    <img
                      src={latest.thumbnailDataUrl}
                      alt={group.ownerName}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-sky-900 to-indigo-950" />
                  )
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center p-2 text-center"
                    style={{ background: latest.bgColor || STORY_COLORS[0] }}
                  >
                    <span className="text-[9.5px] font-semibold text-white/95 line-clamp-3 leading-snug">
                      {latest.text}
                    </span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />

                {/* Top segmented indicator + Avatar */}
                <div className="relative z-10 p-1.5 space-y-1">
                  {group.items.length > 1 && (
                    <div className="flex items-center gap-0.5" dir="ltr">
                      {group.items.slice(0, 4).map((it) => (
                        <span key={it.id} className="flex-1 h-0.5 rounded-full bg-white/80" />
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="rounded-full ring-2 ring-white/90">
                      <Avatar
                        photoURL={group.ownerPhotoURL}
                        seed={group.ownerId}
                        name={group.ownerName}
                        size="2xs"
                      />
                    </div>
                    {latest.type === 'video' && (
                      <span className="w-5 h-5 rounded-full bg-black/55 backdrop-blur-xs text-white flex items-center justify-center">
                        <Play className="w-2.5 h-2.5 fill-white" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Owner Name */}
                <div className="relative z-10 px-1.5 pb-1.5">
                  <span className="block text-[10.5px] font-bold text-white truncate drop-shadow-xs">
                    {group.ownerName}
                  </span>
                </div>
              </button>
            );
          })}
      </div>

      {/* Create Story Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
          onClick={() => {
            if (!submitting) setShowCreate(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-zeno-popover w-full max-w-md bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                نشر حالة جديدة (24 ساعة)
              </h3>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="p-5 space-y-4">
              {/* Type Tabs: Text | Image | Video */}
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-[#242f3d]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    stopRecordingCamera();
                    setCreateType('text');
                  }}
                  className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 ${
                    createType === 'text'
                      ? 'bg-white dark:bg-[#17212b] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" />
                  <span>نص</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    stopRecordingCamera();
                    setCreateType('image');
                  }}
                  className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 ${
                    createType === 'image'
                      ? 'bg-white dark:bg-[#17212b] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>صورة</span>
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setCreateType('video')}
                  className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-60 ${
                    createType === 'video'
                      ? 'bg-white dark:bg-[#17212b] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>فيديو</span>
                </button>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoPick}
              />

              {createType === 'text' ? (
                <>
                  <div
                    className="h-52 rounded-2xl p-6 flex items-center justify-center text-center text-white font-semibold text-base shadow-inner transition-all"
                    style={{ background: createBg }}
                  >
                    <textarea
                      value={createText}
                      onChange={(e) => setCreateText(e.target.value)}
                      maxLength={350}
                      rows={4}
                      placeholder="شارك فكرتك أو لحظتك الآن..."
                      className="w-full bg-transparent text-center text-white placeholder:text-white/70 resize-none focus:outline-none text-lg font-bold leading-relaxed"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2.5">
                    {STORY_COLORS.map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => setCreateBg(bg)}
                        className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-transform ${
                          createBg === bg
                            ? 'border-slate-900 dark:border-white scale-110 shadow-md'
                            : 'border-transparent opacity-85 hover:opacity-100'
                        }`}
                        style={{ background: bg }}
                      />
                    ))}
                  </div>
                </>
              ) : createType === 'image' ? (
                <div className="space-y-3">
                  {createImage ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black h-56 flex items-center justify-center">
                      <img src={createImage} alt="معاينة الحالة" className="max-h-56 object-contain" />
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="absolute bottom-2.5 end-2.5 px-3 py-1.5 rounded-xl bg-black/75 text-white text-xs font-medium cursor-pointer"
                      >
                        تغيير الصورة
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full h-44 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors"
                    >
                      <ImageIcon className="w-8 h-8 text-sky-500" />
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        اختر صورة من جهازك
                      </span>
                    </button>
                  )}
                  <input
                    type="text"
                    value={createText}
                    onChange={(e) => setCreateText(e.target.value)}
                    maxLength={250}
                    placeholder="تعليق على الصورة (اختياري)..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  {recordingMode ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black h-60 flex items-center justify-center">
                      <video
                        ref={liveVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2.5 start-2.5 px-2.5 py-1 rounded-full bg-black/65 text-white text-xs font-semibold flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        />
                        <span className="tabular-nums">
                          {isRecording
                            ? `${formatAudioDuration(recordElapsed)} / ${formatAudioDuration(MAX_STORY_VIDEO_DURATION_SEC)}`
                            : 'جاهز للتسجيل · حتى دقيقة'}
                        </span>
                      </div>
                      <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleToggleRecord}
                          className={`px-4 py-2 rounded-full text-xs font-bold text-white flex items-center gap-1.5 shadow-lg cursor-pointer ${
                            isRecording
                              ? 'bg-red-600 hover:bg-red-500'
                              : 'bg-sky-600 hover:bg-sky-500'
                          }`}
                        >
                          {isRecording ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-white" />
                              <span>إيقاف وحفظ</span>
                            </>
                          ) : (
                            <>
                              <Camera className="w-3.5 h-3.5" />
                              <span>بدء التسجيل</span>
                            </>
                          )}
                        </button>
                        {!isRecording && (
                          <button
                            type="button"
                            onClick={stopRecordingCamera}
                            className="px-3 py-2 rounded-full bg-black/65 text-white text-xs cursor-pointer"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </div>
                  ) : createVideoUrl ? (
                    <div className="relative rounded-2xl overflow-hidden bg-black h-60 flex items-center justify-center">
                      <video
                        src={createVideoUrl}
                        controls
                        playsInline
                        className="max-h-60 w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setCreateVideoFile(null);
                          if (createVideoUrl) URL.revokeObjectURL(createVideoUrl);
                          setCreateVideoUrl(null);
                          setCreateVideoThumb(undefined);
                        }}
                        className="absolute top-2.5 end-2.5 px-2.5 py-1 rounded-lg bg-black/75 text-white text-xs cursor-pointer hover:bg-black"
                      >
                        تغيير الفيديو
                      </button>
                      {createVideoDuration > 0 && (
                        <span className="absolute top-2.5 start-2.5 px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] tabular-nums">
                          {formatAudioDuration(createVideoDuration)}
                        </span>
                      )}
                    </div>
                  ) : videoPreparing ? (
                    <div className="h-40 rounded-2xl border-2 border-dashed border-sky-400/70 bg-sky-500/5 flex flex-col items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
                      <span className="font-semibold">جاري تجهيز الفيديو والتحقق من المدة...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => videoInputRef.current?.click()}
                        className="h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:border-sky-500 hover:bg-sky-500/5 transition-colors p-3 text-center"
                      >
                        <Upload className="w-7 h-7 text-sky-500" />
                        <span className="font-semibold">رفع فيديو من الجهاز</span>
                        <span className="text-[10px] text-slate-400">حد أقصى دقيقة واحدة (60 ثانية)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStartLiveCamera}
                        className="h-40 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer hover:border-rose-500 hover:bg-rose-500/5 transition-colors p-3 text-center"
                      >
                        <Camera className="w-7 h-7 text-rose-500" />
                        <span className="font-semibold">تصوير فيديو مباشر</span>
                        <span className="text-[10px] text-slate-400">كاميرا + صوت · حتى دقيقة</span>
                      </button>
                    </div>
                  )}

                  <input
                    type="text"
                    value={createText}
                    onChange={(e) => setCreateText(e.target.value)}
                    maxLength={250}
                    placeholder="وصف الفيديو (اختياري)..."
                    disabled={submitting}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-base sm:text-sm text-slate-900 dark:text-white focus:outline-none disabled:opacity-60"
                  />
                </div>
              )}

              {submitting && createType === 'video' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-300">
                    <span>جاري رفع الفيديو بسرعة... لا تغلق النافذة</span>
                    <span className="tabular-nums font-semibold">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-sky-600 transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {createErr && <p className="text-xs text-red-600 dark:text-red-400">{createErr}</p>}

              <button
                type="submit"
                disabled={submitting || recordingMode || videoPreparing}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {submitting
                    ? createType === 'video'
                      ? `جاري الرفع (${uploadProgress}%)`
                      : 'جاري النشر...'
                    : 'نشر الحالة الآن'}
                </span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modern Fullscreen Story Viewer */}
      {activeGroup && activeStory && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-2 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:p-6"
          dir="rtl"
          onClick={() => setViewingOwnerId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, input, form, a')) return;
              if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
              heldPauseRef.current = false;
              holdTimerRef.current = window.setTimeout(() => {
                heldPauseRef.current = true;
                setIsPaused(true);
              }, 180);
            }}
            onPointerUp={() => {
              if (holdTimerRef.current) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
              }
              if (heldPauseRef.current) {
                heldPauseRef.current = false;
                setIsPaused(false);
              }
            }}
            onPointerCancel={() => {
              if (holdTimerRef.current) {
                window.clearTimeout(holdTimerRef.current);
                holdTimerRef.current = null;
              }
              if (heldPauseRef.current) {
                heldPauseRef.current = false;
                setIsPaused(false);
              }
            }}
            className="relative w-full max-w-md h-[86vh] max-h-[760px] rounded-3xl overflow-hidden bg-slate-900 border border-white/10 shadow-2xl flex flex-col justify-between select-none"
          >
            {/* Top Progress & Header */}
            <div className="relative z-20 p-4 bg-gradient-to-b from-black/80 via-black/45 to-transparent space-y-3">
              <div className="flex items-center gap-1.5" dir="ltr">
                {activeGroup.items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden"
                  >
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-75"
                      style={{
                        width:
                          idx < viewingIndex
                            ? '100%'
                            : idx === viewingIndex
                            ? `${storyProgress}%`
                            : '0%',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    photoURL={activeGroup.ownerPhotoURL}
                    seed={activeGroup.ownerId}
                    name={activeGroup.ownerName}
                    size="sm"
                  />
                  <div className="min-w-0 text-white">
                    <div className="text-xs font-bold truncate">{activeGroup.ownerName}</div>
                    <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                      <span>{formatStoryAge(activeStory.createdAt)}</span>
                      {isPaused && <span className="text-sky-300 font-semibold">· متوقف</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {activeStory.type === 'video' && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextMuted = !isMuted;
                        setIsMuted(nextMuted);
                        setAutoplayMutedNotice(false);
                        if (viewerVideoRef.current) {
                          viewerVideoRef.current.muted = nextMuted;
                        }
                      }}
                      title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
                      className="p-1.5 rounded-lg text-white/90 hover:bg-white/15 cursor-pointer"
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const nextPaused = !isPaused;
                      setIsPaused(nextPaused);
                      const vid = viewerVideoRef.current;
                      if (vid && activeStory.type === 'video') {
                        if (nextPaused) {
                          vid.pause();
                        } else {
                          void attemptPlayVideo(vid);
                        }
                      }
                    }}
                    title={isPaused ? 'استئناف' : 'إيقاف مؤقت'}
                    className="p-1.5 rounded-lg text-white/90 hover:bg-white/15 cursor-pointer"
                  >
                    {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>
                  {activeStory.ownerId === currentUser.uid && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreate(true);
                          setViewingOwnerId(null);
                        }}
                        title="إضافة حالة"
                        className="p-1.5 rounded-lg text-white/90 hover:bg-white/15 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeleteStory(activeStory.id);
                          setViewingOwnerId(null);
                        }}
                        title="حذف الحالة"
                        className="p-1.5 rounded-lg text-red-300 hover:bg-white/15 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setViewingOwnerId(null)}
                    className="p-1.5 rounded-lg text-white/90 hover:bg-white/15 cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div
              className="absolute inset-0 flex items-center justify-center p-4 text-center"
              style={
                activeStory.type === 'text'
                  ? { background: activeStory.bgColor || STORY_COLORS[0] }
                  : undefined
              }
            >
              {activeStory.type === 'video' ? (
                viewerMediaUrl && !videoPlaybackError ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <video
                      key={`${activeStory.id}-${mediaRetryNonce}`}
                      ref={viewerVideoRef}
                      src={viewerMediaUrl}
                      poster={activeStory.thumbnailDataUrl}
                      preload="auto"
                      autoPlay
                      muted={isMuted}
                      playsInline
                      onClick={() => {
                        const vid = viewerVideoRef.current;
                        if (!vid) return;
                        if (vid.paused) {
                          setIsPaused(false);
                          void attemptPlayVideo(vid);
                        } else {
                          vid.pause();
                          setIsPaused(true);
                        }
                      }}
                      onLoadedData={(e) => {
                        setIsVideoBuffering(false);
                        if (!isPaused && !showViewsSheet) {
                          void attemptPlayVideo(e.currentTarget);
                        }
                      }}
                      onCanPlay={() => setIsVideoBuffering(false)}
                      onWaiting={() => setIsVideoBuffering(true)}
                      onPlaying={() => {
                        setIsVideoBuffering(false);
                        setIsVideoPlaying(true);
                        setVideoPlaybackError(null);
                      }}
                      onPause={() => setIsVideoPlaying(false)}
                      onTimeUpdate={(e) => {
                        const vid = e.currentTarget;
                        const effectiveDuration =
                          Number.isFinite(vid.duration) && vid.duration > 0
                            ? vid.duration
                            : activeStory.mediaDurationSec || 0;
                        if (effectiveDuration > 0) {
                          setStoryProgress(
                            Math.min(100, (vid.currentTime / effectiveDuration) * 100)
                          );
                        }
                      }}
                      onEnded={() => {
                        setIsVideoPlaying(false);
                        setStoryProgress(100);
                        handleNextStory();
                      }}
                      onError={() => {
                        setIsVideoBuffering(false);
                        setIsVideoPlaying(false);
                        setVideoPlaybackError(
                          'تعذر تشغيل صيغة هذا الفيديو داخل المتصفح. يمكنك تحميله ومشاهدته على جهازك.'
                        );
                      }}
                      className="max-h-full max-w-full rounded-xl object-contain cursor-pointer"
                    />

                    {isVideoBuffering && isVideoPlaying && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="p-3 rounded-full bg-black/55 text-white">
                          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                        </div>
                      </div>
                    )}

                    {!isVideoPlaying && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPaused(false);
                          if (viewerVideoRef.current) {
                            void attemptPlayVideo(viewerVideoRef.current);
                          }
                        }}
                        aria-label="تشغيل الفيديو"
                        className="absolute z-10 w-16 h-16 rounded-full bg-black/65 hover:bg-black/80 text-white flex items-center justify-center shadow-2xl border border-white/25 backdrop-blur-xs cursor-pointer transition-transform hover:scale-105"
                      >
                        <Play className="w-7 h-7 fill-white ms-0.5" />
                      </button>
                    )}

                    {autoplayMutedNotice && isMuted && isVideoPlaying && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsMuted(false);
                          setAutoplayMutedNotice(false);
                          if (viewerVideoRef.current) {
                            viewerVideoRef.current.muted = false;
                          }
                        }}
                        className="absolute bottom-20 z-20 px-3.5 py-1.5 rounded-full bg-black/70 hover:bg-black/85 text-white text-xs font-semibold inline-flex items-center gap-1.5 border border-white/20 backdrop-blur-xs cursor-pointer shadow-lg"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-sky-400" />
                        <span>اضغط لتشغيل الصوت</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative w-full h-full flex flex-col items-center justify-center gap-3">
                    {activeStory.thumbnailDataUrl && (
                      <img
                        src={activeStory.thumbnailDataUrl}
                        alt="معاينة الفيديو"
                        className="absolute inset-0 w-full h-full object-contain opacity-45 blur-xs"
                      />
                    )}
                    <div className="relative z-30 flex flex-col items-center gap-2.5 px-5 py-4 rounded-2xl bg-black/75 text-white max-w-xs text-center">
                      {viewerMediaLoading ? (
                        <>
                          <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                          <span className="text-xs font-medium tabular-nums">
                            جاري تحميل الفيديو... {viewerMediaProgress}%
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-red-300 leading-relaxed">
                            {videoPlaybackError || viewerMediaError || 'تعذر تشغيل الفيديو'}
                          </span>
                          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                clearReadQuotaCooldown();
                                setVideoPlaybackError(null);
                                setViewerMediaError(null);
                                setMediaRetryNonce((n) => n + 1);
                              }}
                              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>إعادة المحاولة</span>
                            </button>
                            {viewerMediaUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ext = activeStory.fileMimeType?.includes('webm') ? 'webm' : 'mp4';
                                  triggerFileDownload(viewerMediaUrl, `zeno-story-${activeStory.id}.${ext}`);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>تحميل</span>
                              </button>
                            )}
                            {!viewerMediaUrl && activeStory.ownerId === currentUser.uid && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await onDeleteStory(activeStory.id);
                                    setViewingOwnerId(null);
                                  } catch (err) {
                                    setViewerMediaError(
                                      formatAppErrorMessage(err, 'تعذر حذف الحالة غير المكتملة')
                                    );
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl bg-red-600/85 hover:bg-red-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف الحالة</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              ) : activeStory.type === 'image' && (viewerMediaUrl || activeStory.mediaUrl || activeStory.mediaDataUrl) ? (
                <img
                  src={viewerMediaUrl || activeStory.mediaUrl || activeStory.mediaDataUrl}
                  alt="حالة"
                  className="max-h-full max-w-full object-contain rounded-xl"
                />
              ) : (
                <p className="text-white text-2xl font-bold leading-relaxed whitespace-pre-wrap break-words max-w-sm drop-shadow-sm px-3">
                  {activeStory.text}
                </p>
              )}
            </div>

            {/* Prev / Next Navigation Buttons */}
            <button
              type="button"
              onClick={handlePrevStory}
              aria-label="السابق"
              className="absolute start-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 text-white hover:bg-black/65 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextStory}
              aria-label="التالي"
              className="absolute end-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 text-white hover:bg-black/65 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Footer (Caption + Reply or Views) */}
            <div className="relative z-20 p-4 bg-gradient-to-t from-black/85 via-black/55 to-transparent space-y-2.5">
              {(activeStory.type === 'image' || activeStory.type === 'video') && activeStory.text && (
                <p className="text-xs text-white text-center leading-relaxed bg-black/35 backdrop-blur-xs rounded-xl px-3 py-1.5">
                  {activeStory.text}
                </p>
              )}

              {activeStory.ownerId === currentUser.uid ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowViewsSheet((prev) => !prev)}
                    className="mx-auto px-3.5 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>المشاهدات ({viewsList.length})</span>
                  </button>
                  {showViewsSheet && viewsList.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-2xl bg-slate-900/95 border border-white/10 p-2 space-y-1.5">
                      {viewsList.map((v) => (
                        <div key={v.uid} className="flex items-center gap-2 text-xs text-white">
                          <Avatar
                            photoURL={v.viewerPhotoURL}
                            seed={v.uid}
                            name={v.viewerName}
                            size="xs"
                          />
                          <span className="truncate">{v.viewerName}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`رد على حالة ${activeGroup.ownerName}...`}
                    className="flex-1 px-3.5 py-2.5 rounded-full bg-white/15 border border-white/20 text-base sm:text-xs text-white placeholder:text-white/65 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sendingReply}
                    className="p-2.5 rounded-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
