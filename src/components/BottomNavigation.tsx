import { useNavigate, useLocation } from 'react-router-dom';
import { Home, History, Bell, User } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { useVisualViewport } from '@/hooks/useVisualViewport';

interface BottomNavigationProps {
  onNotificationsClick?: () => void;
}

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
      key: 'alerts',
      label: 'Ogeysiis',
      icon: Bell,
      active: isActive('/notifications'),
      badge: unreadCount,
      onClick: handleNotificationsClick,
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: User,
      active: isActive('/profile'),
      onClick: () => navigate('/profile'),
    },
  ];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 transform-gpu"
      style={{
        backgroundColor: '#0e1b3d',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',
        contain: 'layout',
      }}
    >
      <div className="flex justify-around items-end px-2 pt-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={t.onClick}
              className="relative flex flex-col items-center justify-end gap-1 py-1 px-3 min-w-[64px]"
            >
              <span
                className="flex items-center justify-center rounded-xl transition-all"
                style={{
                  width: 44,
                  height: 32,
                  border: t.active ? '1.5px solid rgba(255,255,255,0.9)' : '1.5px solid transparent',
                  backgroundColor: t.active ? 'rgba(255,255,255,0.08)' : 'transparent',
                }}
              >
                <Icon
                  className="w-[22px] h-[22px]"
                  style={{ color: t.active ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
                  strokeWidth={t.active ? 2.4 : 2}
                />
              </span>
              <span
                className={t.active ? 'text-[11px] font-bold' : 'text-[11px] font-medium'}
                style={{ color: t.active ? '#ffffff' : 'rgba(255,255,255,0.6)' }}
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
