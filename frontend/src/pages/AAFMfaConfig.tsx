import React, { useState, useEffect } from 'react';
import { getAafMfaConfig, updateAafMfaConfig } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import Input from '../components/common/Input';
import FormField from '../components/form/FormField';
import styles from './ConfigPage.module.scss';

export default function AAFMfaConfig() {
  const [authorizeEndpoint, setAuthorizeEndpoint] = useState('');
  const [tokenEndpoint, setTokenEndpoint] = useState('');
  const [userInfoEndpoint, setUserInfoEndpoint] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getAafMfaConfig().then((res) => {
      const data = res.data as {
        authorizeEndpoint: string;
        tokenEndpoint: string;
        userInfoEndpoint: string;
        clientId: string;
        clientSecret: string;
      };
      setAuthorizeEndpoint(data.authorizeEndpoint);
      setTokenEndpoint(data.tokenEndpoint);
      setUserInfoEndpoint(data.userInfoEndpoint);
      setClientId(data.clientId);
      setClientSecret(data.clientSecret);
    }).catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      await updateAafMfaConfig({ authorizeEndpoint, tokenEndpoint, userInfoEndpoint, clientId, clientSecret });
      setMsg('AAF MFA configuration saved. Step-up authentication will use these settings.');
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
          <h1 className={styles.pageTitle}>AAF MFA Configuration</h1>
          <p className={styles.pageSubtitle}>
            Configure the step-up flow — the bridge acts as an OIDC client to AAF's authorization
            server for second-factor authentication. Leave the Authorize Endpoint blank to disable
            step-up and fall back to Entra-only authentication.
          </p>
        </div>
      </div>

      <Card className={styles.configCard}>
        <Card.Body>
          {msg && <Alert variant="success" onClose={() => setMsg('')} className={styles.alert}>{msg}</Alert>}
          {err && <Alert variant="error" onClose={() => setErr('')} className={styles.alert}>{err}</Alert>}

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <FormField
              label="AAF Authorize Endpoint"
              htmlFor="aaf-mfa-authorize"
              hint="AAF's authorization endpoint URL (e.g. https://aaf.example.com/authorize). Setting this enables the step-up flow."
            >
              <Input
                id="aaf-mfa-authorize"
                type="url"
                value={authorizeEndpoint}
                onChange={(e) => setAuthorizeEndpoint(e.target.value)}
                placeholder="https://aaf.example.com/authorize"
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="AAF Token Endpoint"
              htmlFor="aaf-mfa-token"
              hint="AAF's token endpoint for exchanging the MFA authorization code. Optional — if omitted the bridge trusts the callback state alone."
            >
              <Input
                id="aaf-mfa-token"
                type="url"
                value={tokenEndpoint}
                onChange={(e) => setTokenEndpoint(e.target.value)}
                placeholder="https://aaf.example.com/token"
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="AAF UserInfo Endpoint"
              htmlFor="aaf-mfa-userinfo"
              hint="AAF's UserInfo endpoint. Optional."
            >
              <Input
                id="aaf-mfa-userinfo"
                type="url"
                value={userInfoEndpoint}
                onChange={(e) => setUserInfoEndpoint(e.target.value)}
                placeholder="https://aaf.example.com/userinfo"
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="Bridge Client ID (at AAF)"
              htmlFor="aaf-mfa-client-id"
              hint="The client_id registered for this bridge on AAF's authorization server."
            >
              <Input
                id="aaf-mfa-client-id"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="bridge-client"
                autoComplete="off"
              />
            </FormField>

            <FormField
              label="Bridge Client Secret (at AAF)"
              htmlFor="aaf-mfa-client-secret"
              hint="Leave blank to keep the existing secret."
            >
              <Input
                id="aaf-mfa-client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Leave blank to keep existing"
                autoComplete="new-password"
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
