import React, { useState } from 'react';

interface EditableSelectProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  onAddOption: (opt: string) => void;
  placeholder?: string;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', flexDirection: 'column', gap: '4px' },
  select: { width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', background: '#fff' },
  addRow: { display: 'flex', gap: '4px' },
  addInput: { flex: 1, padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px' },
  addBtn: { padding: '6px 10px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' },
};

export default function EditableSelect({ value, options, onChange, onAddOption, placeholder }: EditableSelectProps) {
  const [newOption, setNewOption] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (e.target.value === '__add_new__') {
      setShowAdd(true);
    } else {
      onChange(e.target.value);
    }
  };

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    onAddOption(trimmed);
    onChange(trimmed);
    setNewOption('');
    setShowAdd(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') {
      setShowAdd(false);
      setNewOption('');
    }
  };

  return (
    <div style={styles.wrapper}>
      <select style={styles.select} value={value} onChange={handleSelectChange}>
        <option value="" disabled={!!value}>{placeholder ?? '-- Select --'}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
        {value && !options.includes(value) && (
          <option key={value} value={value}>{value}</option>
        )}
        <option value="__add_new__">+ Add custom option…</option>
      </select>
      {showAdd && (
        <div style={styles.addRow}>
          <input
            style={styles.addInput}
            autoFocus
            placeholder="Type new option name"
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button style={styles.addBtn} onClick={handleAdd}>Add</button>
        </div>
      )}
    </div>
  );
}
