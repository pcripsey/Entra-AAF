import React, { useState, useEffect } from 'react';
import { getAttributeMappings, updateAttributeMappings } from '../services/api';
import { AttributeMapping } from '../types';

const styles: Record<string, React.CSSProperties> = {
  h1: { fontSize: '24px', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '24px' },
  card: { background: '#fff', padding: '30px', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: '20px' },
  th: { textAlign: 'left', padding: '10px', borderBottom: '2px solid #eee', fontSize: '12px', color: '#666', textTransform: 'uppercase' },
  td: { padding: '8px', borderBottom: '1px solid #eee' },
  input: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' },
  addBtn: { padding: '8px 16px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginRight: '10px' },
  saveBtn: { padding: '8px 16px', background: '#0f3460', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  removeBtn: { padding: '4px 10px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  success: { background: '#eaffea', color: '#27ae60', padding: '10px', borderRadius: '4px', marginBottom: '16px' },
};

export default function AttributeMappingPage() {
  const [mappings, setMappings] = useState<AttributeMapping[]>([]);
  const [msg, setMsg] = useState('');

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
                <td style={styles.td}><input style={styles.input} value={m.source} onChange={(e) => updateRow(i, 'source', e.target.value)} /></td>
                <td style={styles.td}><input style={styles.input} value={m.target} onChange={(e) => updateRow(i, 'target', e.target.value)} /></td>
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
