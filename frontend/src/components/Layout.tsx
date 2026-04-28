import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/api';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/config/entra', label: 'Entra ID Config' },
  { path: '/config/aaf', label: 'AAF Config' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/attribute-mapping', label: 'Attribute Mapping' },
  { path: '/audit-logs', label: 'User Access Log' },
];

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', minHeight: '100vh' },
  sidebar: { width: '240px', background: '#1a1a2e', color: '#fff', display: 'flex', flexDirection: 'column' },
  sidebarTitle: { padding: '20px', fontSize: '18px', fontWeight: 'bold', borderBottom: '1px solid #333' },
  nav: { flex: 1, padding: '10px 0' },
  navLink: { display: 'block', padding: '12px 20px', color: '#ccc', textDecoration: 'none' },
  navLinkActive: { background: '#16213e', color: '#fff', borderLeft: '3px solid #0f3460' },
  logoutBtn: { margin: '20px', padding: '10px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  main: { flex: 1, padding: '30px', overflow: 'auto' },
};

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('username');
    navigate('/login');
  };

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarTitle}>Entra-AAF Bridge</div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{ ...styles.navLink, ...(location.pathname === item.path ? styles.navLinkActive : {}) }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button style={styles.logoutBtn} onClick={() => { void handleLogout(); }}>Logout</button>
      </div>
      <main style={styles.main}>{children}</main>
    </div>
  );
}
