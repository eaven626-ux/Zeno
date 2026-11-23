import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, tsToMillis } from './firebase';
import { CallMode, CallSession, CallStatus, PublicUser } from '../types/telegram';

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

function makeCallId(): string {
  return `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeCandidateId(): string {
  return `ice_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function mapCallDoc(data: Record<string, unknown>, id: string): CallSession {
  return {
    id: String(data.id || id),
    chatId: String(data.chatId || ''),
    callerId: String(data.callerId || ''),
    callerName: String(data.callerName || 'مستخدم ZENO'),
    callerPhotoURL: typeof data.callerPhotoURL === 'string' ? data.callerPhotoURL : undefined,
    calleeId: String(data.calleeId || ''),
    calleeName: String(data.calleeName || 'مستخدم ZENO'),
    mode: data.mode === 'video' ? 'video' : 'audio',
    status: (['ringing', 'active', 'ended', 'declined', 'missed'].includes(String(data.status))
      ? String(data.status)
      : 'ended') as CallStatus,
    offerSdp: typeof data.offerSdp === 'string' ? data.offerSdp : undefined,
    answerSdp: typeof data.answerSdp === 'string' ? data.answerSdp : undefined,
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export async function createCallOffer(params: {
  chatId: string;
  caller: PublicUser;
  callee: PublicUser;
  mode: CallMode;
  offer?: RTCSessionDescriptionInit;
}): Promise<string> {
  const callId = makeCallId();
  const path = `calls/${callId}`;
  try {
    const callerName = params.caller.displayName.trim().slice(0, 80) || 'مستخدم ZENO';
    const calleeName = params.callee.displayName.trim().slice(0, 80) || 'مستخدم ZENO';
    const payload: Record<string, unknown> = {
      id: callId,
      chatId: params.chatId,
      callerId: params.caller.uid,
      callerName,
      calleeId: params.callee.uid,
      calleeName,
      mode: params.mode,
      status: 'ringing',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.offer) {
      payload.offerSdp = JSON.stringify(params.offer);
    }
    if (params.caller.photoURL && params.caller.photoURL.length <= 150000) {
      payload.callerPhotoURL = params.caller.photoURL;
    }
    await setDoc(doc(db, 'calls', callId), payload);
    return callId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function setCallOfferSdp(
  callId: string,
  offer: RTCSessionDescriptionInit
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      offerSdp: JSON.stringify(offer).slice(0, 50000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function answerCallSession(
  callId: string,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status: 'active',
      answerSdp: JSON.stringify(answer).slice(0, 50000),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus
): Promise<void> {
  const path = `calls/${callId}`;
  try {
    await updateDoc(doc(db, 'calls', callId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore if call already ended/cleaned up
  }
}

export async function pushCallCandidate(params: {
  callId: string;
  callerId: string;
  calleeId: string;
  senderId: string;
  role: 'caller' | 'callee';
  candidate: RTCIceCandidate;
}): Promise<void> {
  const subcol = params.role === 'caller' ? 'callerCandidates' : 'calleeCandidates';
  const candId = makeCandidateId();
  try {
    const payload: Record<string, unknown> = {
      id: candId,
      callId: params.callId,
      callerId: params.callerId,
      calleeId: params.calleeId,
      senderId: params.senderId,
      candidate: params.candidate.candidate.slice(0, 2000),
      createdAt: serverTimestamp(),
    };
    if (typeof params.candidate.sdpMid === 'string' && params.candidate.sdpMid.length <= 64) {
      payload.sdpMid = params.candidate.sdpMid;
    }
    if (
      typeof params.candidate.sdpMLineIndex === 'number' &&
      params.candidate.sdpMLineIndex >= 0 &&
      params.candidate.sdpMLineIndex <= 32
    ) {
      payload.sdpMLineIndex = params.candidate.sdpMLineIndex;
    }
    await setDoc(doc(db, 'calls', params.callId, subcol, candId), payload);
  } catch {
    // Non-fatal ICE candidate push failure
  }
}

export function subscribeCallSession(
  callId: string,
  onUpdate: (session: CallSession | null) => void,
  onError?: (err: unknown) => void
): () => void {
  return onSnapshot(
    doc(db, 'calls', callId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(mapCallDoc(snap.data(), snap.id));
    },
    (err) => {
      onError?.(err);
    }
  );
}

export function subscribeCallCandidates(
  callId: string,
  role: 'caller' | 'callee',
  onCandidate: (cand: RTCIceCandidateInit) => void
): () => void {
  const subcol = role === 'caller' ? 'callerCandidates' : 'calleeCandidates';
  const seen = new Set<string>();
  return onSnapshot(collection(db, 'calls', callId, subcol), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added' || seen.has(change.doc.id)) return;
      seen.add(change.doc.id);
      const d = change.doc.data();
      if (typeof d.candidate === 'string') {
        onCandidate({
          candidate: d.candidate,
          sdpMid: typeof d.sdpMid === 'string' ? d.sdpMid : undefined,
          sdpMLineIndex: typeof d.sdpMLineIndex === 'number' ? d.sdpMLineIndex : undefined,
        });
      }
    });
  });
}

export async function cleanupOldCallCandidates(callId: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const [callerSnap, calleeSnap] = await Promise.all([
      getDocs(collection(db, 'calls', callId, 'callerCandidates')),
      getDocs(collection(db, 'calls', callId, 'calleeCandidates')),
    ]);
    callerSnap.docs.forEach((d) => batch.delete(d.ref));
    calleeSnap.docs.forEach((d) => batch.delete(d.ref));
    if (!callerSnap.empty || !calleeSnap.empty) {
      await batch.commit();
    }
  } catch {
    // Ignore cleanup errors
  }
}
