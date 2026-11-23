import React, { useState } from 'react';
import { Loader2, MessageSquare, Send, Trash2, X } from 'lucide-react';
import { ChannelComment, Message, PublicUser } from '../types/telegram';
import { Avatar } from './Avatar';

interface ChannelCommentsModalProps {
  message: Message;
  comments: ChannelComment[];
  currentUser: PublicUser;
  canModerate: boolean;
  allowComments: boolean;
  onAddComment: (text: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onClose: () => void;
}

function formatCommentTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString('ar-IQ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const ChannelCommentsModal: React.FC<ChannelCommentsModalProps> = ({
  message,
  comments,
  currentUser,
  canModerate,
  allowComments,
  onAddComment,
  onDeleteComment,
  onClose,
}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending || !allowComments) return;
    setSending(true);
    try {
      await onAddComment(trimmed);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[82vh] bg-white dark:bg-[#17212b] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4.5 h-4.5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              التعليقات ({comments.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="px-5 py-3 bg-slate-50 dark:bg-[#131c26] border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 shrink-0">
          {message.text || message.pollQuestion || message.fileName || 'منشور القناة'}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {comments.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              لا توجد تعليقات حتى الآن. كن أول من يعلّق!
            </div>
          ) : (
            comments.map((c) => {
              const canDel = canModerate || c.authorId === currentUser.uid;
              return (
                <div key={c.id} className="flex items-start gap-2.5 group">
                  <Avatar photoURL={c.authorPhotoURL} seed={c.authorId} name={c.authorName} size="sm" />
                  <div className="flex-1 min-w-0 rounded-2xl bg-slate-100 dark:bg-[#242f3d] px-3.5 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {c.authorName}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400">
                          {formatCommentTime(c.createdAt)}
                        </span>
                        {canDel && (
                          <button
                            type="button"
                            onClick={() => void onDeleteComment(c.id)}
                            title="حذف التعليق"
                            className="p-0.5 text-slate-400 hover:text-red-500 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words leading-relaxed">
                      {c.text}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {allowComments ? (
          <form
            onSubmit={handleSubmit}
            className="p-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1000}
              placeholder="اكتب تعليقاً..."
              className="flex-1 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-[#242f3d] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
            <button
              type="submit"
              disabled={!text.trim() || sending}
              className="h-10 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>إرسال</span>
            </button>
          </form>
        ) : (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 shrink-0">
            التعليقات مغلقة في هذه القناة من قِبل الإدارة.
          </div>
        )}
      </div>
    </div>
  );
};
