import React, { useState, useEffect } from 'react';
import { getAttributeMappings, updateAttributeMappings } from '../services/api';
import { AttributeMapping } from '../types';
import EditableSelect from '../components/EditableSelect';

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

const styles: Record<string, React.CSSProperties> = {
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '24px' },
  card: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '20px' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '8px', borderBottom: '1px solid #eee' },
  addBtn: { padding: '8px 16px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' },
  saveBtn: { padding: '8px 16px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  removeBtn: { padding: '4px 10px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  success: { background: '#eaffea', color: '#27ae60', padding: '10px', borderRadius: '4px', marginBottom: '16px' },
};

export default function AttributeMappingPage() {
  const [mappings, setMappings] = useState<AttributeMapping[]>([]);
  const [msg, setMsg] = useState('');
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
    try {
      await updateAttributeMappings(mappings);
      setMsg('Attribute mappings saved.');
    } catch {
      setMsg('Failed to save.');
    }
  };

  return (
    <div>
      <h1 style={styles.h1}>Attribute Mapping</h1>
      <div style={styles.card}>
        {msg && <div style={styles.success}>{msg}</div>}
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Source (Entra Claim)</th>
              <th style={styles.th}>Target (AAF Claim)</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => (
              <tr key={i}>
                <td style={styles.td}>
                  <EditableSelect
                    value={m.source}
                    options={sourceOptions}
                    onChange={(val) => updateRow(i, 'source', val)}
                    onAddOption={addSourceOption}
                    placeholder="-- Select Entra Claim --"
                  />
                </td>
                <td style={styles.td}>
                  <EditableSelect
                    value={m.target}
                    options={targetOptions}
                    onChange={(val) => updateRow(i, 'target', val)}
                    onAddOption={addTargetOption}
                    placeholder="-- Select AAF Claim --"
                  />
                </td>
                <td style={styles.td}><button style={styles.removeBtn} onClick={() => removeRow(i)}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button style={styles.addBtn} onClick={addRow}>Add Row</button>
        <button style={styles.saveBtn} onClick={() => void handleSave()}>Save Mappings</button>
      </div>
    </div>
  );
}
