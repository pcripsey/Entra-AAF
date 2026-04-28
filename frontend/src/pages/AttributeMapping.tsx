import React, { useState, useEffect } from 'react';
import { getAttributeMappings, updateAttributeMappings } from '../services/api';
import { AttributeMapping } from '../types';
import EditableSelect from '../components/EditableSelect';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Alert from '../components/common/Alert';
import styles from './AttributeMapping.module.scss';

// Common Microsoft Entra ID / OIDC source claims
const DEFAULT_SOURCE_OPTIONS = [
  'sub', 'oid', 'name', 'given_name', 'family_name', 'email',
  'preferred_username', 'upn', 'unique_name', 'groups', 'roles',
  'tid', 'iss', 'aud', 'exp', 'iat', 'nbf',
];

// Common AAF / OIDC target claims
const DEFAULT_TARGET_OPTIONS = [
  'sub', 'name', 'given_name', 'family_name', 'email',
  'preferred_username', 'phone_number', 'address', 'locale',
  'zoneinfo', 'updated_at', 'profile', 'picture', 'website',
  'groups', 'roles',
];

export default function AttributeMappingPage() {
  const [mappings, setMappings] = useState<AttributeMapping[]>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<string[]>(DEFAULT_SOURCE_OPTIONS);
  const [targetOptions, setTargetOptions] = useState<string[]>(DEFAULT_TARGET_OPTIONS);

  useEffect(() => {
    getAttributeMappings().then((res) => setMappings(res.data as AttributeMapping[])).catch(console.error);
  }, []);

  const addRow = () => setMappings([...mappings, { source: '', target: '' }]);

  const updateRow = (i: number, field: keyof AttributeMapping, val: string) => {
    const updated = [...mappings];
    updated[i] = { ...updated[i], [field]: val };
    setMappings(updated);
  };

  const removeRow = (i: number) => setMappings(mappings.filter((_, idx) => idx !== i));

  const addSourceOption = (opt: string) => {
    if (!sourceOptions.includes(opt)) setSourceOptions([...sourceOptions, opt]);
  };

  const addTargetOption = (opt: string) => {
    if (!targetOptions.includes(opt)) setTargetOptions([...targetOptions, opt]);
  };

  const handleSave = async () => {
    setMsg(''); setErr('');
    setLoading(true);
    try {
      await updateAttributeMappings(mappings);
      setMsg('Attribute mappings saved successfully.');
    } catch {
      setErr('Failed to save mappings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Attribute Mapping</h1>
          <p className={styles.pageSubtitle}>Map Entra ID claims to AAF target claims for OIDC token transformation</p>
        </div>
        <Button
          variant="success"
          onClick={addRow}
          leftIcon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
        >
          Add Mapping
        </Button>
      </div>

      <Card>
        <Card.Body>
          {msg && <Alert variant="success" onClose={() => setMsg('')} className={styles.alert}>{msg}</Alert>}
          {err && <Alert variant="error" onClose={() => setErr('')} className={styles.alert}>{err}</Alert>}

          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>Source Claim (Entra ID)</th>
                  <th className={styles.th}>→</th>
                  <th className={styles.th}>Target Claim (AAF)</th>
                  <th className={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyCell}>
                      No mappings defined. Click "Add Mapping" to get started.
                    </td>
                  </tr>
                ) : mappings.map((m, i) => (
                  <tr key={i} className={styles.tr}>
                    <td className={styles.td}>
                      <EditableSelect
                        value={m.source}
                        options={sourceOptions}
                        onChange={(val) => updateRow(i, 'source', val)}
                        onAddOption={addSourceOption}
                        placeholder="-- Select Entra Claim --"
                      />
                    </td>
                    <td className={styles.tdArrow}>→</td>
                    <td className={styles.td}>
                      <EditableSelect
                        value={m.target}
                        options={targetOptions}
                        onChange={(val) => updateRow(i, 'target', val)}
                        onAddOption={addTargetOption}
                        placeholder="-- Select AAF Claim --"
                      />
                    </td>
                    <td className={styles.tdAction}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeRow(i)}
                        aria-label={`Remove mapping ${i + 1}`}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Body>
        <Card.Footer>
          <Button variant="primary" onClick={() => void handleSave()} loading={loading}>
            Save Mappings
          </Button>
          <Button variant="secondary" onClick={addRow}>
            Add Row
          </Button>
        </Card.Footer>
      </Card>
    </div>
  );
}
