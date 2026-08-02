import React from 'react';
import { Trash2, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ImportPreviewTable({ rows, onRemoveRow }) {
  // Count stats
  const total = rows.length;
  const ready = rows.filter(r => r.status === 'ready').length;
  const duplicates = rows.filter(r => r.status === 'duplicate').length;
  const warnings = rows.filter(r => r.status === 'warning').length;
  const errors = rows.filter(r => r.status === 'error').length;

  const getStatusBadge = (status, text) => {
    switch (status) {
      case 'ready':
        return (
          <span style={{
            background: 'rgba(34, 197, 94, 0.1)',
            color: 'var(--green)',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <CheckCircle size={12} /> {text}
          </span>
        );
      case 'warning':
        return (
          <span style={{
            background: 'rgba(249, 115, 22, 0.1)',
            color: '#F97316',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <AlertTriangle size={12} /> {text}
          </span>
        );
      case 'duplicate':
        return (
          <span style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--red)',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <AlertCircle size={12} /> {text}
          </span>
        );
      case 'error':
      default:
        return (
          <span style={{
            background: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--red)',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4
          }}>
            <AlertCircle size={12} /> {text}
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 12
      }}>
        <div className="stat-card" style={{ padding: '12px 16px', border: '1px solid var(--surface-2)', minWidth: 'auto', flex: 1 }}>
          <div className="stat-info">
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Total Records</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 700 }}>{total}</h4>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 16px', border: '1px solid var(--surface-2)', minWidth: 'auto', flex: 1, '--card-color': 'var(--green)' }}>
          <div className="stat-info">
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Ready to Import</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{ready}</h4>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 16px', border: '1px solid var(--surface-2)', minWidth: 'auto', flex: 1, '--card-color': '#F97316' }}>
          <div className="stat-info">
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Warnings / Missing</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 700, color: '#F97316' }}>{warnings}</h4>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 16px', border: '1px solid var(--surface-2)', minWidth: 'auto', flex: 1, '--card-color': 'var(--red)' }}>
          <div className="stat-info">
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Duplicates</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{duplicates}</h4>
          </div>
        </div>
        <div className="stat-card" style={{ padding: '12px 16px', border: '1px solid var(--surface-2)', minWidth: 'auto', flex: 1, '--card-color': 'var(--red)' }}>
          <div className="stat-info">
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>Errors</p>
            <h4 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>{errors}</h4>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--surface-2)' }}>
        <div style={{ maxHeight: 350, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-1)', zIndex: 1, borderBottom: '2px solid var(--surface-2)' }}>
              <tr>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Employee Name</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Employee ID</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Department</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Position</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Shift</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>Result</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 600 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                    No rows to preview.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.index !== undefined ? row.index : idx} style={{ borderBottom: '1px solid var(--surface-2)', background: idx % 2 === 0 ? 'transparent' : 'rgba(var(--primary-rgb), 0.02)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 550 }}>{row.name || <span style={{ color: 'var(--red)', fontStyle: 'italic' }}>[Missing Name]</span>}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                      {row.existingEmpId || <span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--primary)' }}>Auto Generated</span>}
                    </td>
                    <td style={{ padding: '10px 14px' }}>{row.department || <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>--</span>}</td>
                    <td style={{ padding: '10px 14px' }}>{row.position || <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>--</span>}</td>
                    <td style={{ padding: '10px 14px' }}>
                      {row.shift ? (
                        <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{row.shift}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>Default (R1)</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span className="badge badge-success" style={{ background: 'rgba(34, 197, 94, 0.1)', color: 'var(--green)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                        Active
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {getStatusBadge(row.status, row.resultText)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => onRemoveRow(row.index !== undefined ? row.index : idx)}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          color: 'var(--red)',
                          padding: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
