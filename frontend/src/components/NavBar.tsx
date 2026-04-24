import React from 'react';

const navStyle: React.CSSProperties = {
  background: '#0f3460',
  color: '#fff',
  padding: '12px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

export default function NavBar() {
  const username = localStorage.getItem('username') || 'Admin';
  return (
    <div style={navStyle}>
      <span style={{ fontWeight: 'bold' }}>Entra-AAF Bridge</span>
      <span>Welcome, {username}</span>
    </div>
  );
}
