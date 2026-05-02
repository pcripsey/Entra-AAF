import React, { useState, useEffect } from 'react';
import { getOidcDiscoveryConfig, updateOidcDiscoveryConfig } from '../services/api';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import styles from './ConfigPage.module.scss';

const ALL_SCOPES = ['openid', 'profile', 'email'];
const REQUIRED_SCOPES = ['openid'];
const ALL_CLAIMS = ['sub', 'iss', 'aud', 'exp', 'iat', 'name', 'email', 'upn', 'amr', 'acr', 'aal', 'auth_time'];
const REQUIRED_CLAIMS = ['sub', 'iss', 'aud', 'exp', 'iat'];

export default function OidcDiscoveryConfig() {
  const [scopesSupported, setScopesSupported] = useState<string[]>([]);
  const [claimsSupported, setClaimsSupported] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getOidcDiscoveryConfig().then((res) => {
      const data = res.data as { scopesSupported: string[]; claimsSupported: string[] };
      setScopesSupported(data.scopesSupported);
      setClaimsSupported(data.claimsSupported);
    }).catch(console.error);
  }, []);

  const toggleScope = (scope: string) => {
    if (REQUIRED_SCOPES.includes(scope)) return;
    setScopesSupported((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const toggleClaim = (claim: string) => {
    if (REQUIRED_CLAIMS.includes(claim)) return;
    setClaimsSupported((prev) =>
      prev.includes(claim) ? prev.filter((c) => c !== claim) : [...prev, claim]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(''); setErr('');
    setLoading(true);
    try {
      await updateOidcDiscoveryConfig({ scopesSupported, claimsSupported });
      setMsg('OIDC discovery configuration saved successfully.');
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
          <h1 className={styles.pageTitle}>OIDC Discovery Config</h1>
          <p className={styles.pageSubtitle}>
            Configure scopes and claims advertised in the OIDC discovery document
          </p>
        </div>
      </div>

      <Card className={styles.configCard}>
        <Card.Body>
          {msg && <Alert variant="success" onClose={() => setMsg('')} className={styles.alert}>{msg}</Alert>}
          {err && <Alert variant="error" onClose={() => setErr('')} className={styles.alert}>{err}</Alert>}

          <form onSubmit={(e) => { void handleSubmit(e); }} noValidate>
            <div className={styles.formGroup}>
              <label className={styles.groupLabel}>Scopes Supported</label>
              <p className={styles.groupHint}>
                The OAuth 2.0 / OIDC scopes advertised in the{' '}
                <code>scopes_supported</code> field of the discovery document.{' '}
                <code>openid</code> is required by the OIDC specification and cannot be removed.
              </p>
              <div className={styles.checkboxGroup}>
                {ALL_SCOPES.map((scope) => {
                  const required = REQUIRED_SCOPES.includes(scope);
                  const checked = scopesSupported.includes(scope);
                  return (
                    <label key={scope} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={required}
                        onChange={() => toggleScope(scope)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkboxText}>
                        {scope}
                        {required && <span className={styles.requiredBadge}> (required)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.groupLabel}>Claims Supported</label>
              <p className={styles.groupHint}>
                The claims advertised in the <code>claims_supported</code> field of the discovery
                document. Core JWT claims (<code>sub</code>, <code>iss</code>, <code>aud</code>,{' '}
                <code>exp</code>, <code>iat</code>) are required and cannot be removed.
              </p>
              <div className={styles.checkboxGroup}>
                {ALL_CLAIMS.map((claim) => {
                  const required = REQUIRED_CLAIMS.includes(claim);
                  const checked = claimsSupported.includes(claim);
                  return (
                    <label key={claim} className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={required}
                        onChange={() => toggleClaim(claim)}
                        className={styles.checkbox}
                      />
                      <span className={styles.checkboxText}>
                        {claim}
                        {required && <span className={styles.requiredBadge}> (required)</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

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
