import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' },
  card: { background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', width: '360px' },
  title: { fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center', color: '#1a1a2e' },
  subtitle: { textAlign: 'center', color: '#666', marginBottom: '24px', fontSize: '14px' },
  label: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#333' },
  input: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', marginBottom: '16px' },
  button: { width: '100%', padding: '12px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer' },
  error: { background: '#fee', color: '#c0392b', padding: '10px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' },
};

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(username, password);
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('username', (res.data as { username: string }).username);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.title}>Entra-AAF Bridge</div>
        <div style={styles.subtitle}>Admin Console</div>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          <label style={styles.label}>Username</label>
          <input style={styles.input} type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <label style={styles.label}>Password</label>
          <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
