import { useNavigate, useLocation } from 'react-router-dom';
import { Home, History, Wallet, User } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
}

const ACTIVE_BLUE = '#0066CC';

export function BottomNavigation({ onNotificationsClick }: BottomNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount, markAsSeen } = useNotifications();

  // Prevent navigation jumping on mobile viewport resize
  useVisualViewport();

  const isActive = (path: string) => location.pathname === path;

  const handleNotificationsClick = () => {
    markAsSeen();
    if (onNotificationsClick) onNotificationsClick();
    else navigate('/notifications');
  };

  // 4 tabs per spec: Hoyga, Dalabyada, Lacagta, Xisaabta
  const tabs = [
    {
      key: 'home',
      label: 'Hoyga',
      icon: Home,
      active: isActive('/providers'),
      onClick: () => navigate('/providers'),
    },
    {
      key: 'orders',
      label: 'Dalabyada',
      icon: History,
      active: isActive('/history'),
      onClick: () => navigate('/history'),
    },
    {
      key: 'wallet',
      label: 'Lacagta',
      icon: Wallet,
      active: isActive('/notifications'),
      badge: unreadCount,
      onClick: handleNotificationsClick,
    },
    {
      key: 'profile',
      label: 'Xisaabta',
      icon: User,
      active: isActive('/profile'),
      onClick: () => navigate('/profile'),
    },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 transform-gpu"
      style={{
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        contain: 'layout',
      }}
    >
      <div className="flex justify-around items-end px-2 pt-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const color = t.active ? ACTIVE_BLUE : '#94a3b8';
          return (
            <button
              key={t.key}
              onClick={t.onClick}
              className="relative flex flex-col items-center justify-end gap-1 py-1.5 px-3 min-w-[64px]"
            >
              <Icon className="w-6 h-6" style={{ color }} strokeWidth={t.active ? 2.4 : 2} />
              <span
                className="text-[11px] font-semibold"
                style={{ color }}
              >
                {t.label}
              </span>
              {t.badge && t.badge > 0 ? (
                <span className="absolute top-0 right-2 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
