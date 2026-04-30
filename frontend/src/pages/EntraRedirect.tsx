import React, { useEffect, useState } from 'react';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Alert from '../components/common/Alert';
import styles from './Login.module.scss';

export default function EntraRedirect() {
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Processing Entra authentication…');

  useEffect(() => {
    void processEntraRedirect();
  }, []);

  async function processEntraRedirect() {
    try {
      // Parse the URL hash fragment for tokens delivered via OIDC implicit flow
      // e.g. /entra-redirect#id_token=...&state=...
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);

      // Also check query params for code/state (authorization code flow)
      const queryParams = new URLSearchParams(window.location.search);

      const error = hashParams.get('error') || queryParams.get('error');
      const errorDescription =
        hashParams.get('error_description') || queryParams.get('error_description');

      if (error) {
        setError(`Authentication error: ${errorDescription || error}`);
        return;
      }

      const idToken = hashParams.get('id_token');
      const state = hashParams.get('state') || queryParams.get('state') || undefined;

      if (!idToken) {
        setError('No authentication token received from Entra ID. Please try again.');
        return;
      }

      setStatus('Enriching claims and redirecting to AAF…');

      const response = await fetch('/entra-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: idToken,
          ...(state ? { aaf_state: state } : {}),
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as {
          error_description?: string;
          error?: string;
        };
        setError(
          data.error_description || data.error || 'Failed to process authentication.'
        );
        return;
      }

      const data = (await response.json()) as { redirect_url?: string };

      if (!data.redirect_url) {
        setError('Invalid response from bridge server.');
        return;
      }

      window.location.href = data.redirect_url;
    } catch (err) {
      console.error('EntraRedirect: unexpected error during authentication processing', err);
      setError('An unexpected error occurred while processing your authentication.');
    }
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.logoIcon} aria-hidden="true">E</div>
            <h1 className={styles.title}>Entra-AAF Bridge</h1>
          </div>
          <Alert variant="error">{error}</Alert>
          <div className={styles.footer}>
            <span className={styles.footerText}>OpenText Advanced Authentication Framework</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logoIcon} aria-hidden="true">E</div>
          <h1 className={styles.title}>Entra-AAF Bridge</h1>
          <p className={styles.subtitle}>{status}</p>
        </div>
        <LoadingSpinner size="lg" label={status} />
        <div className={styles.footer}>
          <span className={styles.footerText}>OpenText Advanced Authentication Framework</span>
        </div>
      </div>
    </div>
  );
}
