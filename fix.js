const fs = require('fs');
const filePath = 'client/src/pages/AttendanceTracker.jsx';
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const correctLines = lines.slice(0, 1674);
const replacement = `                {requestTargetLog.request_type !== 'Check-In' && (
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Requested Check-Out</label>
                    <input type="time" value={requestedCheckOut} onChange={e => setRequestedCheckOut(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }} />
                  </div>
                )}
              </div>
              {!['Check-In', 'Check-Out'].includes(requestTargetLog.request_type) && (
                <>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Send Request To</label>
                    <select value={requestTargetRole} onChange={e => setRequestTargetRole(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Reason for Correction</label>
                    <textarea required placeholder="Explain why you need this correction (e.g. forgot to check out)..." value={requestReason} onChange={e => setRequestReason(e.target.value)} rows={3} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1.5px solid var(--surface-2)', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none', resize: 'vertical' }} />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRequestModal(false)} style={{ flex: 1 }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={requestSubmitting} style={{ flex: 1 }}>{requestSubmitting ? 'Sending...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overtime Reason Modal */}
      {overtimeModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999999 }}>
          <div className="modal-content" style={{ width: 400, padding: 24, borderRadius: 16, background: 'var(--surface)', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>Overtime Reason</h3>
              <button 
                onClick={() => setOvertimeModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            
            <div style={{ marginBottom: 20 }}>
              <p style={{ margin: '0 0 16px 0', fontSize: 14, color: 'var(--text-muted)', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text)' }}>{overtimeModal.name}</strong> has worked <strong>{overtimeModal.overtimeMins} minutes</strong> of overtime. Please provide a reason to continue checking out. This reason will be sent to the Admin for approval.
              </p>
              <textarea
                value={overtimeReason}
                onChange={(e) => setOvertimeReason(e.target.value)}
                placeholder="Enter overtime reason here..."
                style={{
                  width: '100%',
                  height: 100,
                  padding: 12,
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-3)',
                  background: 'var(--surface-1)',
                  color: 'var(--text)',
                  fontSize: 14,
                  resize: 'none',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setOvertimeModal(null)}
                style={{ flex: 1, padding: '10px 0', fontWeight: 600, fontSize: 14 }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  if (!overtimeReason.trim()) {
                    toast.error('Overtime reason is required.');
                    return;
                  }
                  proceedWithCheckout(overtimeModal.empId, overtimeModal.name, overtimeReason);
                  setOvertimeModal(null);
                }}
                disabled={!overtimeReason.trim()}
                style={{ flex: 1, padding: '10px 0', fontWeight: 600, fontSize: 14 }}
              >
                Submit & Check Out
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default AttendanceTracker
`;
correctLines.push(replacement);
fs.writeFileSync(filePath, correctLines.join('\n'));
