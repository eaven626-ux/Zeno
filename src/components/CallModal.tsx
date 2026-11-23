import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Video,
  VideoOff,
} from 'lucide-react';
import { CallSession, PublicUser } from '../types/telegram';
import {
  answerCallSession,
  cleanupOldCallCandidates,
  pushCallCandidate,
  RTC_CONFIG,
  setCallOfferSdp,
  subscribeCallCandidates,
  subscribeCallSession,
  updateCallStatus,
} from '../lib/webrtcService';
import { Avatar } from './Avatar';

interface CallModalProps {
  callId: string;
  initialSession: CallSession;
  currentUser: PublicUser;
  peerPhotoURL?: string;
  onClose: () => void;
}

function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const CallModal: React.FC<CallModalProps> = ({
  callId,
  initialSession,
  currentUser,
  peerPhotoURL,
  onClose,
}) => {
  const isCaller = initialSession.callerId === currentUser.uid;
  const [session, setSession] = useState<CallSession>(initialSession);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(initialSession.mode !== 'video');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);
  const [hasAccepted, setHasAccepted] = useState(isCaller);
  const [iceState, setIceState] = useState<RTCIceConnectionState>('new');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const appliedRemoteAnswerRef = useRef(false);
  const appliedRemoteOfferRef = useRef(false);
  const peerReadyRef = useRef(false);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const latestSessionRef = useRef<CallSession>(initialSession);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const peerId = isCaller ? session.calleeId : session.callerId;
  const peerName = isCaller ? session.calleeName : session.callerName;
  const peerAvatar = peerPhotoURL || (!isCaller ? session.callerPhotoURL : undefined);

  const applyRemoteAnswer = async (answerSdp: string) => {
    const pc = pcRef.current;
    if (!pc || !peerReadyRef.current || appliedRemoteAnswerRef.current) return;
    appliedRemoteAnswerRef.current = true;
    try {
      const answer = JSON.parse(answerSdp) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      const queued = pendingIceRef.current.splice(0);
      for (const c of queued) {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
    } catch {
      appliedRemoteAnswerRef.current = false;
    }
  };

  const applyRemoteOffer = async (offerSdp: string) => {
    const pc = pcRef.current;
    if (!pc || !peerReadyRef.current || appliedRemoteOfferRef.current) return;
    appliedRemoteOfferRef.current = true;
    try {
      const offer = JSON.parse(offerSdp) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const queued = pendingIceRef.current.splice(0);
      for (const c of queued) {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await answerCallSession(callId, answer);
    } catch {
      appliedRemoteOfferRef.current = false;
    }
  };

  const applyRemoteAnswerRef = useRef(applyRemoteAnswer);
  applyRemoteAnswerRef.current = applyRemoteAnswer;
  const applyRemoteOfferRef = useRef(applyRemoteOffer);
  applyRemoteOfferRef.current = applyRemoteOffer;

  const teardownMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // Ignore close errors
      }
      pcRef.current = null;
    }
  };

  // Gentle Web Audio ringing / ringback tone while status === 'ringing'
  useEffect(() => {
    if (session.status !== 'ringing') return;
    let ctx: AudioContext | null = null;
    let intervalId: number | null = null;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      ctx = new AudioCtx();

      const playBeep = () => {
        if (!ctx || ctx.state === 'closed') return;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(isCaller ? 440 : 523.25, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.04, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.48);
      };

      playBeep();
      intervalId = window.setInterval(playBeep, isCaller ? 2600 : 2000);
    } catch {
      // Ignore autoplay restrictions
    }
    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      if (ctx) ctx.close().catch(() => {});
    };
  }, [session.status, isCaller]);

  // Missed-call 45s timeout for caller if callee does not answer
  useEffect(() => {
    if (!isCaller || session.status !== 'ringing') return;
    const timeoutId = window.setTimeout(() => {
      if (latestSessionRef.current.status === 'ringing') {
        teardownMedia();
        void updateCallStatus(callId, 'missed');
        void cleanupOldCallCandidates(callId);
        onCloseRef.current();
      }
    }, 45000);
    return () => window.clearTimeout(timeoutId);
  }, [callId, isCaller, session.status]);

  useEffect(() => {
    if (session.status !== 'active') return;
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.status]);

  // Attach local & remote video streams whenever <video> mounts
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [hasAccepted, session.mode, cameraOff, session.status]);

  useEffect(() => {
    const unsubSession = subscribeCallSession(callId, (updated) => {
      if (!updated) {
        teardownMedia();
        onCloseRef.current();
        return;
      }
      latestSessionRef.current = updated;
      setSession(updated);

      if (updated.status === 'ended' || updated.status === 'declined' || updated.status === 'missed') {
        teardownMedia();
        window.setTimeout(() => onCloseRef.current(), 800);
        return;
      }

      if (isCaller && updated.answerSdp) {
        void applyRemoteAnswerRef.current(updated.answerSdp);
      }

      if (!isCaller && updated.offerSdp) {
        void applyRemoteOfferRef.current(updated.offerSdp);
      }
    });

    return () => {
      unsubSession();
    };
  }, [callId, isCaller]);

  useEffect(() => {
    if (!hasAccepted) return;
    let cancelled = false;
    let unsubCandidates: (() => void) | null = null;
    peerReadyRef.current = false;
    appliedRemoteOfferRef.current = false;
    appliedRemoteAnswerRef.current = false;
    pendingIceRef.current = [];

    const startPeer = async () => {
      if (typeof RTCPeerConnection === 'undefined') {
        setCallError('المتصفح الحالي لا يدعم المكالمات عبر WebRTC.');
        return;
      }
      try {
        let stream: MediaStream;
        const wantVideo = initialSession.mode === 'video';
        if (wantVideo) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
              video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            });
          } catch {
            // Fallback to audio-only if camera fails or is unavailable
            stream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
              video: false,
            });
            if (!cancelled) {
              setCameraOff(true);
              setCallError('الكاميرا غير متاحة حالياً، تم المتابعة بالصوت فقط.');
            }
          }
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
            video: false,
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.play().catch(() => {});
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        pcRef.current = pc;

        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          const tracks = event.streams[0]?.getTracks();
          if (tracks && tracks.length > 0) {
            tracks.forEach((t) => {
              if (!remoteStream.getTracks().some((existing) => existing.id === t.id)) {
                remoteStream.addTrack(t);
              }
            });
          } else if (event.track) {
            if (!remoteStream.getTracks().some((existing) => existing.id === event.track.id)) {
              remoteStream.addTrack(event.track);
            }
          }
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(() => {});
          }
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        };

        pc.oniceconnectionstatechange = () => {
          if (!cancelled) {
            setIceState(pc.iceConnectionState);
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void pushCallCandidate({
              callId,
              callerId: initialSession.callerId,
              calleeId: initialSession.calleeId,
              senderId: currentUser.uid,
              role: isCaller ? 'caller' : 'callee',
              candidate: event.candidate,
            });
          }
        };

        unsubCandidates = subscribeCallCandidates(
          callId,
          isCaller ? 'callee' : 'caller',
          (cand) => {
            if (pc.remoteDescription && pc.remoteDescription.type) {
              pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            } else {
              pendingIceRef.current.push(cand);
            }
          }
        );

        peerReadyRef.current = true;

        if (isCaller) {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: wantVideo,
          });
          await pc.setLocalDescription(offer);
          await setCallOfferSdp(callId, offer);
          if (latestSessionRef.current.answerSdp) {
            await applyRemoteAnswerRef.current(latestSessionRef.current.answerSdp);
          }
        } else {
          const currentOffer = latestSessionRef.current.offerSdp || initialSession.offerSdp;
          if (currentOffer) {
            await applyRemoteOfferRef.current(currentOffer);
          }
        }
      } catch {
        if (!cancelled) {
          setCallError('تعذر الوصول إلى الميكروفون أو الكاميرا. تأكد من منح الأذونات للمتصفح.');
        }
      }
    };

    void startPeer();

    return () => {
      cancelled = true;
      peerReadyRef.current = false;
      unsubCandidates?.();
      teardownMedia();
    };
  }, [
    hasAccepted,
    callId,
    currentUser.uid,
    initialSession.calleeId,
    initialSession.callerId,
    initialSession.mode,
    initialSession.offerSdp,
    isCaller,
  ]);

  const handleToggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micMuted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  };

  const handleToggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    const next = !cameraOff;
    videoTracks.forEach((t) => {
      t.enabled = !next;
    });
    setCameraOff(next);
  };

  const handleFlipCamera = async () => {
    if (session.mode !== 'video' || !pcRef.current || !localStreamRef.current) return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
      localStreamRef.current.getVideoTracks().forEach((t) => {
        t.stop();
        localStreamRef.current?.removeTrack(t);
      });
      localStreamRef.current.addTrack(newTrack);
      newTrack.enabled = !cameraOff;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setFacingMode(nextMode);
    } catch {
      // Single camera device; ignore flip
    }
  };

  const handleEndOrDecline = async () => {
    const nextStatus = !isCaller && session.status === 'ringing' && !hasAccepted ? 'declined' : 'ended';
    teardownMedia();
    await updateCallStatus(callId, nextStatus);
    void cleanupOldCallCandidates(callId);
    onClose();
  };

  const connectionLabel =
    session.status === 'active'
      ? iceState === 'connected' || iceState === 'completed'
        ? `متصل • ${formatCallDuration(elapsedSec)}`
        : iceState === 'disconnected' || iceState === 'failed'
        ? `إعادة الاتصال... ${formatCallDuration(elapsedSec)}`
        : `جاري الربط... ${formatCallDuration(elapsedSec)}`
      : session.status === 'ringing'
      ? isCaller
        ? 'جاري الاتصال...'
        : session.mode === 'video'
        ? 'مكالمة فيديو واردة...'
        : 'مكالمة صوتية واردة...'
      : session.status === 'declined'
      ? 'تم رفض المكالمة'
      : session.status === 'missed'
      ? 'مكالمة فائتة'
      : 'انتهت المكالمة';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#111923] border border-white/10 shadow-2xl overflow-hidden text-white flex flex-col">
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        {session.mode === 'video' && hasAccepted ? (
          <div className="relative h-88 bg-black flex items-center justify-center overflow-hidden">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`absolute bottom-3 end-3 w-28 h-36 rounded-2xl object-cover border-2 border-white/30 bg-slate-900 shadow-lg ${
                cameraOff ? 'opacity-30' : ''
              }`}
            />
            <div className="absolute top-3 start-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-xs text-xs font-medium flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  iceState === 'connected' || iceState === 'completed'
                    ? 'bg-emerald-400'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>{connectionLabel}</span>
            </div>
            <div className="absolute top-3 end-3 px-3 py-1 rounded-full bg-black/55 text-xs font-semibold">
              {peerName}
            </div>
          </div>
        ) : (
          <div className="px-6 py-10 flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <Avatar photoURL={peerAvatar} seed={peerId} name={peerName} size="lg" />
              {session.status === 'ringing' && (
                <span className="absolute inset-0 rounded-full border-2 border-sky-400 animate-ping opacity-50" />
              )}
            </div>
            <h3 className="text-lg font-bold">{peerName}</h3>
            <p className="text-xs text-slate-300 flex items-center gap-1.5">
              {session.status === 'active' && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    iceState === 'connected' || iceState === 'completed'
                      ? 'bg-emerald-400'
                      : 'bg-amber-400 animate-pulse'
                  }`}
                />
              )}
              <span>{connectionLabel}</span>
            </p>
          </div>
        )}

        {callError && (
          <div className="mx-5 mb-3 p-2.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-xs text-amber-100 text-center">
            {callError}
          </div>
        )}

        <div className="px-6 py-5 bg-white/5 border-t border-white/10 flex items-center justify-center gap-4">
          {!isCaller && !hasAccepted && session.status === 'ringing' ? (
            <>
              <button
                type="button"
                onClick={() => setHasAccepted(true)}
                className="px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                {session.mode === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                <span>رد</span>
              </button>
              <button
                type="button"
                onClick={() => void handleEndOrDecline()}
                className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-4 h-4" />
                <span>رفض</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleToggleMute}
                title={micMuted ? 'إلغاء كتم الميكروفون' : 'كتم الميكروفون'}
                className={`p-3.5 rounded-full transition-colors cursor-pointer ${
                  micMuted ? 'bg-amber-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
              >
                {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
              {session.mode === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={handleToggleCamera}
                    title={cameraOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
                    className={`p-3.5 rounded-full transition-colors cursor-pointer ${
                      cameraOff ? 'bg-amber-500 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                  >
                    {cameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleFlipCamera()}
                    title="تبديل الكاميرا"
                    className="p-3.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void handleEndOrDecline()}
                title="إنهاء المكالمة"
                className="p-3.5 rounded-full bg-red-600 hover:bg-red-500 text-white cursor-pointer shadow-lg"
              >
                <PhoneOff className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
