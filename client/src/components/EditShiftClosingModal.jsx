import React, { useState, useEffect } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { ShieldAlert, X, History, Save, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function EditShiftClosingModal({ 
  closing, 
  currency = 'SAR', 
  devToken = null,
  developer = null,
  onClose, 
  onSuccess 
}) {
  const { user } = useAuth();
  const role = user?.role?.trim().toLowerCase();
  // Authorized if currently logged in user is admin or developer, or verified devToken is provided
  const isAuthorized = role === 'admin' || role === 'developer' || Boolean(devToken);

  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('edit'); // 'edit' | 'audit'
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const reasonRef = React.useRef(null);

  // Lock background scroll while modal is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow || 'unset';
    };
  }, []);

  useEffect(() => {
    if (closing) {
      const initCash = closing.closing_cash !== null && closing.closing_cash !== undefined 
        ? parseFloat(closing.closing_cash) 
        : 0;
      const initCard = closing.closing_card !== null && closing.closing_card !== undefined 
        ? parseFloat(closing.closing_card) 
        : 0;

      setCashAmount(initCash.toString());
      setCardAmount(initCard.toString());
      setReason('');
    }
  }, [closing]);

  // Load audit logs when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit' && closing?.id && isAuthorized) {
      setLoadingAudit(true);
      const headers = devToken ? { 'x-developer-token': devToken } : {};
      axios.get(`/api/orders/closings/${closing.id}/audit-logs`, { headers })
        .then(res => setAuditLogs(res.data || []))
        .catch(err => {
          console.error('Failed to load audit logs:', err);
          toast.error('Failed to load audit logs.');
        })
        .finally(() => setLoadingAudit(false));
    }
  }, [activeTab, closing?.id, isAuthorized, devToken]);

  if (!closing) return null;

  // Authorization Guard (Hard Stop)
  if (!isAuthorized) {
    return (
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
        <div className="modal" style={{ maxWidth: 440, padding: 24, textAlign: 'center', background: '#fff', borderRadius: 12 }}>
          <ShieldAlert size={48} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#0f172a' }}>Developer Authorization Required</h3>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b' }}>
            Only verified <strong>Developer</strong> accounts have permission to edit finalized shift closing records.
          </p>
          <button className="btn btn-secondary" onClick={onClose} style={{ width: '100%' }}>Close</button>
        </div>
      </div>
    );
  }

  // Numerical Calculations
  const systemSale = parseFloat(closing.total_sales || closing.system_sales || 0);
  const origCash = parseFloat(closing.closing_cash || 0);
  const origCard = parseFloat(closing.closing_card || 0);
  const origActual = origCash + origCard;
  const origDiff = parseFloat(closing.difference || (origActual - systemSale));
  const origDiffPct = systemSale > 0 ? (origDiff / systemSale) * 100 : 0;

  const newCashNum = parseFloat(cashAmount) || 0;
  const newCardNum = parseFloat(cardAmount) || 0;
  const newActual = newCashNum + newCardNum;
  const newDiff = newActual - systemSale;
  const newDiffPct = systemSale > 0 ? (newDiff / systemSale) * 100 : 0;

  const hasChanges = (newCashNum !== origCash || newCardNum !== origCard);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (isNaN(newCashNum) || newCashNum < 0) {
      return toast.error('Please enter a valid non-negative Actual Cash amount.');
    }
    if (isNaN(newCardNum) || newCardNum < 0) {
      return toast.error('Please enter a valid non-negative Actual Card amount.');
    }
    if (!reason || !reason.trim()) {
      setReasonError(true);
      toast.error('Please enter a reason before updating the shift.');
      if (reasonRef.current) {
        reasonRef.current.focus();
      }
      return;
    }

    setReasonError(false);
    setShowConfirmModal(true);
  };

  const handleConfirmSave = async () => {
    if (saving) return;
    try {
      setSaving(true);
      const headers = devToken ? { 'x-developer-token': devToken } : {};
      const res = await axios.put(`/api/orders/closings/${closing.id}`, {
        closing_cash: newCashNum,
        closing_card: newCardNum,
        reason: reason.trim(),
        dev_token: devToken
      }, { headers });

      toast.success('Shift closing amounts updated and developer audit log recorded!');
      setShowConfirmModal(false);
      if (onSuccess) {
        onSuccess(res.data?.closing || res.data);
      }
      onClose();
    } catch (err) {
      console.error('Error updating shift closing:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to update shift closing.';
      toast.error(`Update failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const authorDisplayName = developer?.username || (user?.name || user?.username || (role === 'admin' ? 'Admin' : 'Developer'));

  return (
    <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) onClose(); }} style={{ zIndex: 9999 }}>
      <div 
        className="modal" 
        style={{ 
          maxWidth: 580, 
          width: '95%', 
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff', 
          borderRadius: 14, 
          overflow: 'hidden', 
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' 
        }}
      >
        
        {/* Header (Fixed) */}
        <div style={{ background: '#0f172a', padding: '18px 24px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 17, fontWeight: 700 }}>Edit Shift Closing Record</span>
              <span style={{ background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={12} /> {role === 'admin' ? 'Admin Authorized' : 'Developer Authorized'}
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#94a3b8' }}>
              {closing.branch || 'Branch'} · {closing.closing_type || 'Shift'} #{closing.id} · Cashier: {closing.cashier_name || 'N/A'} · By: {authorDisplayName}
            </p>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs (Fixed) */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 24px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab('edit')}
            style={{
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === 'edit' ? 'var(--primary)' : '#64748b',
              borderBottom: activeTab === 'edit' ? '2.5px solid var(--primary)' : '2.5px solid transparent'
            }}
          >
            Correction Form
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '12px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: activeTab === 'audit' ? 'var(--primary)' : '#64748b',
              borderBottom: activeTab === 'audit' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <History size={14} /> Audit History
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          
          {/* Tab 1: Edit Form */}
          {activeTab === 'edit' && (
            <form id="edit-shift-closing-form" onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
              
              {/* System Sale (Read-Only) Banner */}
              <div style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    System Sale (ERP Transactions)
                  </span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                    {currency} {systemSale.toFixed(2)}
                  </div>
                </div>
                <span style={{ fontSize: 11, background: '#e2e8f0', color: '#475569', padding: '4px 8px', borderRadius: 6, fontWeight: 600 }}>
                  🔒 Read Only (Untouched)
                </span>
              </div>

              {/* Previous Edit / Difference Reason Banner */}
              {closing.difference_reason && (
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 16
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <AlertCircle size={15} /> Previous Modification Reason & Audit Notes:
                  </div>
                  <div style={{ fontSize: 12, color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {closing.difference_reason}
                  </div>
                </div>
              )}

              {/* Input Row: Actual Cash & Actual Card */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Actual Cash Counted ({currency}) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={cashAmount}
                    onChange={e => setCashAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 15,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    placeholder="0.00"
                  />
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Original: {currency} {origCash.toFixed(2)}
                  </span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Actual Card Counted ({currency}) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={cardAmount}
                    onChange={e => setCardAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 15,
                      fontWeight: 600,
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    placeholder="0.00"
                  />
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Original: {currency} {origCard.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Mandatory Reason Field Directly Below Editable Inputs */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
                  Reason for Editing (Mandatory for Audit Trail) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  ref={reasonRef}
                  rows={2}
                  value={reason}
                  onChange={e => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(false);
                  }}
                  placeholder="Please enter a reason before updating the shift (e.g. Cashier miscounted drawer, recount verified)."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: reasonError ? '2px solid #ef4444' : '1.5px solid #cbd5e1',
                    background: reasonError ? '#fef2f2' : '#fff',
                    fontSize: 13,
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    transition: 'border-color 0.2s, background-color 0.2s'
                  }}
                />
                {reasonError && (
                  <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 700, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={13} /> Please enter a reason before updating the shift.
                  </div>
                )}
              </div>

              {/* Live Recalculation Comparison Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase' }}>
                  Real-Time Impact & Recalculation
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>New Actual Sale</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                      {currency} {newActual.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Difference Amount</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: newDiff >= 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>
                      {newDiff >= 0 ? '+' : ''}{currency} {newDiff.toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, color: '#64748b' }}>Difference %</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: newDiff >= 0 ? '#16a34a' : '#dc2626', marginTop: 2 }}>
                      {newDiff >= 0 ? '+' : ''}{newDiffPct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>

            </form>
          )}

          {/* Tab 2: Audit History */}
          {activeTab === 'audit' && (
            <div style={{ padding: '20px 24px' }}>
              {loadingAudit ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Loading audit history...</div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>
                  <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px' }} />
                  <p style={{ margin: 0, fontWeight: 600 }}>No previous edits recorded for this shift closing.</p>
                  <span style={{ fontSize: 12 }}>Original values submitted by cashier remain unmodified.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {auditLogs.map((log, idx) => (
                    <div 
                      key={log.id || idx}
                      style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                          Edited by: {log.edited_by_name} ({log.user_role})
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 11.5, background: '#fff', padding: 8, borderRadius: 6, border: '1px solid #edf2f7', marginBottom: 8 }}>
                        <div>
                          <span style={{ color: '#64748b' }}>Cash: </span>
                          <strong>{log.previous_cash !== null ? `${currency} ${parseFloat(log.previous_cash).toFixed(2)}` : 'N/A'}</strong> → <strong>{currency} {parseFloat(log.updated_cash).toFixed(2)}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Card: </span>
                          <strong>{log.previous_card !== null ? `${currency} ${parseFloat(log.previous_card).toFixed(2)}` : 'N/A'}</strong> → <strong>{currency} {parseFloat(log.updated_card).toFixed(2)}</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Diff: </span>
                          <strong>{parseFloat(log.updated_difference) >= 0 ? '+' : ''}{parseFloat(log.updated_difference).toFixed(2)}</strong>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: '#334155' }}>
                        <strong>Reason:</strong> {log.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Sticky Footer (Fixed) */}
        <div style={{ 
          background: '#fff', 
          borderTop: '1px solid #e2e8f0', 
          padding: '14px 24px', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: 12, 
          flexShrink: 0 
        }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
            style={{ padding: '8px 18px' }}
          >
            Cancel
          </button>
          {activeTab === 'edit' && (
            <button
              type="submit"
              form="edit-shift-closing-form"
              className="btn btn-primary"
              disabled={saving}
              style={{
                padding: '8px 22px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                border: 'none',
                color: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={16} />
              {saving ? 'Saving Corrections...' : 'Save & Record Audit'}
            </button>
          )}
        </div>

      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 10001, background: 'rgba(15, 23, 42, 0.7)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay') && !saving) setShowConfirmModal(false); }}
        >
          <div 
            className="modal" 
            style={{ 
              maxWidth: 500, 
              width: '92%', 
              background: '#fff', 
              borderRadius: 12, 
              padding: 0, 
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            <div style={{ background: '#0f172a', padding: '16px 20px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}>
                <AlertCircle size={18} color="#f59e0b" /> Confirm Shift Closing Update
              </div>
              <button 
                type="button" 
                disabled={saving}
                onClick={() => setShowConfirmModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                Please review the summary of changes before confirming. This change will be permanently recorded in the developer audit logs.
              </p>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5, marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #cbd5e1' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Closing ID:</span> <strong>#{closing.id}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Branch:</span> <strong>{closing.branch || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Cashier:</span> <strong>{closing.cashier_name || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Authorized By:</span> <strong>{authorDisplayName}</strong>
                  </div>
                </div>

                <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '4px 0' }}>Field</th>
                      <th style={{ padding: '4px 0' }}>Previous</th>
                      <th style={{ padding: '4px 0' }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ padding: '6px 0', color: '#334155' }}>Actual Cash</td>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>{currency} {origCash.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', fontWeight: 700, color: '#0f172a' }}>{currency} {newCashNum.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', color: '#334155' }}>Actual Card</td>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>{currency} {origCard.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', fontWeight: 700, color: '#0f172a' }}>{currency} {newCardNum.toFixed(2)}</td>
                    </tr>
                    <tr style={{ borderTop: '1px dashed #e2e8f0' }}>
                      <td style={{ padding: '6px 0', color: '#334155', fontWeight: 600 }}>Total Counted</td>
                      <td style={{ padding: '6px 0', color: '#64748b' }}>{currency} {origActual.toFixed(2)}</td>
                      <td style={{ padding: '6px 0', fontWeight: 800, color: '#0f172a' }}>{currency} {newActual.toFixed(2)}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 0', color: '#334155', fontWeight: 600 }}>Difference</td>
                      <td style={{ padding: '6px 0', color: origDiff >= 0 ? '#16a34a' : '#dc2626' }}>
                        {origDiff >= 0 ? '+' : ''}{currency} {origDiff.toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 0', fontWeight: 800, color: newDiff >= 0 ? '#16a34a' : '#dc2626' }}>
                        {newDiff >= 0 ? '+' : ''}{currency} {newDiff.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                  Mandatory Reason:
                </div>
                <div style={{ fontSize: 12.5, color: '#78350f', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                  "{reason.trim()}"
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={saving}
                  style={{ padding: '8px 16px', fontSize: 13 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmSave}
                  disabled={saving}
                  style={{
                    padding: '8px 20px',
                    fontSize: 13,
                    fontWeight: 700,
                    background: '#dc2626',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  {saving ? 'Updating...' : 'Confirm Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
