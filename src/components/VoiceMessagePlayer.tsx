import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Mic, Pause, Play } from 'lucide-react';
import { getAudioExtensionFromMime } from '../lib/audioRecorder';
import { getMessageDownloadUrl } from '../lib/chatService';
import { formatAudioDuration, formatFileSize, triggerFileDownload } from '../lib/mediaUtils';
import { Message } from '../types/telegram';

interface VoiceMessagePlayerProps {
  message: Message;
  isOwn: boolean;
}

const WAVEFORM_BARS = 32;
const SPEED_OPTIONS: Array<1 | 1.5 | 2> = [1, 1.5, 2];
const AUDIO_PLAY_EVENT = 'zeno:voice-play';

function buildWaveformPeaks(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i += 1) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const normalized = ((h >>> 0) % 100) / 100;
    // Create a natural voice envelope (gentle taper at start/end)
    const envelope = Math.sin(((i + 1) / (WAVEFORM_BARS + 1)) * Math.PI);
    const height = Math.round(24 + normalized * 56 + envelope * 20);
    bars.push(Math.min(100, Math.max(20, height)));
  }
  return bars;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({ message, isOwn }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [detectedDuration, setDetectedDuration] = useState<number>(message.mediaDurationSec || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 1.5 | 2>(1);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveTrackRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef(false);

  const peaks = useMemo(() => buildWaveformPeaks(message.id), [message.id]);
  const effectiveAudioSrc = resolvedMediaUrl || message.mediaUrl || message.mediaDataUrl || undefined;
  const totalDuration =
    Number.isFinite(detectedDuration) && detectedDuration > 0
      ? detectedDuration
      : message.mediaDurationSec || 0;
  const progressRatio = totalDuration > 0 ? Math.min(1, Math.max(0, currentTime / totalDuration)) : 0;

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDetectedDuration(message.mediaDurationSec || 0);
    setResolvedMediaUrl(null);
    setAudioError(null);
  }, [message.id, message.mediaDurationSec]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncDuration = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDetectedDuration(audio.duration);
      }
    };

    const onTime = () => {
      if (isSeekingRef.current) return;
      syncDuration();
      setCurrentTime(audio.currentTime || 0);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onError = () => {
      setIsPlaying(false);
      setAudioError('تعذر تشغيل هذا المقطع الصوتي');
    };

    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', syncDuration);
      audio.removeEventListener('durationchange', syncDuration);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('error', onError);
    };
  }, [effectiveAudioSrc]);

  // Pause this player automatically when another voice message starts playing
  useEffect(() => {
    const onOtherVoicePlay = (evt: Event) => {
      const custom = evt as CustomEvent<{ messageId?: string }>;
      if (custom.detail?.messageId && custom.detail.messageId !== message.id) {
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
        }
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, onOtherVoicePlay);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, onOtherVoicePlay);
  }, [message.id]);

  const ensureAudioSource = async (): Promise<string | undefined> => {
    if (effectiveAudioSrc) return effectiveAudioSrc;
    if (!message.mediaChunkCount) return undefined;
    setLoadingMedia(true);
    setDownloadProgress(0);
    try {
      const url = await getMessageDownloadUrl(message, (pct) => setDownloadProgress(pct));
      setResolvedMediaUrl(url);
      if (audioRef.current) {
        audioRef.current.src = url;
      }
      return url;
    } finally {
      setLoadingMedia(false);
      setDownloadProgress(null);
    }
  };

  const togglePlay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    setAudioError(null);
    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      const srcToPlay = await ensureAudioSource();
      if (!srcToPlay) {
        setAudioError('ملف الصوت غير متوفر');
        return;
      }
      if (!audio.src || audio.src !== srcToPlay) {
        audio.src = srcToPlay;
      }
      audio.playbackRate = playbackSpeed;
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: { messageId: message.id } }));
      await audio.play();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setAudioError('تعذر بدء تشغيل الصوت');
    }
  };

  const seekByClientX = (clientX: number) => {
    const track = waveTrackRef.current;
    const audio = audioRef.current;
    if (!track || !audio) return;
    const duration =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : totalDuration;
    if (!duration || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const targetTime = ratio * duration;
    setCurrentTime(targetTime);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = targetTime;
    } else if (audio.seekable && audio.seekable.length > 0) {
      audio.currentTime = targetTime;
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextIdx = (SPEED_OPTIONS.indexOf(playbackSpeed) + 1) % SPEED_OPTIONS.length;
    const nextSpeed = SPEED_OPTIONS[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loadingMedia) return;
    try {
      const url = await ensureAudioSource();
      if (!url) return;
      const ext = getAudioExtensionFromMime(message.fileMimeType);
      triggerFileDownload(url, message.fileName || `voice-message-${message.id.slice(-6)}.${ext}`);
    } catch {
      setAudioError('تعذر تنزيل الملف الصوتي');
    }
  };

  const isVoiceNote = !message.fileName;

  return (
    <div
      data-no-bubble-toggle="true"
      className="flex items-center gap-3 py-1 min-w-[245px] sm:min-w-[280px]"
    >
      <audio ref={audioRef} src={effectiveAudioSrc} preload="metadata" />

      <button
        type="button"
        onClick={togglePlay}
        disabled={loadingMedia}
        aria-label={isPlaying ? 'إيقاف مؤقت' : 'تشغيل الرسالة الصوتية'}
        className="tap-press w-11 h-11 rounded-full bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors cursor-pointer"
      >
        {loadingMedia ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5" />
        ) : (
          <Play className="w-5 h-5 translate-x-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {message.fileName ? (
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate mb-1">
            {message.fileName}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] font-medium text-sky-700 dark:text-sky-300 mb-1">
            <Mic className="w-3 h-3 shrink-0" />
            <span>رسالة صوتية</span>
          </div>
        )}

        {/* Interactive Audio Waveform Seek Track */}
        <div
          ref={waveTrackRef}
          dir="ltr"
          role="slider"
          aria-label="مؤشر تشغيل الصوت"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalDuration)}
          aria-valuenow={Math.round(currentTime)}
          tabIndex={0}
          onPointerDown={(e) => {
            e.stopPropagation();
            isSeekingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            seekByClientX(e.clientX);
          }}
          onPointerMove={(e) => {
            if (!isSeekingRef.current) return;
            seekByClientX(e.clientX);
          }}
          onPointerUp={(e) => {
            if (!isSeekingRef.current) return;
            isSeekingRef.current = false;
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              // Ignore release failures
            }
          }}
          onPointerCancel={() => {
            isSeekingRef.current = false;
          }}
          className="h-7 flex items-center gap-[2.5px] cursor-pointer touch-none select-none"
        >
          {peaks.map((heightPct, idx) => {
            const barRatio = (idx + 0.5) / WAVEFORM_BARS;
            const isPlayed = progressRatio > 0 && barRatio <= progressRatio;
            return (
              <span
                key={idx}
                style={{ height: `${heightPct}%` }}
                className={`flex-1 min-w-[2.5px] rounded-full transition-colors duration-100 ${
                  isPlayed
                    ? isOwn
                      ? 'bg-emerald-600 dark:bg-sky-300'
                      : 'bg-sky-600 dark:bg-sky-400'
                    : isOwn
                    ? 'bg-emerald-900/20 dark:bg-white/25'
                    : 'bg-slate-400/45 dark:bg-slate-500/55'
                }`}
              />
            );
          })}
        </div>

        {/* Metadata, Elapsed/Total Time, Playback Speed & Download */}
        <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-300 tabular-nums">
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <span>
              {isPlaying || currentTime > 0
                ? `${formatAudioDuration(currentTime)} / ${formatAudioDuration(totalDuration)}`
                : formatAudioDuration(totalDuration)}
            </span>
            {loadingMedia && downloadProgress !== null && (
              <span>· {downloadProgress}%</span>
            )}
            {!isVoiceNote && message.fileSize ? (
              <span className="truncate">· {formatFileSize(message.fileSize)}</span>
            ) : null}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={cycleSpeed}
              title="تغيير سرعة التشغيل"
              className={`px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold transition-colors cursor-pointer ${
                playbackSpeed !== 1
                  ? 'bg-sky-500/20 text-sky-700 dark:text-sky-200'
                  : 'bg-slate-900/6 dark:bg-white/10 text-slate-600 dark:text-slate-200 hover:bg-slate-900/12'
              }`}
            >
              {playbackSpeed}×
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={loadingMedia}
              title="تنزيل الرسالة الصوتية"
              aria-label="تنزيل الرسالة الصوتية"
              className="p-1 rounded-md text-sky-600 dark:text-sky-300 hover:bg-sky-500/10 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {audioError && (
          <div className="mt-1 text-[11px] text-red-600 dark:text-red-300">{audioError}</div>
        )}
      </div>
    </div>
  );
};
