import React, { useState, useEffect } from 'react';
import { getAafConfig, updateAafConfig } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import Input from '../components/common/Input';
import Textarea from '../components/form/Textarea';
import FormField from '../components/form/FormField';
import styles from './ConfigPage.module.scss';

export default function AAFConfig() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAafConfig().then((res) => {
      const data = res.data as { clientId: string; clientSecret: string; redirectUris: string[] };
      setClientId(data.clientId);
      setClientSecret(data.clientSecret);
      setRedirectUris(data.redirectUris.join('\n'));
    }).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      await updateAafConfig({ clientId, clientSecret, redirectUris: redirectUris.split('\n').map((u) => u.trim()).filter(Boolean) });
      setMsg('AAF configuration saved successfully.');
    } catch {
      setErr('Failed to save configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>AAF Configuration</h1>
          <p className={styles.pageSubtitle}>Configure OpenText Advanced Authentication Framework OIDC client settings</p>
        </div>
      </div>

      <Card className={styles.configCard}>
        <Card.Body>
          {msg && <Alert variant="success" onClose={() => setMsg('')} className={styles.alert}>{msg}</Alert>}
          {err && <Alert variant="error" onClose={() => setErr('')} className={styles.alert}>{err}</Alert>}

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <FormField
              label="Client ID"
              htmlFor="aaf-client-id"
              required
              hint="OIDC client identifier registered in AAF"
            >
              <Input
                id="aaf-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Enter AAF client ID"
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="Client Secret"
              htmlFor="aaf-client-secret"
              hint="Leave blank to keep the existing secret"
            >
              <Input
                id="aaf-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave blank to keep existing"
                autoComplete="new-password"
              />
            </FormField>

            <FormField
              label="Redirect URIs"
              htmlFor="aaf-redirect-uris"
              hint="One URI per line. These must be registered in AAF."
            >
              <Textarea
                id="aaf-redirect-uris"
                value={redirectUris}
                onChange={(e) => setRedirectUris(e.target.value)}
                placeholder={`https://example.com/callback\nhttps://example.com/silent-callback`}
                rows={5}
              />
            </FormField>

            <div className={styles.formActions}>
              <Button type="submit" variant="primary" loading={loading}>
                Save Configuration
              </Button>
            </div>
          </form>
        </Card.Body>
      </Card>
    </div>
  );
}
