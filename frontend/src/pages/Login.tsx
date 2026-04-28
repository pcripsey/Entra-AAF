import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../services/api';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Alert from '../components/common/Alert';
import FormField from '../components/form/FormField';
import styles from './Login.module.scss';

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
      setError('Invalid username or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon} aria-hidden="true">E</div>
          <h1 className={styles.title}>Entra-AAF Bridge</h1>
          <p className={styles.subtitle}>Admin Console — Sign in to continue</p>
        </div>

        {error && (
          <Alert variant="error" onClose={() => setError('')} className={styles.alert}>
            {error}
          </Alert>
        )}

        <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
          <FormField label="Username" htmlFor="username" required>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoFocus
              placeholder="Enter your username"
              aria-label="Username"
            />
          </FormField>

          <FormField label="Password" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-label="Password"
            />
          </FormField>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            className={styles.submitBtn}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>

        <div className={styles.footer}>
          <span className={styles.footerText}>OpenText Advanced Authentication Framework</span>
        </div>
      </div>
    </div>
  );
}
