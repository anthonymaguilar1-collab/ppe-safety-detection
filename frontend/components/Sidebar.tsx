'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiGet, type ModelStatus } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import BrandLogo from '@/components/BrandLogo';

const NAV = [
  { href: '/', label: 'Dashboard', icon: '📊' },
  { href: '/detect', label: 'Estudio de Detección', icon: '🔍' },
  { href: '/incidents', label: 'Gestión de Incidentes', icon: '🚨' },
  { href: '/alerts', label: 'Centro de Alertas', icon: '🔔' },
  { href: '/reports', label: 'Métricas y Reportes', icon: '📋' },
  { href: '/config', label: 'Configuración Modelo', icon: '⚙️' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [unread, setUnread] = useState(0);

  // Auto-close drawer on route change
  useEffect(() => {
    if (onClose) onClose();
  }, [path, onClose]);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    const load = async () => {
      try {
        const m = await apiGet<ModelStatus>('/model/status');
        setModel(m);
        const a = await apiGet<{ unread: number }>('/alerts?unread_only=true');
        setUnread(a.unread ?? 0);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div style={{ flexShrink: 0 }}>
            <BrandLogo size={32} />
          </div>
          <div className="logo-text">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h1>SafetyVision</h1>
              <span className="pro-badge">PRO</span>
            </div>
            <span>HSE Vision Intelligence</span>
          </div>
          {/* Close button on mobile */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Módulos del Sistema</div>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${path === item.href ? 'active' : ''}`}
              onClick={onClose}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span className="nav-item-text">{item.label}</span>
              {item.href === '/alerts' && unread > 0 && (
                <span className="nav-badge">{unread}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator">
            <div className={`status-dot ${model?.model_loaded ? 'online' : 'offline'}`} />
            <div className="status-text">
              <strong>{model?.model_loaded ? 'YOLO26n Activo' : 'Sin Modelo'}</strong>
              <span
                style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: model?.model_loaded ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  marginTop: 2,
                }}
              >
                {model?.current_model ?? 'Ninguno cargado'}
              </span>
            </div>
          </div>

          {user && (
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                  SESIÓN SUPABASE
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={user.email ?? ''}
                >
                  {user.email}
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  if (onClose) onClose();
                }}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--text-muted)',
                  padding: '2px 4px',
                }}
              >
                🚪
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
