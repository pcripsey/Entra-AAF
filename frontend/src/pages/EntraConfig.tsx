import React, { useState, useEffect } from 'react';
import { getEntraConfig, updateEntraConfig } from '../services/api';
import { EntraConfig } from '../types';

const styles: Record<string, React.CSSProperties> = {
  card: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', maxWidth: '600px' },
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '24px' },
  formGroup: { marginBottom: '20px' },
  label: { display: 'block', marginBottom: '4px', fontWeight: '500', color: '#333' },
  input: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' },
  button: { padding: '10px 24px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' },
  success: { background: '#eaffea', color: '#27ae60', padding: '10px', borderRadius: '4px', marginBottom: '16px' },
  error: { background: '#fee', color: '#c0392b', padding: '10px', borderRadius: '4px', marginBottom: '16px' },
};

export default function EntraConfigPage() {
  const [form, setForm] = useState<EntraConfig>({ tenantId: '', clientId: '', clientSecret: '', redirectUri: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    getEntraConfig().then((res) => setForm(res.data as EntraConfig)).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    try {
      await updateEntraConfig(form);
      setMsg('Configuration saved successfully.');
    } catch {
      setErr('Failed to save configuration.');
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>Entra ID Configuration</h1>
      <div style={styles.card}>
        {msg && <div style={styles.success}>{msg}</div>}
        {err && <div style={styles.error}>{err}</div>}
        <form onSubmit={(e) => { void handleSubmit(e); }}>
          {(['tenantId', 'clientId', 'clientSecret', 'redirectUri'] as (keyof EntraConfig)[]).map((field) => (
            <div key={field} style={styles.formGroup}>
              <label style={styles.label}>{field.replace(/([A-Z])/g, ' $1').trim()}</label>
              <input
                style={styles.input}
                type={field === 'clientSecret' ? 'password' : 'text'}
                name={field}
                value={form[field]}
                onChange={handleChange}
                placeholder={field === 'clientSecret' && form[field] === '***' ? 'Leave blank to keep existing' : ''}
              />
            </div>
          ))}
          <button style={styles.button} type="submit">Save Configuration</button>
        </form>
      </div>
    </div>
  );
}
