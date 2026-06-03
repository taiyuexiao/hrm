/**
 * 协作光标 - 模拟多用户在线编辑
 * 显示浮动光标，带用户名标签和闪烁动画
 */
import React, { useEffect, useState, useRef } from 'react';
import { User } from './types';

interface Cursor {
  user: User;
  x: number;
  y: number;
  visible: boolean;
  blink: boolean;
}

interface CollabCursorsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  users: User[]; // 要显示光标的用户（排除当前用户）
  currentUserId: string;
}

export const CollabCursors: React.FC<CollabCursorsProps> = ({ users, currentUserId }) => {
  const [cursors, setCursors] = useState<Cursor[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const otherUsers = users.filter(u => u.id !== currentUserId);
    const initial: Cursor[] = otherUsers.map(u => ({
      user: u,
      x: 100 + Math.random() * 400,
      y: 200 + Math.random() * 300,
      visible: true,
      blink: true,
    }));
    setCursors(initial);

    // 定期更新光标位置（模拟正在编辑）
    intervalRef.current = setInterval(() => {
      setCursors(prev =>
        prev.map(c => {
          const newX = c.x + (Math.random() - 0.5) * 60;
          const newY = c.y + (Math.random() - 0.5) * 30;
          return {
            ...c,
            x: Math.max(20, Math.min(700, newX)),
            y: Math.max(100, Math.min(600, newY)),
            blink: !c.blink,
            visible: Math.random() > 0.05, // 偶尔隐藏模拟用户离开编辑区域
          };
        })
      );
    }, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [users, currentUserId]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      {cursors.map(c => (
        <div
          key={c.user.id}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            opacity: c.visible ? 1 : 0,
            transition: 'all 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
        >
          {/* 光标箭头 */}
          <svg width="18" height="22" viewBox="0 0 18 22" style={{ display: 'block' }}>
            <path
              d="M0 0L14 10L8 12L5 19L0 0Z"
              fill={c.user.color}
              stroke="#fff"
              strokeWidth="1.5"
            />
          </svg>
          {/* 用户名标签 */}
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: 10,
              background: c.user.color,
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {c.user.name}
            {c.blink && (
              <span
                style={{
                  display: 'inline-block',
                  width: 2,
                  height: 12,
                  background: '#fff',
                  marginLeft: 4,
                  verticalAlign: 'middle',
                  animation: 'cursorBlink 0.8s infinite',
                }}
              />
            )}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default CollabCursors;
