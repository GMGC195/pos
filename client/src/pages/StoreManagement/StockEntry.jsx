import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from '../../api';
import toast from 'react-hot-toast';
import { 
  Clock, 
  Save, 
  CheckCircle2, 
  RotateCcw, 
  Search, 
  Filter, 
  AlertCircle, 
  Lock, 
  Info, 
  Calendar,
  Building2,
  Package,
  Layers,
  ChevronRight,
  TrendingDown,
  RefreshCw
} from 'lucide-react';
import { BRAND_CURRENCY } from '../../branding';
import { getSaudiTodayDate } from '../../utils/timezone';

export default function StockEntry({ 
  selectedBranch, 
  selectedStoreId, 
  locations = [], 
  onEntrySubmitted,
  user 
}) {
  const [entryDate, setEntryDate] = useState(() => getSaudiTodayDate());
  const [shift, setShift] = useState('Day'); // 'Day' | 'Night'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Sheet Data
  const [storeDetails, setStoreDetails] = useState(null);
  const [existingEntry, setExistingEntry] = useState(null);
  const [items, setItems] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Modals
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  const isManagerOrAdmin = useMemo(() => {
    const r = (user?.role || '').toLowerCase();
    return ['admin', 'developer', 'management', 'store manager'].includes(r);
  }, [user]);

  // Load sheet data whenever store, date or shift changes
  const fetchSheetData = useCallback(async () => {
    const validStoreId = parseInt(selectedStoreId, 10);
    if (!selectedStoreId || selectedStoreId === 'All' || selectedStoreId === 'undefined' || isNaN(validStoreId)) {
      setItems([]);
      setStoreDetails(null);
      setExistingEntry(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await axios.get('/api/store/entries/sheet-data', {
        params: {
          store_id: validStoreId,
          entry_date: entryDate,
          shift
        }
      });
      setStoreDetails(res.data.store);
      setExistingEntry(res.data.entry);
      setIsSubmitted(res.data.is_submitted);
      setItems(res.data.items || []);
    } catch (err) {
      console.error('Error fetching sheet data:', err);
      toast.error('Failed to load counting sheet: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, entryDate, shift]);

  useEffect(() => {
    fetchSheetData();
  }, [fetchSheetData]);

  // Update In-Hand Stock locally and recompute consumption in realtime
  const handleInHandChange = (itemId, val) => {
    if (isSubmitted) return;
    const numVal = val === '' ? 0 : parseFloat(val);

    setItems(prevItems => prevItems.map(it => {
      if (it.item_id === itemId) {
        const inHand = isNaN(numVal) ? 0 : numVal;
        const prev = parseFloat(it.previous_stock) || 0;
        const recv = parseFloat(it.received_stock) || 0;
        // Formula: Consumption = (Prev + Recv) - InHand
        const consumption = Math.max(0, (prev + recv) - inHand);
        return {
          ...it,
          in_hand_stock: val,
          calculated_consumption: consumption
        };
      }
      return it;
    }));
  };

  // Update Received Stock manually if goods arrived mid-shift
  const handleReceivedChange = (itemId, val) => {
    if (isSubmitted) return;
    const numVal = val === '' ? 0 : parseFloat(val);

    setItems(prevItems => prevItems.map(it => {
      if (it.item_id === itemId) {
        const recv = isNaN(numVal) ? 0 : numVal;
        const prev = parseFloat(it.previous_stock) || 0;
        const inHand = parseFloat(it.in_hand_stock) || 0;
        const consumption = Math.max(0, (prev + recv) - inHand);
        return {
          ...it,
          received_stock: val,
          calculated_consumption: consumption
        };
      }
      return it;
    }));
  };

  // Extract categories for tabs
  const categoriesList = useMemo(() => {
    const cats = new Set(items.map(it => it.category_name).filter(Boolean));
    return ['All', ...Array.from(cats)];
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      const matchCat = selectedCategory === 'All' || it.category_name === selectedCategory;
      const matchSearch = !search || 
        it.item_name.toLowerCase().includes(search.toLowerCase()) ||
        it.item_code.toLowerCase().includes(search.toLowerCase()) ||
        (it.arabic_name && it.arabic_name.toLowerCase().includes(search.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [items, selectedCategory, search]);

  // Totals summary
  const summaryTotals = useMemo(() => {
    let totalItemsCount = items.length;
    let itemsWithConsumption = 0;
    let totalConsumptionVal = 0;

    items.forEach(it => {
      const c = parseFloat(it.calculated_consumption) || 0;
      if (c > 0) itemsWithConsumption++;
      totalConsumptionVal += c * (parseFloat(it.unit_cost) || 0);
    });

    return {
      totalItemsCount,
      itemsWithConsumption,
      totalConsumptionVal: Math.round(totalConsumptionVal * 100) / 100
    };
  }, [items]);

  // Save Draft or Submit Shift
  const handleSaveOrSubmit = async (actionType) => {
    setSaving(true);
    try {
      const payload = {
        store_id: selectedStoreId,
        branch: selectedBranch || storeDetails?.branch,
        entry_date: entryDate,
        shift,
        action: actionType, // 'DRAFT' | 'SUBMIT'
        items: items.map(it => ({
          item_id: it.item_id,
          unit: it.unit,
          previous_stock: parseFloat(it.previous_stock) || 0,
          received_stock: parseFloat(it.received_stock) || 0,
          in_hand_stock: parseFloat(it.in_hand_stock) || 0,
          calculated_consumption: parseFloat(it.calculated_consumption) || 0,
          unit_cost: parseFloat(it.unit_cost) || 0,
          notes: it.notes || ''
        }))
      };

      const res = await axios.post('/api/store/entries/save', payload);
      toast.success(res.data.message);
      setShowConfirmModal(false);
      await fetchSheetData();
      if (onEntrySubmitted) onEntrySubmitted();
    } catch (err) {
      console.error('Error saving entry:', err);
      toast.error(err.response?.data?.error || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  // Reopen shift
  const handleReopen = async () => {
    if (!existingEntry?.id) return;
    if (!reopenReason.trim()) {
      return toast.error('A mandatory reason is required to reopen this shift');
    }

    setReopening(true);
    try {
      const res = await axios.post(`/api/store/entries/${existingEntry.id}/reopen`, {
        reason: reopenReason
      });
      toast.success(res.data.message);
      setShowReopenModal(false);
      setReopenReason('');
      await fetchSheetData();
      if (onEntrySubmitted) onEntrySubmitted();
    } catch (err) {
      console.error('Error reopening entry:', err);
      toast.error(err.response?.data?.error || 'Failed to reopen entry');
    } finally {
      setReopening(false);
    }
  };

  const isValidStore = selectedStoreId && selectedStoreId !== 'All' && selectedStoreId !== 'undefined' && !isNaN(parseInt(selectedStoreId, 10));

  if (!isValidStore) {
    return (
      <div className="store-card" style={{ padding: '48px 24px', textAlign: 'center', margin: '20px auto', maxWidth: 600 }}>
        <div className="store-header-icon" style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14 }}>
          <Building2 size={28} />
        </div>
        <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary, #111827)' }}>
          Select a Store Location
        </h3>
        <p style={{ color: 'var(--text-secondary, #6b7280)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>
          Shift inventory counting is recorded per physical branch store. Please select a specific store location (e.g. Branch 1 Main Store) from the top bar to view or submit physical stock counts.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Shift Controls Header */}
      <div className="card" style={{ 
        padding: '16px 20px', 
        borderRadius: 12, 
        background: 'var(--white)', 
        border: '1px solid var(--surface-2)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {/* Shift Picker Tabs */}
          <div style={{ display: 'flex', background: 'var(--surface)', padding: 4, borderRadius: 8, border: '1px solid var(--surface-2)' }}>
            <button
              onClick={() => setShift('Day')}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: shift === 'Day' ? 'var(--primary)' : 'transparent',
                color: shift === 'Day' ? '#000000' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              ☀️ Day Shift
            </button>
            <button
              onClick={() => setShift('Night')}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: shift === 'Night' ? 'var(--primary)' : 'transparent',
                color: shift === 'Night' ? '#000000' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              🌙 Night Shift
            </button>
          </div>

          {/* Date Picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--surface-2)' }}>
            <Calendar size={16} color="var(--text-secondary)" />
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Entry Date:</span>
            <input 
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontWeight: 700,
                fontSize: 13,
                color: 'var(--text-primary)',
                outline: 'none',
                cursor: 'pointer'
              }}
            />
          </div>

          {/* Status Badge */}
          {isSubmitted ? (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#ecfdf5',
              color: '#065f46',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              border: '1px solid #a7f3d0'
            }}>
              <CheckCircle2 size={14} /> Finalized & Submitted
            </span>
          ) : (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#fef3c7',
              color: '#92400e',
              padding: '6px 12px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              border: '1px solid #fde68a'
            }}>
              <Clock size={14} /> {existingEntry ? 'Draft in Progress' : 'New Counting Sheet'}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isSubmitted ? (
            isManagerOrAdmin && (
              <button 
                className="btn"
                onClick={() => setShowReopenModal(true)}
                style={{
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  padding: '9px 16px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <RotateCcw size={15} /> Reopen for Correction
              </button>
            )
          ) : (
            <>
              <button
                className="btn"
                disabled={saving || loading}
                onClick={() => handleSaveOrSubmit('DRAFT')}
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  border: '1.5px solid var(--surface-2)',
                  padding: '9px 16px',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Save size={15} /> Save Draft
              </button>
              <button
                className="btn"
                disabled={saving || loading || items.length === 0}
                onClick={() => setShowConfirmModal(true)}
                style={{
                  background: 'var(--primary)',
                  color: '#000000',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px var(--primary-glow)'
                }}
              >
                <CheckCircle2 size={16} /> Submit Shift
              </button>
            </>
          )}

          <button 
            className="btn btn-outline"
            onClick={fetchSheetData}
            title="Reload Sheet"
            style={{ padding: '8px' }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Formula Explainer Bar */}
      <div style={{
        background: 'rgba(16, 60, 67, 0.05)',
        border: '1px solid rgba(16, 60, 67, 0.15)',
        borderRadius: 8,
        padding: '10px 16px',
        fontSize: 13,
        color: 'var(--secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Info size={16} color="var(--secondary)" />
          <span>
            <strong>Consumption Formula:</strong> Previous Stock + Received Stock - In-Hand Stock = <strong>Calculated Consumption</strong>
          </span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
          Est. Shift Consumption: <span style={{ color: '#dc2626', fontWeight: 800 }}>{BRAND_CURRENCY}{summaryTotals.totalConsumptionVal.toFixed(2)}</span> ({summaryTotals.itemsWithConsumption} items consumed)
        </div>
      </div>

      {/* Search and Category Filter */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search items by name or code (e.g. Flour, STR-1001)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 8,
              border: '1.5px solid var(--surface-2)',
              background: 'var(--white)',
              outline: 'none',
              fontSize: 13
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {categoriesList.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: selectedCategory === cat ? '1px solid var(--secondary)' : '1px solid var(--surface-2)',
                background: selectedCategory === cat ? 'var(--secondary)' : 'var(--white)',
                color: selectedCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Stock Counting Table */}
      <div className="card table-container" style={{ borderRadius: 12, border: '1px solid var(--surface-2)', background: 'var(--white)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface)', borderBottom: '1.5px solid var(--surface-2)', color: 'var(--text-secondary)' }}>
              <th style={{ padding: '12px 16px', fontWeight: 800 }}>Item & Code</th>
              <th style={{ padding: '12px 12px', fontWeight: 800 }}>Category / Unit</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Previous Stock</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right' }}>Received Stock</th>
              <th style={{ padding: '12px 12px', fontWeight: 800, textAlign: 'right', minWidth: 120 }}>
                In-Hand Stock <span style={{ color: '#ef4444' }}>*</span>
              </th>
              <th style={{ padding: '12px 16px', fontWeight: 800, textAlign: 'right' }}>Consumption</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 8px' }} />
                  <div>Loading counting sheet...</div>
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  No store items found matching search or filter.
                </td>
              </tr>
            ) : (
              filteredItems.map((it, idx) => {
                const prev = parseFloat(it.previous_stock) || 0;
                const recv = parseFloat(it.received_stock) || 0;
                const inHand = parseFloat(it.in_hand_stock) || 0;
                const consumption = parseFloat(it.calculated_consumption) || 0;
                const isUnderStocked = inHand < prev;

                return (
                  <tr key={it.item_id} style={{ 
                    borderBottom: '1px solid var(--surface-2)',
                    background: idx % 2 === 0 ? 'var(--white)' : 'rgba(248, 248, 246, 0.5)'
                  }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {it.item_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {it.item_code} {it.arabic_name ? `• ${it.arabic_name}` : ''}
                      </div>
                    </td>

                    <td style={{ padding: '12px 12px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {it.category_name || 'General'}
                      </span>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)' }}>
                        {it.unit}
                      </div>
                    </td>

                    {/* Previous Stock (Locked from last closing) */}
                    <td style={{ padding: '12px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {prev} {it.unit}
                    </td>

                    {/* Received Stock (Editable or pulled from purchases) */}
                    <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                      {isSubmitted ? (
                        <span style={{ fontWeight: 700, color: recv > 0 ? '#10b981' : 'var(--text-muted)' }}>
                          +{recv} {it.unit}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.received_stock}
                          onChange={e => handleReceivedChange(it.item_id, e.target.value)}
                          placeholder="0"
                          style={{
                            width: 80,
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderRadius: 6,
                            border: '1.5px solid var(--surface-2)',
                            background: 'var(--surface)',
                            outline: 'none',
                            fontWeight: 700,
                            fontSize: 13,
                            color: recv > 0 ? '#10b981' : 'var(--text-primary)'
                          }}
                        />
                      )}
                    </td>

                    {/* In-Hand Stock Input */}
                    <td style={{ padding: '12px 12px', textAlign: 'right' }}>
                      {isSubmitted ? (
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-primary)' }}>
                          {inHand} {it.unit}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={it.in_hand_stock}
                          onChange={e => handleInHandChange(it.item_id, e.target.value)}
                          placeholder="0"
                          style={{
                            width: 95,
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderRadius: 6,
                            border: inHand < 0 ? '1.5px solid #ef4444' : '1.5px solid var(--primary)',
                            background: '#fffdf5',
                            outline: 'none',
                            fontWeight: 800,
                            fontSize: 14,
                            color: 'var(--text-primary)'
                          }}
                        />
                      )}
                    </td>

                    {/* Calculated Consumption Output */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontWeight: 800,
                        fontSize: 13,
                        background: consumption > 0 ? '#fee2e2' : '#f3f4f6',
                        color: consumption > 0 ? '#dc2626' : '#6b7280'
                      }}>
                        {consumption} {it.unit}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal before Submit */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 460, width: '100%', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 10px 0', color: 'var(--text-primary)' }}>
              Confirm Shift Submission
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>
              You are about to submit the <strong>{shift} Shift</strong> stock counting sheet for <strong>{storeDetails?.name}</strong> on <strong>{entryDate}</strong>.
            </p>

            <div style={{ background: 'var(--surface)', padding: 14, borderRadius: 8, marginBottom: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Items Counted:</span>
                <strong>{summaryTotals.totalItemsCount} items</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Items Consumed:</span>
                <strong style={{ color: '#dc2626' }}>{summaryTotals.itemsWithConsumption} items</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Est. Consumption Cost:</span>
                <strong style={{ color: '#dc2626' }}>{BRAND_CURRENCY}{summaryTotals.totalConsumptionVal.toFixed(2)}</strong>
              </div>
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              ⚠️ Once submitted, closing inventory quantities will be updated and ordinary editing will be locked.
            </p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                disabled={saving}
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => handleSaveOrSubmit('SUBMIT')}
                style={{ fontWeight: 800 }}
              >
                {saving ? 'Finalizing...' : 'Yes, Submit Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Shift Modal (Manager / Admin) */}
      {showReopenModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: 20
        }}>
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: 24, borderRadius: 14, background: 'var(--white)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px 0', color: '#b91c1c' }}>
              Reopen Finalized Shift
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Reopening will unlock this shift counting sheet for corrections. A mandatory reason is required for the audit trail.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                Reason for Reopening <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={3}
                placeholder="e.g. In-hand quantity for Chicken was miscounted by staff..."
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: 10,
                  borderRadius: 8,
                  border: '1.5px solid var(--surface-2)',
                  outline: 'none',
                  fontSize: 13,
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                disabled={reopening}
                onClick={() => setShowReopenModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn"
                disabled={reopening || !reopenReason.trim()}
                onClick={handleReopen}
                style={{
                  background: '#dc2626',
                  color: '#ffffff',
                  fontWeight: 700,
                  borderRadius: 8,
                  border: 'none',
                  padding: '10px 16px'
                }}
              >
                {reopening ? 'Reopening...' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
