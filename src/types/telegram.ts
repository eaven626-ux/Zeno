export type ChatType = 'saved' | 'direct' | 'group' | 'channel';
export type FolderKey = 'all' | 'personal' | 'groups' | 'channels' | 'archived';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MessageType = 'text' | 'image' | 'audio' | 'file' | 'poll' | 'sticker' | 'system';
export type StickerAnimation = 'none' | 'bounce' | 'pulse' | 'float' | 'wiggle' | 'spin' | 'heartbeat';

export interface PublicUser {
  uid: string;
  displayName: string;
  username: string;
  photoURL?: string;
  bio?: string;
  isDiscoverable: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface PrivateUser {
  uid: string;
  email: string;
  theme: 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large';
  notificationsEnabled: boolean;
  phoneNumber?: string;
  whatsappEnabled?: boolean;
  phoneDiscoverable?: boolean;
  updatedAt: number;
}

export interface Chat {
  id: string;
  type: ChatType;
  title: string;
  description?: string;
  photoURL?: string;
  isPublic: boolean;
  username?: string;
  ownerId: string;
  directKey?: string;
  memberCount: number;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  lastMessageText?: string;
  lastMessageSenderId?: string;
  lastMessageSenderName?: string;
  lastMessageAt?: number;
  autoDeleteSeconds?: number;
  inviteCode?: string;
  slowModeSeconds?: number;
  protectContent?: boolean;
  allowComments?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMember {
  uid: string;
  chatId: string;
  role: MemberRole;
  displayName: string;
  username?: string;
  photoURL?: string;
  typingAt?: number;
  lastReadAt?: number;
  joinedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  type: MessageType;
  text: string;
  mediaDataUrl?: string;
  mediaUrl?: string;
  mediaChunkCount?: number;
  mediaDurationSec?: number;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  replyToId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  forwardedFromName?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  editedAt?: number;
  ttlSeconds?: number;
  stickerId?: string;
  stickerPackId?: string;
  stickerAnim?: StickerAnimation;
  isPinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  isDeleted: boolean;
  createdAt: number;
}

export interface LightboxImageItem {
  src: string;
  caption?: string;
}

export interface LightboxState {
  images: LightboxImageItem[];
  index: number;
}

export type ReadReceiptState = 'sending' | 'sent' | 'partial' | 'all' | 'saved';

export interface MessageReadReceiptInfo {
  state: ReadReceiptState;
  readBy: ChatMember[];
  unreadBy: ChatMember[];
  totalRecipients: number;
  latestReadAt?: number;
}

export interface MessageReaction {
  id: string;
  chatId: string;
  messageId: string;
  uid: string;
  emoji: string;
  createdAt: number;
}

export interface PollVote {
  id: string;
  chatId: string;
  messageId: string;
  uid: string;
  optionIndex: number;
  createdAt: number;
}

export interface UserChatItem {
  chatId: string;
  userId: string;
  type: ChatType;
  title: string;
  photoURL?: string;
  folder: FolderKey;
  pinned: boolean;
  muted: boolean;
  peerUserId?: string;
  createdBy: string;
  lastReadAt?: number;
  joinedAt: number;
}

export interface UserBlock {
  id: string;
  blockerUid: string;
  blockedUid: string;
  createdAt: number;
}

export interface StickerPack {
  id: string;
  ownerId: string;
  title: string;
  coverDataUrl?: string;
  stickerCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface CustomSticker {
  id: string;
  packId: string;
  ownerId: string;
  label: string;
  mediaDataUrl: string;
  mimeType: string;
  animation: StickerAnimation;
  createdAt: number;
}

export interface ScheduledMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  type: MessageType;
  text: string;
  mediaDataUrl?: string;
  fileMimeType?: string;
  replyToId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  stickerId?: string;
  stickerPackId?: string;
  stickerAnim?: StickerAnimation;
  scheduledFor: number;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: number;
}

export interface InviteLink {
  code: string;
  chatId: string;
  title: string;
  type: 'group' | 'channel';
  photoURL?: string;
  memberCount: number;
  createdBy: string;
  createdAt: number;
}

export interface ChannelComment {
  id: string;
  chatId: string;
  messageId: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  text: string;
  createdAt: number;
}

export interface Story {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerPhotoURL?: string;
  type: 'text' | 'image' | 'video';
  text: string;
  mediaDataUrl?: string;
  mediaUrl?: string;
  fileMimeType?: string;
  mediaDurationSec?: number;
  mediaChunkCount?: number;
  thumbnailDataUrl?: string;
  bgColor?: string;
  isActive: boolean;
  expiresAt: number;
  createdAt: number;
}

export interface StoryView {
  uid: string;
  storyId: string;
  storyOwnerId: string;
  viewerName: string;
  viewerPhotoURL?: string;
  viewedAt: number;
}

export type CallMode = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'declined' | 'missed';

export interface CallSession {
  id: string;
  chatId: string;
  callerId: string;
  callerName: string;
  callerPhotoURL?: string;
  calleeId: string;
  calleeName: string;
  mode: CallMode;
  status: CallStatus;
  offerSdp?: string;
  answerSdp?: string;
  createdAt: number;
  updatedAt: number;
}

