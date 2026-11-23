import React, { useEffect, useState } from 'react';
import { Bookmark, Megaphone, Users } from 'lucide-react';
import { ChatType } from '../types/telegram';
import { getAvatarGradient, getInitials } from '../lib/mediaUtils';

interface AvatarProps {
  name: string;
  seed: string;
  photoURL?: string;
  type?: ChatType;
  size?: '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  '2xs': 'w-4 h-4 text-[8px]',
  xs: 'w-7 h-7 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-xl',
};

export const Avatar: React.FC<AvatarProps> = ({
  name,
  seed,
  photoURL,
  type = 'direct',
  size = 'md',
  isOnline = false,
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [photoURL]);

  if (type === 'saved') {
    return (
      <div
        className={`${SIZE_CLASSES[size]} rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center shrink-0 select-none`}
      >
        <Bookmark className={size === 'xl' ? 'w-7 h-7' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      {photoURL && !imgFailed ? (
        <img
          src={photoURL}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover bg-slate-200 dark:bg-slate-700`}
        />
      ) : (
        <div
          className={`${SIZE_CLASSES[size]} rounded-full bg-gradient-to-br ${getAvatarGradient(seed)} text-white font-semibold flex items-center justify-center select-none`}
        >
          {type === 'channel' ? (
            <Megaphone className={size === 'xl' ? 'w-7 h-7' : 'w-4 h-4'} />
          ) : type === 'group' ? (
            <Users className={size === 'xl' ? 'w-7 h-7' : 'w-4 h-4'} />
          ) : (
            <span>{getInitials(name)}</span>
          )}
        </div>
      )}

      {isOnline && type === 'direct' && (
        <span
          aria-label="متصل الآن"
          className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#17212b]"
        />
      )}
    </div>
  );
};
