import React, { useState, useEffect, useMemo } from 'react';
import axios from '../api';
import { X, BookOpen, Calendar, ArrowUpRight, ArrowDownRight, CreditCard, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { CURRENCY } from '../config';
import { 
  formatSaudiDateTime, 
  getSaudiCurrentMonthStr, 
  getSaudiPreviousMonthStr,
  formatMonthDisplay 
} from '../utils/timezone';

export default function EmployeeKhataModal({
  isOpen,
  onClose,
  employee,
  initialMonth
}) {
  const [selectedMonth, setSelectedMonth] = useState('All');
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [summary, setSummary] = useState(null);
  const [resolvedCustomerId, setResolvedCustomerId] = useState(employee?.khata_customer_id || null);

  useEffect(() => {
    let active = true;
    const init = async () => {
      if (!isOpen || !employee) return;
      let cId = employee?.khata_customer_id || employee?.credit_customer_id;
      if (!cId && employee?.id) {
        try {
          const res = await axios.get('/api/credit');
          const found = (res.data || []).find(c => c.employee_id === employee.id);
          if (found && active) {
            cId = found.id;
          }
        } catch (e) {
          console.error('Failed to lookup employee Khata customer:', e);
        }
      }
      if (active) {
        setResolvedCustomerId(cId);
        const m = initialMonth || getSaudiCurrentMonthStr();
        setSelectedMonth(m);
        if (cId) {
          loadLedger(m, cId);
        } else {
          setLoading(false);
        }
      }
    };
    init();
    return () => { active = false; };
  }, [isOpen, employee, initialMonth]);

  const loadLedger = async (month, cIdOverride = null) => {
    const cId = cIdOverride || resolvedCustomerId;
    if (!cId) return;
    setLoading(true);
    try {
      const params = { with_meta: 'true' };
      if (month && month !== 'All') {
        params.month = month;
      }
      const res = await axios.get(`/api/credit/${cId}/ledger`, { params });
      const txs = Array.isArray(res.data) ? res.data : (res.data?.transactions || []);
      const openBal = Array.isArray(res.data) ? 0 : parseFloat(res.data?.opening_balance || 0);

      setLedger(txs);
      setOpeningBalance(openBal);

      // Also fetch monthly summary
      const sumRes = await axios.get(`/api/credit/${cId}/monthly-summary`);
      const sumData = Array.isArray(sumRes.data) ? sumRes.data : [];
      const curSum = month !== 'All' ? sumData.find(s => (s.billing_month || s.month) === month) : null;
      setSummary(curSum || null);
    } catch (err) {
      console.error('Error loading employee Khata ledger:', err);
      toast.error('Failed to load Khata transaction history');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    loadLedger(newMonth, resolvedCustomerId);
  };

  if (!isOpen || !employee) return null;

  const currentMonthKey = getSaudiCurrentMonthStr();
  const previousMonthKey = getSaudiPreviousMonthStr();

  const totalDebits = ledger.reduce((sum, t) => sum + (['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(t.type) ? parseFloat(t.amount || 0) : 0), 0);
  const totalCredits = ledger.reduce((sum, t) => sum + (['PAYMENT', 'ORDER_CANCELLED'].includes(t.type) ? parseFloat(t.amount || 0) : 0), 0);
  const periodNet = Math.round((openingBalance + totalDebits - totalCredits) * 100) / 100;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000, padding: 16 }}>
      <div className="card" style={{ width: 920, maxWidth: '96vw', padding: 24, position: 'relative', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 12, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
        <button onClick={onClose} style={{ position: 'absolute', right: 16, top: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <BookOpen size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
              {employee.name} — Employee Khata Ledger
            </h3>
            <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
              {employee.employee_code || employee.employee_id || `ID: ${employee.id}`}
            </span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'block' }}>
            Complete audit history of purchases, salary deductions, payments, and balances.
          </span>
        </div>

        {/* Balance Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
          <div style={{ background: '#fff7ed', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fed7aa' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Current Live Balance</span>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#ea580c', marginTop: 2 }}>
              {CURRENCY} {parseFloat(employee.khata_balance || 0).toFixed(2)}
            </div>
            <span style={{ fontSize: 9.5, color: '#9a3412' }}>Overall outstanding debt</span>
          </div>

          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Previous Month Remaining</span>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#334155', marginTop: 2 }}>
              {CURRENCY} {parseFloat(employee.prev_month_remaining_khata || 0).toFixed(2)}
            </div>
            <span style={{ fontSize: 9.5, color: '#64748b' }}>Carried forward unsettled</span>
          </div>

          <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #bbf7d0' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>This Month Khata</span>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#16a34a', marginTop: 2 }}>
              {CURRENCY} {parseFloat(employee.this_month_khata || 0).toFixed(2)}
            </div>
            <span style={{ fontSize: 9.5, color: '#15803d' }}>Belonging to {formatMonthDisplay(initialMonth).slice(0, 8)}</span>
          </div>

          <div style={{ background: '#faf5ff', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e9d5ff' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase' }}>Selected Period Net</span>
            <div style={{ fontSize: 17, fontWeight: 900, color: periodNet > 0 ? '#dc2626' : periodNet < 0 ? '#16a34a' : '#7e22ce', marginTop: 2 }}>
              {CURRENCY} {Math.abs(periodNet).toFixed(2)} {periodNet > 0 ? '(Due)' : periodNet < 0 ? '(Adv)' : ''}
            </div>
            <span style={{ fontSize: 9.5, color: '#9333ea' }}>Opening + Debits - Credits</span>
          </div>
        </div>

        {/* Filter Strip */}
        <div style={{ background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Period Filter:</span>
            <select
              value={selectedMonth}
              onChange={e => handleMonthChange(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--surface-3)', background: 'var(--surface)', fontSize: 12, fontWeight: 600, outline: 'none', cursor: 'pointer' }}
            >
              <option value={currentMonthKey}>{formatMonthDisplay(currentMonthKey)} (Current Month)</option>
              <option value={previousMonthKey}>{formatMonthDisplay(previousMonthKey)} (Previous Month)</option>
              {Array.from({ length: 10 }, (_, i) => {
                let mKey = previousMonthKey;
                for (let j = 0; j <= i; j++) {
                  mKey = getSaudiPreviousMonthStr(mKey);
                }
                return <option key={mKey} value={mKey}>{formatMonthDisplay(mKey)}</option>;
              })}
              <option value="All">All Months (Full History)</option>
            </select>
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            Total Records: <strong>{ledger.length}</strong>
          </div>
        </div>

        {/* Transactions Table */}
        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--surface-2)', borderRadius: 8 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              <RefreshCw size={20} className="spin" style={{ marginBottom: 8 }} />
              <div>Loading Khata records...</div>
            </div>
          ) : ledger.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No transactions recorded for this employee in {formatMonthDisplay(selectedMonth)}.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface-1)', borderBottom: '1.5px solid var(--surface-2)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Date & Time</th>
                  <th style={{ padding: '8px 10px' }}>Ref / Order #</th>
                  <th style={{ padding: '8px 10px' }}>Type</th>
                  <th style={{ padding: '8px 10px' }}>Description / Items</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Debit (Purchases)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Credit (Paid/Deduct)</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Running Bal</th>
                </tr>
              </thead>
              <tbody>
                {selectedMonth !== 'All' && openingBalance !== 0 && (
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--surface-2)', fontStyle: 'italic', color: '#64748b' }}>
                    <td colSpan={6} style={{ padding: '8px 10px', fontWeight: 600 }}>
                      Opening Balance (prior to {formatMonthDisplay(selectedMonth)}):
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>
                      {CURRENCY} {openingBalance.toFixed(2)}
                    </td>
                  </tr>
                )}
                {ledger.map((t, idx) => {
                  const isDebit = ['CHARGE', 'CREDIT_ORDER', 'PAYMENT_CANCELLED'].includes(t.type);
                  const isPayment = ['PAYMENT', 'ORDER_CANCELLED'].includes(t.type);
                  const isSalaryDeduct = t.classification === 'Salary Deduction';
                  const isSettlementNotice = t.type === 'SETTLEMENT_NOTICE' || t.classification === 'Settlement History';
                  const amt = parseFloat(t.amount || 0);

                  return (
                    <tr key={t.id || idx} style={{ borderBottom: '1px solid var(--surface-2)', background: isSettlementNotice ? '#f8fafc' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                        {formatSaudiDateTime(t.created_at)}
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 11.5, fontWeight: 600 }}>
                        {t.slip_number ? `#${t.slip_number}` : (t.order_id ? `Order #${t.order_id}` : (isSettlementNotice ? 'Settlement' : `TX-${t.id}`))}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: isSettlementNotice ? '#eff6ff' : isSalaryDeduct ? '#ecfdf5' : isDebit ? '#fef2f2' : '#f0fdf4',
                          color: isSettlementNotice ? '#1d4ed8' : isSalaryDeduct ? '#047857' : isDebit ? '#b91c1c' : '#15803d',
                          border: `1px solid ${isSettlementNotice ? '#bfdbfe' : isSalaryDeduct ? '#a7f3d0' : isDebit ? '#fecaca' : '#bbf7d0'}`
                        }}>
                          {isSettlementNotice ? 'Settlement History' : isSalaryDeduct ? 'Salary Deduction' : t.type}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', maxWidth: 260 }}>
                        <div style={{ fontWeight: 600, color: isSettlementNotice ? '#1e293b' : 'inherit' }}>
                          {t.comments || (t.order_id ? 'Credit Order' : 'Manual Entry')}
                        </div>
                        {isSettlementNotice && (
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#2563eb', marginTop: 2 }}>
                            Cleared Amount: {CURRENCY} {amt.toFixed(2)} (Informational Entry)
                          </div>
                        )}
                        {Array.isArray(t.order_items) && t.order_items.length > 0 && (
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                            {t.order_items.map(i => `${i.qty}x ${i.item_name}`).join(', ')}
                          </div>
                        )}
                        {t.payment_method && t.payment_method !== 'Cash' && (
                          <span style={{ fontSize: 9.5, color: '#64748b', display: 'block' }}>
                            Via {t.payment_method}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isDebit ? '#dc2626' : 'var(--text-muted)' }}>
                        {isDebit ? `${CURRENCY} ${amt.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isPayment ? '#16a34a' : 'var(--text-muted)' }}>
                        {isPayment ? `${CURRENCY} ${amt.toFixed(2)}` : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800 }}>
                        {t.running_balance !== undefined ? `${CURRENCY} ${parseFloat(t.running_balance).toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ padding: '8px 18px', fontWeight: 600 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
