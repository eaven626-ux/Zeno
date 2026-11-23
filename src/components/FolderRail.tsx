import React from 'react';
import {
  Archive,
  Compass,
  Folder,
  Lock,
  Megaphone,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { FolderKey, PublicUser } from '../types/telegram';
import { Avatar } from './Avatar';
import { PWAInstallButton } from './PWAComponents';

interface FolderRailProps {
  currentUser: PublicUser;
  activeFolder: FolderKey;
  onSelectFolder: (folder: FolderKey) => void;
  onOpenNewChat: () => void;
  onOpenNewChannel: () => void;
  onOpenDiscover: () => void;
  onOpenAdvancedSearch?: () => void;
  onOpenSettings: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  unreadByFolder: Record<FolderKey, number>;
  passcodeEnabled?: boolean;
  onLockApp?: () => void;
}

const FOLDERS: { key: FolderKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'all', label: 'الكل', icon: MessageSquare },
  { key: 'personal', label: 'الخاصة', icon: User },
  { key: 'groups', label: 'المجموعات', icon: Users },
  { key: 'channels', label: 'القنوات', icon: Megaphone },
  { key: 'archived', label: 'الأرشيف', icon: Archive },
];

export const FolderRail: React.FC<FolderRailProps> = ({
  currentUser,
  activeFolder,
  onSelectFolder,
  onOpenNewChat,
  onOpenNewChannel,
  onOpenDiscover,
  onOpenAdvancedSearch,
  onOpenSettings,
  theme,
  onToggleTheme,
  unreadByFolder,
  passcodeEnabled = false,
  onLockApp,
}) => {
  return (
    <aside className="hidden md:flex flex-col items-center justify-between w-[72px] shrink-0 bg-slate-100/95 dark:bg-[#0e1621]/95 backdrop-blur-md border-e border-slate-200 dark:border-slate-800/80 py-3 select-none">
      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        <button
          type="button"
          onClick={onOpenSettings}
          title={currentUser.displayName}
          className="tap-press p-1 rounded-full hover:ring-2 hover:ring-sky-500/40 transition-all cursor-pointer mb-1.5"
        >
          <Avatar
            name={currentUser.displayName}
            seed={currentUser.uid}
            photoURL={currentUser.photoURL}
            size="sm"
          />
        </button>

        {FOLDERS.map(({ key, label, icon: Icon }) => {
          const isActive = activeFolder === key;
          const unread = unreadByFolder[key] || 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectFolder(key)}
              className={`tap-press relative w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer ${
                isActive
                  ? 'bg-sky-500/14 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20 shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute start-0 top-2.5 bottom-2.5 w-[3px] rounded-e-full bg-sky-500"
                />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none whitespace-nowrap">
                {label}
              </span>
              {unread > 0 && (
                <span className="absolute top-1.5 start-2 min-w-[16px] h-4 px-1 rounded-full bg-sky-500 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}

        <div className="w-8 h-px bg-slate-200 dark:bg-slate-800 my-1" />

        {onOpenAdvancedSearch && (
          <button
            type="button"
            onClick={onOpenAdvancedSearch}
            title="البحث المتقدم الشامل (Ctrl+K)"
            aria-label="البحث المتقدم الشامل"
            className="tap-press w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-600 dark:text-slate-300 hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 cursor-pointer"
          >
            <Search className="w-5 h-5" />
            <span className="text-[11px] font-medium leading-none whitespace-nowrap">بحث</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenDiscover}
          title="استكشاف القنوات والمجموعات العامة"
          className="tap-press w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
        >
          <Compass className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none whitespace-nowrap">استكشاف</span>
        </button>

        <button
          type="button"
          onClick={onOpenNewChat}
          title="محادثة أو مجموعة جديدة"
          className="tap-press w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none whitespace-nowrap">جديد</span>
        </button>

        <button
          type="button"
          onClick={onOpenNewChannel}
          title="إنشاء قناة جديدة"
          className="tap-press w-full py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 cursor-pointer"
        >
          <Megaphone className="w-5 h-5" />
          <span className="text-[11px] font-medium leading-none whitespace-nowrap">قناة جديدة</span>
        </button>
      </div>

      <div className="flex flex-col items-center gap-1.5 w-full px-1.5">
        <PWAInstallButton variant="rail" />
        {passcodeEnabled && onLockApp && (
          <button
            type="button"
            onClick={onLockApp}
            title="قفل التطبيق الآن"
            className="tap-press w-11 h-11 rounded-xl flex items-center justify-center text-sky-600 dark:text-sky-400 hover:bg-sky-500/12 cursor-pointer"
          >
            <Lock className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
          className="tap-press w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="الإعدادات والملف الشخصي"
          className="tap-press w-11 h-11 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800/60 cursor-pointer"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};

export { Folder };
