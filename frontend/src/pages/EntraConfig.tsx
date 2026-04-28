import React, { useState, useEffect } from 'react';
import { getEntraConfig, updateEntraConfig } from '../services/api';
import { EntraConfig } from '../types';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import Input from '../components/common/Input';
import FormField from '../components/form/FormField';
import styles from './ConfigPage.module.scss';

export default function EntraConfigPage() {
  const [form, setForm] = useState<EntraConfig>({ tenantId: '', clientId: '', clientSecret: '', redirectUri: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getEntraConfig().then((res) => setForm(res.data as EntraConfig)).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      await updateEntraConfig(form);
      setMsg('Entra ID configuration saved successfully.');
    } catch {
      setErr('Failed to save configuration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fieldLabels: Record<keyof EntraConfig, string> = {
    tenantId: 'Tenant ID',
    clientId: 'Client ID',
    clientSecret: 'Client Secret',
    redirectUri: 'Redirect URI',
  };

  const fieldHints: Partial<Record<keyof EntraConfig, string>> = {
    tenantId: 'Your Azure AD tenant ID (GUID)',
    clientId: 'Application (client) ID from Azure portal',
    clientSecret: 'Leave blank to keep existing secret',
    redirectUri: 'Registered redirect URI for OIDC callback',
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Entra ID Configuration</h1>
          <p className={styles.pageSubtitle}>Configure Microsoft Entra ID (Azure AD) OIDC integration settings</p>
        </div>
      </div>

      <Card className={styles.configCard}>
        <Card.Body>
          {msg && <Alert variant="success" onClose={() => setMsg('')} className={styles.alert}>{msg}</Alert>}
          {err && <Alert variant="error" onClose={() => setErr('')} className={styles.alert}>{err}</Alert>}

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            {(Object.keys(fieldLabels) as (keyof EntraConfig)[]).map((field) => (
              <FormField
                key={field}
                label={fieldLabels[field]}
                htmlFor={field}
                hint={fieldHints[field]}
                required={field !== 'clientSecret'}
              >
                <Input
                  id={field}
                  type={field === 'clientSecret' ? 'password' : 'text'}
                  name={field}
                  value={form[field]}
                  onChange={handleChange}
                  placeholder={field === 'clientSecret' ? 'Leave blank to keep existing' : `Enter ${fieldLabels[field].toLowerCase()}`}
                  autoComplete={field === 'clientSecret' ? 'new-password' : 'off'}
                />
              </FormField>
            ))}

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
