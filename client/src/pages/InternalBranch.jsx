import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { socket } from '../socket';
import { 
  playIncomingTransferAlert, 
  playDispatchedAlert, 
  playReceivedAlert 
} from '../utils/audioAlert';
import { 
  ArrowLeftRight, 
  PlusCircle, 
  Truck, 
  PackageCheck, 
  ClipboardList, 
  FileSpreadsheet, 
  FileText, 
  Search, 
  Filter, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  Trash2, 
  ChevronDown, 
  ChevronRight, 
  RefreshCw, 
  Send,
  Building,
  Volume2,
  BookOpen,
  Utensils,
  ExternalLink,
  Store,
  Check,
  X,
  Printer,
  ArrowLeft
} from 'lucide-react';

const STANDARD_BRANCH_NAMES = ['branch 1', 'branch 2', 'branch 3', 'central kitchen'];
function isExternalBranch(name) {
  if (!name) return false;
  return !STANDARD_BRANCH_NAMES.includes(name.trim().toLowerCase());
}

// Short format for branch names: Branch 1 -> B1, Branch 2 -> B2, Branch 3 -> B3, Central Kitchen -> CK
function getShortBranchName(name) {
  if (!name) return '-';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'branch 1') return 'B1';
  if (lower === 'branch 2') return 'B2';
  if (lower === 'branch 3') return 'B3';
  if (lower === 'central kitchen') return 'CK';
  return trimmed;
}

// Extract dynamic units from menu item's size_options
function getItemUnits(dish) {
  if (!dish) return ['Piece'];
  const rawSizes = dish.size_options || [];
  if (Array.isArray(rawSizes) && rawSizes.length > 0) {
    const parsed = rawSizes.map(s => {
      if (typeof s !== 'string') return String(s);
      if (s.includes(':')) return s.split(':')[0].trim();
      return s.trim();
    }).filter(Boolean);
    if (parsed.length > 0) {
      return Array.from(new Set(parsed));
    }
  }
  if (dish.unit && typeof dish.unit === 'string' && dish.unit.trim()) {
    return [dish.unit.trim()];
  }
  return ['Piece'];
}

// Thermal / Standard Transfer Voucher Print Helper
function printTransferSlip(t) {
  if (!t) return;
  const printWindow = window.open('', '_blank', 'width=460,height=700');
  if (!printWindow) {
    toast.error('Popup blocked. Please allow popups to print transfer slip.');
    return;
  }

  const reqDate = new Date(t.request_date).toLocaleDateString();
  const reqTime = new Date(t.request_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dispTime = t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending';
  const recTime = t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending';

  const itemsHtml = (t.items || []).map((it, idx) => `
    <tr>
      <td style="padding: 5px 3px; font-weight: bold; border-bottom: 1px dashed #cbd5e1;">${idx + 1}. ${it.dish_name}</td>
      <td style="padding: 5px 3px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.uom || 'Piece'}</td>
      <td style="padding: 5px 3px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.requested_qty}</td>
      <td style="padding: 5px 3px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.sent_qty !== null && it.sent_qty !== undefined ? it.sent_qty : '-'}</td>
      <td style="padding: 5px 3px; text-align: right; border-bottom: 1px dashed #cbd5e1;">${it.received_qty !== null && it.received_qty !== undefined ? it.received_qty : '-'}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Transfer Slip - ${t.transfer_id}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            color: #000;
            margin: 0;
            padding: 8px;
            line-height: 1.35;
          }
          .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .header h2 { margin: 0 0 3px; font-size: 16px; text-transform: uppercase; font-weight: 800; }
          .header p { margin: 2px 0; font-size: 11px; }
          .meta-table { width: 100%; font-size: 11px; margin-bottom: 8px; border-collapse: collapse; }
          .meta-table td { padding: 2.5px 0; }
          .items-table { width: 100%; border-collapse: collapse; font-size: 11px; margin: 8px 0; }
          .items-table th { border-bottom: 1.5px solid #000; border-top: 1.5px solid #000; padding: 4px 2px; text-align: left; }
          .footer { margin-top: 14px; border-top: 1.5px dashed #000; padding-top: 8px; font-size: 11px; text-align: center; }
          .sign-area { display: flex; justify-content: space-between; margin-top: 24px; padding-top: 6px; }
          .sign-box { border-top: 1px solid #000; width: 45%; text-align: center; font-size: 10px; padding-top: 2px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>AL RAZAQ RESTAURANT</h2>
          <p><strong>INTERNAL BRANCH TRANSFER SLIP</strong></p>
          <p style="font-size: 13px; font-weight: bold; margin-top: 4px;">ID: ${t.transfer_id}</p>
        </div>

        <table class="meta-table">
          <tr><td><strong>Date:</strong> ${reqDate} ${reqTime}</td><td style="text-align: right;"><strong>Status:</strong> ${t.status}</td></tr>
          <tr><td><strong>From:</strong> ${t.from_branch} (${getShortBranchName(t.from_branch)})</td><td style="text-align: right;"><strong>To:</strong> ${t.to_branch} (${getShortBranchName(t.to_branch)})</td></tr>
          <tr><td><strong>Needed By:</strong> ${t.needed_by_time || 'ASAP'}</td><td style="text-align: right;"><strong>Req By:</strong> ${t.requested_by_name || 'Staff'}</td></tr>
          ${t.dispatched_by_name ? `<tr><td><strong>Dispatched:</strong> ${dispTime}</td><td style="text-align: right;"><strong>By:</strong> ${t.dispatched_by_name}</td></tr>` : ''}
          ${t.received_by_name ? `<tr><td><strong>Received:</strong> ${recTime}</td><td style="text-align: right;"><strong>By:</strong> ${t.received_by_name}</td></tr>` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th>Dish</th>
              <th style="text-align: center;">Unit</th>
              <th style="text-align: center;">Req</th>
              <th style="text-align: center;">Sent</th>
              <th style="text-align: right;">Rec</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${t.notes ? `<div style="font-size: 10.5px; margin-top: 6px; padding: 4px 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px;"><strong>Notes:</strong> ${t.notes}</div>` : ''}

        <div class="sign-area">
          <div class="sign-box">Dispatcher Signature</div>
          <div class="sign-box">Receiver Signature</div>
        </div>

        <div class="footer">
          <p style="margin: 0; font-weight: 600;">Verified via Electronic POS System</p>
          <p style="margin: 2px 0 0; font-size: 9.5px; color: #475569;">Printed: ${new Date().toLocaleString()}</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 800);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function BranchBadge({ branch, isExternal = false }) {
  const external = isExternal || isExternalBranch(branch);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700 }}>{branch}</span>
      {external && (
        <span style={{
          background: '#fff7ed',
          color: '#c2410c',
          border: '1px solid #fed7aa',
          fontSize: 10,
          fontWeight: 700,
          padding: '1.5px 6px',
          borderRadius: 4,
          letterSpacing: 0.3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3
        }}>
          <Building size={10} /> External Restaurant
        </span>
      )}
    </span>
  );
}

// Clean Searchable Dish Dropdown with Image Thumbnail
function DishSearchDropdown({ value, imageUrl, dishes, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const containerRef = useRef(null);

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredDishes = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return dishes.slice(0, 60);
    return dishes.filter(d => d.name && d.name.toLowerCase().includes(term)).slice(0, 60);
  }, [dishes, searchTerm]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Selected Thumbnail preview */}
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 6,
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
          title={value || 'Dish Thumbnail'}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <Utensils size={17} color="#94a3b8" />
          )}
        </div>

        {/* Search Input */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            required
            placeholder="Search menu dish..."
            value={searchTerm}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              setIsOpen(true);
              const found = dishes.find(d => d.name && d.name.toLowerCase() === val.toLowerCase());
              if (found) {
                onSelect(found);
              } else {
                onSelect({ name: val, id: null, image_url: null, price: null, size_options: [] });
              }
            }}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 6,
              border: isOpen ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              background: '#fff'
            }}
          />
        </div>
      </div>

      {/* Clean Dropdown: Product Thumbnail + Dish Name only (No price or descriptions) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 46,
            right: 0,
            maxHeight: 240,
            overflowY: 'auto',
            background: '#ffffff',
            borderRadius: 8,
            border: '1.5px solid #cbd5e1',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.18), 0 8px 10px -6px rgba(0,0,0,0.1)',
            zIndex: 99999
          }}
        >
          {filteredDishes.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#64748b', textAlign: 'center' }}>
              No dishes found matching "{searchTerm}"
            </div>
          ) : (
            filteredDishes.map((dish) => (
              <div
                key={dish.id}
                onMouseDown={() => {
                  setSearchTerm(dish.name);
                  onSelect(dish);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f9ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Small product thumbnail (optional) */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 4,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                >
                  {dish.image_url ? (
                    <img
                      src={dish.image_url}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <Utensils size={13} color="#94a3b8" />
                  )}
                </div>

                {/* Only Menu Item Name: NO price, NO description */}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {dish.name}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function InternalBranch() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.role?.trim().toLowerCase();
  const isSuperUser = userRole === 'admin' || userRole === 'developer' || userRole === 'management' || userRole === 'general manager';

  // Active Tab
  const [activeTab, setActiveTab] = useState('requests'); // 'new' | 'incoming' | 'receivals' | 'logs'

  // Branches & Menu Items
  const [branches, setBranches] = useState(['Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen', 'Other']);
  const [dishes, setDishes] = useState([]);
  const [loadingDishes, setLoadingDishes] = useState(false);

  // Stats / Badges
  const [stats, setStats] = useState({
    pending_count: 0,
    in_transit_count: 0,
    completed_count: 0,
    incoming_pending_count: 0,
    pending_receivals_count: 0
  });

  // Transfers List
  const [transfers, setTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // Filters for Master Logs
  const [filterFromBranch, setFilterFromBranch] = useState('All');
  const [filterToBranch, setFilterToBranch] = useState('All');
  const [customFilterFromBranch, setCustomFilterFromBranch] = useState('');
  const [customFilterToBranch, setCustomFilterToBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState('all'); // 'all' | 'today' | 'daily' | 'weekly' | 'monthly'
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterDishName, setFilterDishName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals / Actions
  const [dispatchModalTransfer, setDispatchModalTransfer] = useState(null);
  const [dispatchItemQuantities, setDispatchItemQuantities] = useState({});
  const [dispatchItemRemarks, setDispatchItemRemarks] = useState({});
  const [dispatching, setDispatching] = useState(false);

  const [receiveModalTransfer, setReceiveModalTransfer] = useState(null);
  const [receiveItemQuantities, setReceiveItemQuantities] = useState({});
  const [receiveItemRemarks, setReceiveItemRemarks] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiving, setReceiving] = useState(false);

  const [detailModalTransfer, setDetailModalTransfer] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);

  // Double-click protection refs & socket event deduplication
  const isSubmittingRef = useRef(false);
  const isDispatchingRef = useRef(false);
  const isReceivingRef = useRef(false);
  const processedEventKeysRef = useRef(new Set());
  const localActionTransferIdsRef = useRef(new Map());

  // New Request Form State
  const defaultFromBranch = user?.branch && user.branch !== 'All' ? user.branch : 'Branch 1';
  const [newFromBranch, setNewFromBranch] = useState(defaultFromBranch);
  const [newToBranch, setNewToBranch] = useState('');
  const [customFromBranch, setCustomFromBranch] = useState('');
  const [customToBranch, setCustomToBranch] = useState('');
  const [newNeededByTime, setNewNeededByTime] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDishRows, setNewDishRows] = useState([
    { id: 1, dish_name: '', item_id: null, uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'] }
  ]);
  const [submittingRequest, setSubmittingRequest] = useState(false);

  // Visual Menu Browser Modal State
  const [showMenuBrowser, setShowMenuBrowser] = useState(false);
  const [menuBrowserSearch, setMenuBrowserSearch] = useState('');
  const [menuBrowserCategory, setMenuBrowserCategory] = useState('All');

  // Check for transferred items from POS Confirm Modal
  useEffect(() => {
    const pendingData = sessionStorage.getItem('pending_internal_transfer_items');
    if (pendingData) {
      try {
        const items = JSON.parse(pendingData);
        if (Array.isArray(items) && items.length > 0) {
          setNewDishRows(items.map((it, idx) => {
            const rawUnits = it.size_options || (it.uom ? [it.uom] : ['Piece']);
            return {
              id: Date.now() + idx,
              dish_name: it.dish_name || '',
              item_id: it.item_id || null,
              uom: it.uom || 'Piece',
              available_units: Array.isArray(rawUnits) && rawUnits.length > 0 ? rawUnits : ['Piece'],
              requested_qty: it.requested_qty || 1,
              image_url: it.image_url || null,
              price: it.price || null,
              remarks: it.remarks || ''
            };
          }));
          setActiveTab('new');
          toast.success(`Loaded ${items.length} items from POS cart for Branch Transfer!`);
        }
      } catch (e) {
        console.error('Failed to parse pending transfer items:', e);
      } finally {
        sessionStorage.removeItem('pending_internal_transfer_items');
      }
    }
  }, []);

  const allMenuCategories = useMemo(() => {
    const cats = new Set();
    dishes.forEach(d => {
      if (Array.isArray(d.category_names)) {
        d.category_names.forEach(c => { if (c) cats.add(c); });
      }
    });
    return ['All', ...Array.from(cats)];
  }, [dishes]);

  const filteredBrowserDishes = useMemo(() => {
    return dishes.filter(d => {
      const matchSearch = !menuBrowserSearch || d.name.toLowerCase().includes(menuBrowserSearch.toLowerCase());
      const matchCat = menuBrowserCategory === 'All' || (Array.isArray(d.category_names) && d.category_names.includes(menuBrowserCategory));
      return matchSearch && matchCat;
    });
  }, [dishes, menuBrowserSearch, menuBrowserCategory]);

  const handleAddDishFromBrowser = (dish) => {
    const units = getItemUnits(dish);
    const defaultUom = units[0] || 'Piece';

    setNewDishRows(prev => {
      if (prev.length === 1 && (!prev[0].dish_name || !prev[0].dish_name.trim())) {
        return [{
          id: prev[0].id,
          dish_name: dish.name,
          item_id: dish.id,
          uom: defaultUom,
          available_units: units,
          requested_qty: 1,
          image_url: dish.image_url || null,
          price: dish.price || null,
          remarks: ''
        }];
      }
      const existing = prev.find(r => r.item_id === dish.id || (r.dish_name && r.dish_name.toLowerCase() === dish.name.toLowerCase()));
      if (existing) {
        return prev.map(r => r.id === existing.id ? { ...r, requested_qty: (parseFloat(r.requested_qty) || 0) + 1 } : r);
      }
      return [
        ...prev,
        {
          id: Date.now() + Math.random(),
          dish_name: dish.name,
          item_id: dish.id,
          uom: defaultUom,
          available_units: units,
          requested_qty: 1,
          image_url: dish.image_url || null,
          price: dish.price || null,
          remarks: ''
        }
      ];
    });
    toast.success(`Added "${dish.name}" to transfer request`);
  };

  const handleUpdateQtyFromBrowser = (dish, delta) => {
    setNewDishRows(prev => {
      const existing = prev.find(r => r.item_id === dish.id || (r.dish_name && r.dish_name.toLowerCase() === dish.name.toLowerCase()));
      if (!existing) return prev;
      const newQty = (parseFloat(existing.requested_qty) || 0) + delta;
      if (newQty <= 0) {
        if (prev.length === 1) {
          return [{ id: Date.now(), dish_name: '', item_id: null, uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'] }];
        }
        return prev.filter(r => r.id !== existing.id);
      }
      return prev.map(r => r.id === existing.id ? { ...r, requested_qty: newQty } : r);
    });
  };

  // Audio test state
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Load initial branches, dishes, and stats
  useEffect(() => {
    // Branches
    axios.get('/api/internal-branch/branches')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          // Remove any Restaurant 1, Restaurant 2, Restaurant 3
          const cleaned = res.data.filter(b => typeof b === 'string' && !b.trim().toLowerCase().includes('restaurant'));
          if (!cleaned.includes('Other')) cleaned.push('Other');
          setBranches(cleaned);
          // Set default target branch
          const otherBranches = cleaned.filter(b => b !== defaultFromBranch && b !== 'Other');
          if (otherBranches.length > 0 && !newToBranch) {
            setNewToBranch(otherBranches[0]);
          }
        }
      })
      .catch(err => console.error('Failed to load branches:', err));

    // Dishes from centralized items
    setLoadingDishes(true);
    axios.get('/api/internal-branch/dishes')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setDishes(res.data);
        } else {
          // Direct fallback to /api/items to guarantee restaurant dishes always load
          return axios.get('/api/items').then(fallbackRes => {
            setDishes(fallbackRes.data || []);
          });
        }
      })
      .catch(() => {
        // Fallback to /api/items if dishes endpoint encountered any error
        return axios.get('/api/items')
          .then(fallbackRes => setDishes(fallbackRes.data || []))
          .catch(err => console.error('Failed to load menu dishes:', err));
      })
      .finally(() => setLoadingDishes(false));

    fetchStats();
  }, [defaultFromBranch]);

  const fetchStats = useCallback(() => {
    axios.get('/api/internal-branch/stats')
      .then(res => setStats(res.data || {}))
      .catch(err => console.error('Failed to load transfer stats:', err));
  }, []);

  // Fetch transfers based on active tab and filters
  const fetchTransfers = useCallback(() => {
    setLoadingTransfers(true);
    const params = {};

    if (activeTab === 'incoming') {
      params.tab = 'incoming';
    } else if (activeTab === 'receivals') {
      params.tab = 'pending_receivals';
    } else {
      // Master Logs & Reporting Tab
      if (filterFromBranch !== 'All') {
        params.from_branch = filterFromBranch;
        if (filterFromBranch === 'Other' && customFilterFromBranch.trim()) {
          params.from_branch_custom = customFilterFromBranch.trim();
        }
      }
      if (filterToBranch !== 'All') {
        params.to_branch = filterToBranch;
        if (filterToBranch === 'Other' && customFilterToBranch.trim()) {
          params.to_branch_custom = customFilterToBranch.trim();
        }
      }
      if (filterStatus !== 'All') params.status = filterStatus;
      if (filterPeriod !== 'all') params.period = filterPeriod;
      if (filterFromDate) params.from_date = filterFromDate;
      if (filterToDate) params.to_date = filterToDate;
      if (filterDishName) params.dish_name = filterDishName;
      if (searchQuery) params.search = searchQuery;
    }

    axios.get('/api/internal-branch/transfers', { params })
      .then(res => setTransfers(res.data || []))
      .catch(err => console.error('Failed to fetch transfers:', err))
      .finally(() => setLoadingTransfers(false));
  }, [
    activeTab, 
    filterFromBranch, 
    filterToBranch, 
    customFilterFromBranch,
    customFilterToBranch,
    filterStatus, 
    filterPeriod, 
    filterFromDate, 
    filterToDate, 
    filterDishName, 
    searchQuery
  ]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Real-time WebSockets listeners with event deduplication (prevents double toasts & sounds)
  useEffect(() => {
    if (!socket) return;

    const isNewEvent = (action, trfId) => {
      const key = `${action}_${trfId}`;
      // Suppress duplicate socket toast if this client just performed the action locally
      const localTime = localActionTransferIdsRef.current.get(key);
      if (localTime && (Date.now() - localTime < 12000)) {
        return false;
      }
      if (processedEventKeysRef.current.has(key)) return false;
      processedEventKeysRef.current.add(key);
      setTimeout(() => {
        processedEventKeysRef.current.delete(key);
      }, 7000);
      return true;
    };

    const handleTransferCreated = (data) => {
      fetchStats();
      fetchTransfers();

      if (!isNewEvent('created', data.transfer_id || data.id)) return;

      const userBranch = user?.branch;
      const isRecipient = isSuperUser || (userBranch && userBranch.toLowerCase() === (data.to_branch || '').toLowerCase());

      if (isRecipient) {
        if (audioEnabled) {
          playIncomingTransferAlert();
        }
        toast.custom((t) => (
          <div style={{
            background: '#0f172a',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 10,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderLeft: '4px solid #f59e0b'
          }}>
            <Volume2 size={24} color="#f59e0b" />
            <div>
              <strong style={{ fontSize: 13.5, display: 'block' }}>New Incoming Transfer Request!</strong>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                From: {data.from_branch} · Needed: {data.needed_by_time || 'ASAP'} · ID: {data.transfer_id}
              </span>
            </div>
          </div>
        ), { duration: 6000 });
      }
    };

    const handleTransferDispatched = (data) => {
      fetchStats();
      fetchTransfers();

      if (!isNewEvent('dispatched', data.transfer_id || data.id)) return;

      const userBranch = user?.branch;
      const isRequestingBranch = isSuperUser || (userBranch && userBranch.toLowerCase() === (data.from_branch || '').toLowerCase());

      if (isRequestingBranch) {
        if (audioEnabled) {
          playDispatchedAlert();
        }
        toast.success(`Transfer ${data.transfer_id} Dispatched by ${data.to_branch}! In-Transit.`);
      }
    };

    const handleTransferReceived = (data) => {
      fetchStats();
      fetchTransfers();

      if (!isNewEvent('received', data.transfer_id || data.id)) return;

      const userBranch = user?.branch;
      const isConcerned = isSuperUser || (userBranch && [data.from_branch, data.to_branch].map(b => (b||'').toLowerCase()).includes(userBranch.toLowerCase()));

      if (isConcerned) {
        if (audioEnabled) {
          playReceivedAlert();
        }
        toast.success(`Transfer ${data.transfer_id} verified and completed!`);
      }
    };

    const handleTransferCancelled = (data) => {
      fetchStats();
      fetchTransfers();

      if (!isNewEvent('cancelled', data.transfer_id || data.id)) return;
      toast.error(`Transfer ${data.transfer_id || ''} has been cancelled.`);
    };

    socket.on('internal_transfer_created', handleTransferCreated);
    socket.on('internal_transfer_dispatched', handleTransferDispatched);
    socket.on('internal_transfer_received', handleTransferReceived);
    socket.on('internal_transfer_cancelled', handleTransferCancelled);

    return () => {
      socket.off('internal_transfer_created', handleTransferCreated);
      socket.off('internal_transfer_dispatched', handleTransferDispatched);
      socket.off('internal_transfer_received', handleTransferReceived);
      socket.off('internal_transfer_cancelled', handleTransferCancelled);
    };
  }, [user, isSuperUser, audioEnabled, fetchStats, fetchTransfers]);

  // Form row handlers
  const handleAddDishRow = () => {
    setNewDishRows(prev => [
      ...prev,
      { id: Date.now(), dish_name: '', item_id: null, uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'] }
    ]);
  };

  const handleRemoveDishRow = (rowId) => {
    if (newDishRows.length <= 1) {
      return toast.error('At least one dish row is required.');
    }
    setNewDishRows(prev => prev.filter(r => r.id !== rowId));
  };

  const handleSelectDish = (rowId, dish) => {
    const units = getItemUnits(dish);
    const defaultUom = units[0] || 'Piece';
    setNewDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        dish_name: dish.name,
        item_id: dish.id || null,
        image_url: dish.image_url || null,
        price: dish.price || null,
        uom: defaultUom,
        available_units: units
      };
    }));
  };

  const handleDishRowChange = (rowId, field, value) => {
    setNewDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (field === 'dish_name') {
        const foundItem = dishes.find(d => d.name.toLowerCase() === value.toLowerCase());
        const units = foundItem ? getItemUnits(foundItem) : ['Piece'];
        return { 
          ...r, 
          dish_name: value, 
          item_id: foundItem ? foundItem.id : r.item_id,
          image_url: foundItem ? foundItem.image_url : r.image_url,
          price: foundItem ? foundItem.price : r.price,
          available_units: units,
          uom: r.uom || units[0] || 'Piece'
        };
      }
      return { ...r, [field]: value };
    }));
  };

  // Submit New Request
  const handleSubmitNewRequest = async (e) => {
    e.preventDefault();
    if (submittingRequest || isSubmittingRef.current) return;

    const effectiveFrom = newFromBranch === 'Other' ? customFromBranch.trim() : newFromBranch;
    const effectiveTo = newToBranch === 'Other' ? customToBranch.trim() : newToBranch;

    if (!effectiveTo) {
      return toast.error('Please select or manually enter destination/supplying branch name.');
    }
    if (!effectiveFrom) {
      return toast.error('Please select or manually enter origin branch name.');
    }
    if (effectiveFrom.toLowerCase() === effectiveTo.toLowerCase()) {
      return toast.error('Origin and destination branch cannot be the same.');
    }
    if (!newNeededByTime) {
      return toast.error('Please specify needed-by delivery time.');
    }

    // Validate rows
    for (const [idx, r] of newDishRows.entries()) {
      if (!r.dish_name.trim()) {
        return toast.error(`Please select or enter dish name for row #${idx + 1}.`);
      }
      const qty = parseFloat(r.requested_qty);
      if (isNaN(qty) || qty <= 0) {
        return toast.error(`Requested quantity for row #${idx + 1} (${r.dish_name}) must be greater than 0.`);
      }
      if (!r.uom) {
        return toast.error(`Please select Unit of Measurement for row #${idx + 1}.`);
      }
    }

    try {
      isSubmittingRef.current = true;
      setSubmittingRequest(true);
      const isExternal = newToBranch === 'Other' || newFromBranch === 'Other';
      const res = await axios.post('/api/internal-branch/transfers', {
        from_branch: effectiveFrom,
        to_branch: effectiveTo,
        needed_by_time: newNeededByTime,
        notes: newNotes,
        is_external: isExternal,
        items: newDishRows.map(r => ({
          item_id: r.item_id,
          dish_name: r.dish_name,
          uom: r.uom,
          requested_qty: parseFloat(r.requested_qty),
          remarks: r.remarks,
          image_url: r.image_url || null,
          price: r.price ? parseFloat(r.price) : null
        }))
      });

      // Record local action to prevent duplicate toast from incoming socket broadcast
      if (res.data?.transfer_id) {
        localActionTransferIdsRef.current.set(`created_${res.data.transfer_id}`, Date.now());
      }
      if (res.data?.id) {
        localActionTransferIdsRef.current.set(`created_${res.data.id}`, Date.now());
      }

      toast.success(`Transfer request ${res.data.transfer_id} created successfully! Destination branch notified.`);
      
      // Reset form
      setNewDishRows([{ id: Date.now(), dish_name: '', item_id: null, uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'] }]);
      setCustomFromBranch('');
      setCustomToBranch('');
      setNewNeededByTime('');
      setNewNotes('');
      fetchStats();
      
      // Switch to master logs
      setActiveTab('logs');
    } catch (err) {
      console.error('Error submitting request:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to submit transfer request.';
      toast.error(msg);
    } finally {
      setSubmittingRequest(false);
      isSubmittingRef.current = false;
    }
  };

  // Open Dispatch Modal
  const openDispatchModal = (t) => {
    if (dispatching || isDispatchingRef.current) return;
    setDispatchModalTransfer(t);
    const initQtys = {};
    const initRemarks = {};
    (t.items || []).forEach(item => {
      initQtys[item.id] = item.sent_qty !== null && item.sent_qty !== undefined 
        ? item.sent_qty 
        : item.requested_qty;
      initRemarks[item.id] = item.remarks || '';
    });
    setDispatchItemQuantities(initQtys);
    setDispatchItemRemarks(initRemarks);
  };

  // Submit Dispatch
  const handleConfirmDispatch = async () => {
    if (!dispatchModalTransfer || dispatching || isDispatchingRef.current) return;
    try {
      isDispatchingRef.current = true;
      setDispatching(true);
      const itemsPayload = (dispatchModalTransfer.items || []).map(item => ({
        id: item.id,
        sent_qty: parseFloat(dispatchItemQuantities[item.id] || 0),
        remarks: dispatchItemRemarks[item.id] || ''
      }));

      await axios.put(`/api/internal-branch/transfers/${dispatchModalTransfer.id}/dispatch`, {
        items: itemsPayload
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`dispatched_${dispatchModalTransfer.transfer_id}`, Date.now());
      localActionTransferIdsRef.current.set(`dispatched_${dispatchModalTransfer.id}`, Date.now());

      toast.success(`Transfer ${dispatchModalTransfer.transfer_id} marked as Dispatched / In-Transit!`);
      setDispatchModalTransfer(null);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error dispatching transfer:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to dispatch transfer.';
      toast.error(msg);
    } finally {
      setDispatching(false);
      isDispatchingRef.current = false;
    }
  };

  // Open Receive Modal
  const openReceiveModal = (t) => {
    if (receiving || isReceivingRef.current) return;
    setReceiveModalTransfer(t);
    const initQtys = {};
    const initRemarks = {};
    (t.items || []).forEach(item => {
      initQtys[item.id] = item.received_qty !== null && item.received_qty !== undefined
        ? item.received_qty
        : (item.sent_qty !== null ? item.sent_qty : item.requested_qty);
      initRemarks[item.id] = item.remarks || '';
    });
    setReceiveItemQuantities(initQtys);
    setReceiveItemRemarks(initRemarks);
    setReceiveNotes('');
  };

  // Submit Receiving & Verification
  const handleConfirmReceive = async () => {
    if (!receiveModalTransfer || receiving || isReceivingRef.current) return;
    try {
      isReceivingRef.current = true;
      setReceiving(true);
      const itemsPayload = (receiveModalTransfer.items || []).map(item => ({
        id: item.id,
        received_qty: parseFloat(receiveItemQuantities[item.id] || 0),
        remarks: receiveItemRemarks[item.id] || ''
      }));

      await axios.put(`/api/internal-branch/transfers/${receiveModalTransfer.id}/receive`, {
        items: itemsPayload,
        notes: receiveNotes
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`received_${receiveModalTransfer.transfer_id}`, Date.now());
      localActionTransferIdsRef.current.set(`received_${receiveModalTransfer.id}`, Date.now());

      toast.success(`Transfer ${receiveModalTransfer.transfer_id} verified & marked as Completed!`);
      setReceiveModalTransfer(null);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error receiving transfer:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to receive and complete transfer.';
      toast.error(msg);
    } finally {
      setReceiving(false);
      isReceivingRef.current = false;
    }
  };

  // Cancel Transfer
  const handleCancelTransfer = async (transferId, trfCode) => {
    if (cancellingId) return;
    const reason = window.prompt(`Are you sure you want to cancel Transfer ${trfCode}? Please provide a reason:`);
    if (!reason || !reason.trim()) return;

    try {
      setCancellingId(transferId);
      await axios.put(`/api/internal-branch/transfers/${transferId}/cancel`, {
        reason: reason.trim()
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`cancelled_${trfCode}`, Date.now());
      localActionTransferIdsRef.current.set(`cancelled_${transferId}`, Date.now());

      toast.success(`Transfer ${trfCode} cancelled.`);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error cancelling transfer:', err);
      toast.error(err.response?.data?.error || 'Failed to cancel transfer');
    } finally {
      setCancellingId(null);
    }
  };

  // Calculate delivery delay helper
  const calculateDelay = (neededTimeStr, receivedAtStr, requestDateStr) => {
    if (!receivedAtStr || !neededTimeStr) return 'N/A';
    try {
      const recDate = new Date(receivedAtStr);
      // Construct target date with neededTimeStr (e.g. "14:30" or "02:30 PM")
      const timeParts = neededTimeStr.split(':');
      if (timeParts.length >= 2) {
        const targetDate = new Date(requestDateStr || receivedAtStr);
        targetDate.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);

        const diffMinutes = Math.round((recDate - targetDate) / (1000 * 60));
        if (diffMinutes > 10) {
          return `+${diffMinutes}m late`;
        } else if (diffMinutes < -10) {
          return `${Math.abs(diffMinutes)}m early`;
        } else {
          return 'On Time';
        }
      }
      return 'Completed';
    } catch {
      return 'Completed';
    }
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const flatRows = [];
      transfers.forEach(t => {
        const delayStr = calculateDelay(t.needed_by_time, t.received_at, t.request_date);
        const reqDateStr = new Date(t.request_date).toLocaleDateString();
        const reqTimeStr = new Date(t.request_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dispTimeStr = t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';
        const recTimeStr = t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A';

        if (t.items && t.items.length > 0) {
          t.items.forEach(it => {
            const reqQ = parseFloat(it.requested_qty || 0);
            const sentQ = it.sent_qty !== null ? parseFloat(it.sent_qty) : reqQ;
            const recQ = it.received_qty !== null ? parseFloat(it.received_qty) : (t.status === 'Completed' ? sentQ : 'N/A');
            const variance = it.variance_qty !== null ? parseFloat(it.variance_qty) : (typeof recQ === 'number' ? (recQ - sentQ) : 'N/A');

            flatRows.push({
              'Transfer ID': t.transfer_id,
              'Request Date': reqDateStr,
              'From Branch': t.from_branch,
              'To Branch': t.to_branch,
              'Dish Name': it.dish_name,
              'UOM': it.uom,
              'Requested Qty': reqQ,
              'Sent Qty': sentQ,
              'Received Qty': recQ,
              'Variance': variance,
              'Requested Time': reqTimeStr,
              'Needed-By Time': t.needed_by_time || 'N/A',
              'Dispatched Time': dispTimeStr,
              'Actual Received Time': recTimeStr,
              'Delivery Delay': delayStr,
              'Status': t.status,
              'Remarks': it.remarks || t.notes || ''
            });
          });
        } else {
          flatRows.push({
            'Transfer ID': t.transfer_id,
            'Request Date': reqDateStr,
            'From Branch': t.from_branch,
            'To Branch': t.to_branch,
            'Dish Name': 'No items',
            'UOM': '-',
            'Requested Qty': 0,
            'Sent Qty': 0,
            'Received Qty': 0,
            'Variance': 0,
            'Requested Time': reqTimeStr,
            'Needed-By Time': t.needed_by_time || 'N/A',
            'Dispatched Time': dispTimeStr,
            'Actual Received Time': recTimeStr,
            'Delivery Delay': delayStr,
            'Status': t.status,
            'Remarks': t.notes || ''
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(flatRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transfers');
      XLSX.writeFile(workbook, `Internal_Branch_Transfers_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel export downloaded!');
    } catch (err) {
      console.error('Failed to export Excel:', err);
      toast.error('Failed to export Excel.');
    }
  };

  // Export to PDF
  const handleExportPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf');
      await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });

      // Title & Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 297, 20, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('AL-RASAQ RESTAURANT — INTERNAL BRANCH TRANSFER MASTER LOGS', 14, 13);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleString()} | User: ${user?.name || user?.username} (${userRole})`, 190, 13);

      const tableData = [];
      transfers.forEach(t => {
        const delayStr = calculateDelay(t.needed_by_time, t.received_at, t.request_date);
        const reqDateStr = new Date(t.request_date).toLocaleDateString();
        const dishesSummary = (t.items || []).map(it => `${it.dish_name} (${it.requested_qty} ${it.uom})`).join(', ');

        tableData.push([
          t.transfer_id,
          reqDateStr,
          t.from_branch,
          t.to_branch,
          dishesSummary || 'None',
          t.needed_by_time || 'ASAP',
          t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
          t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
          delayStr,
          t.status,
          t.notes || ''
        ]);
      });

      doc.autoTable({
        startY: 26,
        head: [[
          'Transfer ID', 'Req Date', 'From', 'To', 'Dishes (Qty / Unit)', 
          'Needed By', 'Dispatched', 'Received', 'Delay', 'Status', 'Remarks'
        ]],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [227, 24, 55], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: {
          4: { cellWidth: 55 }
        }
      });

      doc.save(`Internal_Branch_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF export downloaded!');
    } catch (err) {
      console.error('Failed to export PDF:', err);
      toast.error('Failed to export PDF.');
    }
  };

  return (
    <div className="internal-branch-page" style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      
      {/* Top Banner / Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ArrowLeftRight size={28} color="var(--primary)" />
            Internal Branch Transfer Management
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: '#64748b' }}>
            Inter-branch dish request, central kitchen dispatch, and goods receiving verification system.
          </p>
        </div>

        {/* Audio Alert Toggle, Back to POS, & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate('/pos')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1.5px solid #2563eb',
              background: '#eff6ff',
              color: '#1d4ed8',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease'
            }}
            title="Return to Order Taking page"
          >
            <ArrowLeft size={16} /> Back to Order Taking
          </button>

          <button
            type="button"
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (!audioEnabled) playIncomingTransferAlert();
              toast.success(audioEnabled ? 'Audio alerts muted' : 'Audio alerts activated');
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: audioEnabled ? '#f0fdf4' : '#f8fafc',
              color: audioEnabled ? '#16a34a' : '#64748b',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Volume2 size={16} />
            {audioEnabled ? 'Audio Alerts: ON' : 'Audio Alerts: OFF'}
          </button>

          <button
            type="button"
            onClick={() => {
              fetchStats();
              fetchTransfers();
              toast.success('Transfers refreshed');
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Navigation Tabs with Badges */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 24, overflowX: 'auto', paddingBottom: 2 }}>
        
        {/* Tab 1: New Request */}
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: activeTab === 'new' ? 'var(--primary)' : '#64748b',
            borderBottom: activeTab === 'new' ? '3px solid var(--primary)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap'
          }}
        >
          <PlusCircle size={18} />
          New Transfer Request
        </button>

        {/* Tab 2: Incoming Requests (Supplying Branch) */}
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          style={{
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: activeTab === 'incoming' ? 'var(--primary)' : '#64748b',
            borderBottom: activeTab === 'incoming' ? '3px solid var(--primary)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap'
          }}
        >
          <Truck size={18} />
          Incoming Requests
          {stats.incoming_pending_count > 0 && (
            <span style={{
              background: '#dc2626',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 12
            }}>
              {stats.incoming_pending_count}
            </span>
          )}
        </button>

        {/* Tab 3: Goods Receiving & Verification (Requesting Branch) */}
        <button
          type="button"
          onClick={() => setActiveTab('receivals')}
          style={{
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: activeTab === 'receivals' ? 'var(--primary)' : '#64748b',
            borderBottom: activeTab === 'receivals' ? '3px solid var(--primary)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap'
          }}
        >
          <PackageCheck size={18} />
          Pending Receivals
          {stats.pending_receivals_count > 0 && (
            <span style={{
              background: '#2563eb',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 12
            }}>
              {stats.pending_receivals_count}
            </span>
          )}
        </button>

        {/* Tab 4: Master Logs & Reporting */}
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '12px 18px',
            fontSize: 14,
            fontWeight: 700,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: activeTab === 'logs' ? 'var(--primary)' : '#64748b',
            borderBottom: activeTab === 'logs' ? '3px solid var(--primary)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap'
          }}
        >
          <ClipboardList size={18} />
          Transfer Logs & Reporting
        </button>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: NEW TRANSFER REQUEST FORM
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'new' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
              Create Branch-to-Branch Food / Dish Request
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
              Submit a digitized request to another branch or Central Kitchen. Submissions are locked and dispatched electronically.
            </p>
          </div>

          <form onSubmit={handleSubmitNewRequest}>
            
            {/* Top Form Controls Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              
              {/* Request From */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Request From (Your Branch)
                </label>
                {isSuperUser ? (
                  <>
                    <select
                      value={newFromBranch}
                      onChange={e => setNewFromBranch(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}
                    >
                      {branches.map(b => (
                        <option key={`from-${b}`} value={b}>{b}</option>
                      ))}
                    </select>
                    {newFromBranch === 'Other' && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="text"
                          required
                          placeholder="Enter manual origin branch..."
                          value={customFromBranch}
                          onChange={e => setCustomFromBranch(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '9px 12px',
                            borderRadius: 8,
                            border: '1.5px solid #f59e0b',
                            fontSize: 13,
                            fontWeight: 600,
                            background: '#fffbeb'
                          }}
                        />
                        <span style={{ fontSize: 11, color: '#b45309', marginTop: 3, display: 'block' }}>
                          ✍️ Manual origin branch entered
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    disabled
                    value={newFromBranch}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 14, fontWeight: 600, color: '#475569' }}
                  />
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Auto-detected from logged-in account
                </span>
              </div>

              {/* Request To */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Request To (Destination / Supplier) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  required
                  value={newToBranch}
                  onChange={e => setNewToBranch(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}
                >
                  <option value="">-- Select Supplying Branch --</option>
                  {branches.filter(b => b !== newFromBranch).map(b => (
                    <option key={`to-${b}`} value={b}>{b}</option>
                  ))}
                </select>
                {newToBranch === 'Other' && (
                  <div style={{ marginTop: 8 }}>
                    <input
                      type="text"
                      required
                      placeholder="Enter destination / branch name manually..."
                      value={customToBranch}
                      onChange={e => setCustomToBranch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1.5px solid #f59e0b',
                        fontSize: 13,
                        fontWeight: 600,
                        background: '#fffbeb'
                      }}
                    />
                    <span style={{ fontSize: 11, color: '#b45309', marginTop: 3, display: 'block' }}>
                      ✍️ Manual destination entered
                    </span>
                  </div>
                )}
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Supplying branch or Central Kitchen
                </span>
              </div>

              {/* Request Date & Time (Server Time) */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Request Date & Time
                </label>
                <input
                  type="text"
                  disabled
                  value={`${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 14, fontWeight: 600, color: '#475569' }}
                />
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Server-generated timestamp
                </span>
              </div>

              {/* Needed-By Time */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Needed-By Time <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="time"
                  required
                  value={newNeededByTime}
                  onChange={e => setNewNeededByTime(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 14, fontWeight: 600 }}
                />
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Expected delivery deadline
                </span>
              </div>

            </div>

            {/* Multi-Dish Dynamic Item Builder */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>
                    Requested Food & Dishes
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Select from centralized restaurant menu or click <strong>"Open Menu Items"</strong> to browse visual cards
                  </span>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setShowMenuBrowser(true)}
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #3b82f6',
                      borderRadius: 6,
                      padding: '7px 16px',
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#1d4ed8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <BookOpen size={16} /> Open Menu Items
                  </button>
                </div>
              </div>

              {/* Scrollable Dish Rows List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
                {newDishRows.map((row, idx) => {
                  const rowUnits = row.available_units && row.available_units.length > 0 
                    ? row.available_units 
                    : ['Piece', 'Half', 'Full', 'Regular', 'Large', 'Kg'];

                  return (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(330px, 3.2fr) minmax(130px, 1.2fr) minmax(110px, 1fr) minmax(140px, 1.4fr) 40px',
                        gap: 12,
                        alignItems: 'center',
                        background: '#f8fafc',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0'
                      }}
                    >
                      {/* Dish Name Search / Dropdown with thumbnail (Clean, no inside button) */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                          Dish Name #{idx + 1}
                        </span>
                        <DishSearchDropdown
                          value={row.dish_name}
                          imageUrl={row.image_url}
                          dishes={dishes}
                          onSelect={(dish) => handleSelectDish(row.id, dish)}
                        />
                      </div>

                      {/* Dynamic Unit of Measurement (From Menu System) */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                          Unit (UOM)
                        </span>
                        <select
                          value={row.uom || rowUnits[0]}
                          onChange={e => handleDishRowChange(row.id, 'uom', e.target.value)}
                          style={{ width: '100%', padding: '9px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600, background: '#fff' }}
                        >
                          {rowUnits.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                      </div>

                      {/* Requested Quantity */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                          Requested Qty
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          placeholder="e.g. 2.5"
                          value={row.requested_qty}
                          onChange={e => handleDishRowChange(row.id, 'requested_qty', e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 600 }}
                        />
                      </div>

                      {/* Remarks */}
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 4 }}>
                          Remarks (Optional)
                        </span>
                        <input
                          type="text"
                          placeholder="e.g. Extra spicy, packaging"
                          value={row.remarks}
                          onChange={e => handleDishRowChange(row.id, 'remarks', e.target.value)}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                        />
                      </div>

                      {/* Remove Action */}
                      <div style={{ paddingTop: 18 }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveDishRow(row.id)}
                          disabled={newDishRows.length <= 1}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: newDishRows.length > 1 ? '#dc2626' : '#cbd5e1',
                            cursor: newDishRows.length > 1 ? 'pointer' : 'default',
                            padding: 4
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* "+ Add Another Item" Button positioned immediately below all dish rows */}
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleAddDishRow}
                  style={{
                    background: '#f8fafc',
                    border: '1.5px dashed #3b82f6',
                    borderRadius: 8,
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1d4ed8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                >
                  <PlusCircle size={16} /> + Add Another Item
                </button>
              </div>
            </div>

            {/* Optional Transfer Notes */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                General Request Remarks / Instructions (Optional)
              </label>
              <textarea
                rows={2}
                value={newNotes}
                onChange={e => setNewNotes(e.target.value)}
                placeholder="e.g. Driver arriving via van at 2:15 PM. Please pack in thermal crate."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={submittingRequest}
                onClick={() => {
                  setNewDishRows([{ id: Date.now(), dish_name: '', item_id: null, uom: 'Plate (P)', requested_qty: '', remarks: '' }]);
                  setNewNeededByTime('');
                  setNewNotes('');
                }}
              >
                Clear Form
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submittingRequest}
                style={{
                  padding: '10px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: submittingRequest ? 'not-allowed' : 'pointer',
                  opacity: submittingRequest ? 0.7 : 1,
                  pointerEvents: submittingRequest ? 'none' : 'auto'
                }}
              >
                {submittingRequest ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Submitting Transfer Request...
                  </>
                ) : (
                  <>
                    <Send size={16} /> Submit Transfer Request
                  </>
                )}
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: INCOMING BRANCH REQUESTS (SUPPLYING BRANCH DISPATCH)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'incoming' && (
        <div>
          <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                Incoming Branch Requests for Dispatch
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                Review requested items from other branches, specify actual dispatched quantities, and mark as in-transit.
              </p>
            </div>
            <span style={{ fontSize: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
              {transfers.filter(t => t.status === 'Pending').length} Pending Dispatch
            </span>
          </div>

          {loadingTransfers ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading incoming transfer requests...</div>
          ) : transfers.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 50, textAlign: 'center', color: '#64748b' }}>
              <Truck size={42} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a' }}>No Incoming Requests Right Now</h3>
              <p style={{ margin: 0, fontSize: 13 }}>
                Whenever another branch submits a request to your branch or Central Kitchen, it will appear here in real time with an audio alert.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {transfers.map(t => {
                const isPending = t.status === 'Pending';
                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#fff',
                      borderRadius: 12,
                      border: isPending ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                      padding: 18,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{t.transfer_id}</span>
                          <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                            {new Date(t.request_date).toLocaleString()}
                          </span>
                        </div>
                        <span style={{
                          padding: '3px 9px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background: isPending ? '#fef3c7' : '#dbeafe',
                          color: isPending ? '#92400e' : '#1e40af'
                        }}>
                          {t.status}
                        </span>
                      </div>

                      {/* Route */}
                      <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12.5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                          <span style={{ color: '#64748b' }}>Requesting Branch:</span>
                          <BranchBadge branch={t.from_branch} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#64748b' }}>Needed-By Time:</span>
                          <strong style={{ color: '#dc2626' }}>{t.needed_by_time || 'ASAP'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#64748b' }}>Requested By:</span>
                          <span>{t.requested_by_name}</span>
                        </div>
                      </div>

                      {/* Items Preview */}
                      <div style={{ marginBottom: 14 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                          Requested Dishes ({(t.items || []).length} items):
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {(t.items || []).slice(0, 3).map(it => (
                            <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 8px', background: '#f1f5f9', borderRadius: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 22, height: 22, borderRadius: 3, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                  {it.image_url ? (
                                    <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                  ) : (
                                    <Utensils size={12} color="#94a3b8" />
                                  )}
                                </div>
                                <span>{it.dish_name}</span>
                              </div>
                              <strong>{it.requested_qty} {it.uom}</strong>
                            </div>
                          ))}
                          {(t.items || []).length > 3 && (
                            <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center', display: 'block' }}>
                              + {(t.items || []).length - 3} more dishes...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action */}
                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, display: 'flex', gap: 8 }}>
                      {isPending ? (
                        <button
                          type="button"
                          onClick={() => openDispatchModal(t)}
                          style={{
                            flex: 1,
                            padding: '9px 14px',
                            background: '#f59e0b',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <Truck size={16} /> Open & Mark Dispatched
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDetailModalTransfer(t)}
                          className="btn btn-secondary"
                          style={{ flex: 1, padding: '8px 12px', fontSize: 12.5 }}
                        >
                          View Details ({t.status})
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: GOODS RECEIVING & VERIFICATION (REQUESTING BRANCH)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'receivals' && (
        <div>
          <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                Pending Goods Receivals & Verification
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                When food delivery arrives, verify received quantities item-by-item against dispatched amounts to record variances.
              </p>
            </div>
            <span style={{ fontSize: 12, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>
              {transfers.length} In-Transit Shipments
            </span>
          </div>

          {loadingTransfers ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>Loading pending receivals...</div>
          ) : transfers.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 50, textAlign: 'center', color: '#64748b' }}>
              <PackageCheck size={42} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a' }}>No Shipments In-Transit</h3>
              <p style={{ margin: 0, fontSize: 13 }}>
                When supplying branches mark requests as Dispatched, they will appear here ready for quantity inspection.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
              {transfers.map(t => (
                <div
                  key={t.id}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    border: '2px solid #2563eb',
                    padding: 18,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{t.transfer_id}</span>
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                          Dispatched: {t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                        </span>
                      </div>
                      <span style={{
                        padding: '3px 9px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        background: '#dbeafe',
                        color: '#1e40af'
                      }}>
                        In-Transit
                      </span>
                    </div>

                    {/* Route Details */}
                    <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ color: '#64748b' }}>Supplied By:</span>
                        <BranchBadge branch={t.to_branch} isExternal={t.is_external} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: '#64748b' }}>Dispatched By:</span>
                        <span>{t.dispatched_by_name || 'Kitchen Staff'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>Needed-By Time:</span>
                        <strong style={{ color: '#dc2626' }}>{t.needed_by_time || 'ASAP'}</strong>
                      </div>
                    </div>

                    {/* Dispatched Items */}
                    <div style={{ marginBottom: 14 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', display: 'block', marginBottom: 6 }}>
                        Dispatched Checklist ({(t.items || []).length} items):
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(t.items || []).map(it => (
                          <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 8px', background: '#eff6ff', borderRadius: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ width: 22, height: 22, borderRadius: 3, background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                {it.image_url ? (
                                  <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                ) : (
                                  <Utensils size={12} color="#1d4ed8" />
                                )}
                              </div>
                              <span>{it.dish_name}</span>
                            </div>
                            <strong>
                              Sent: {it.sent_qty !== null ? it.sent_qty : it.requested_qty} {it.uom}
                            </strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => openReceiveModal(t)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      <PackageCheck size={16} /> Verify & Confirm Receiving
                    </button>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: MASTER LOGS & REPORTING
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          
          {/* Header & Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                Transfer Master Logs & Reporting
              </h2>
              <span style={{ fontSize: 12.5, color: '#64748b' }}>
                Showing {transfers.length} recorded transfers across branches
              </span>
            </div>

            {/* Export Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <FileSpreadsheet size={15} color="#16a34a" /> Export Excel
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                style={{
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <FileText size={15} color="#dc2626" /> Export PDF
              </button>
            </div>
          </div>

          {/* Quick Filter Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 18, background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            
            {/* From Branch */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>From Branch</label>
              <select
                value={filterFromBranch}
                onChange={e => setFilterFromBranch(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="All">All Branches</option>
                {branches.map(b => (
                  <option key={`ff-${b}`} value={b}>{b}</option>
                ))}
              </select>
              {filterFromBranch === 'Other' && (
                <input
                  type="text"
                  placeholder="Enter custom branch..."
                  value={customFilterFromBranch}
                  onChange={e => setCustomFilterFromBranch(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1.5px solid #f59e0b',
                    fontSize: 12,
                    background: '#fffbeb',
                    fontWeight: 600
                  }}
                />
              )}
            </div>

            {/* To Branch */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>To Branch</label>
              <select
                value={filterToBranch}
                onChange={e => setFilterToBranch(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="All">All Branches</option>
                {branches.map(b => (
                  <option key={`ft-${b}`} value={b}>{b}</option>
                ))}
              </select>
              {filterToBranch === 'Other' && (
                <input
                  type="text"
                  placeholder="Enter custom branch..."
                  value={customFilterToBranch}
                  onChange={e => setCustomFilterToBranch(e.target.value)}
                  style={{
                    width: '100%',
                    marginTop: 6,
                    padding: '5px 8px',
                    borderRadius: 6,
                    border: '1.5px solid #f59e0b',
                    fontSize: 12,
                    background: '#fffbeb',
                    fontWeight: 600
                  }}
                />
              )}
            </div>

            {/* Status */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="All">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In-Transit">In-Transit</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Quick Period */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Period</label>
              <select
                value={filterPeriod}
                onChange={e => setFilterPeriod(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="weekly">Last 7 Days</option>
                <option value="monthly">Last 30 Days</option>
              </select>
            </div>

            {/* Search Input */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Search Dish / ID</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="ID, dish, branch..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ width: '100%', padding: '6px 8px 6px 26px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
                <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 9 }} />
              </div>
            </div>

          </div>

          {/* Master Logs Table */}
          {loadingTransfers ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>Loading logs...</div>
          ) : transfers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No transfers matching filters.</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '10px 12px' }}>Transfer ID</th>
                    <th style={{ padding: '10px 12px' }}>Date</th>
                    <th style={{ padding: '10px 12px' }}>From → To</th>
                    <th style={{ padding: '10px 12px' }}>Dishes & Quantities</th>
                    <th style={{ padding: '10px 12px' }}>Needed By</th>
                    <th style={{ padding: '10px 12px' }}>Dispatched</th>
                    <th style={{ padding: '10px 12px' }}>Received</th>
                    <th style={{ padding: '10px 12px' }}>Delay</th>
                    <th style={{ padding: '10px 12px' }}>Variance</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map(t => {
                    const delay = calculateDelay(t.needed_by_time, t.received_at, t.request_date);
                    const totalReq = (t.items || []).reduce((sum, it) => sum + parseFloat(it.requested_qty || 0), 0);
                    const totalSent = (t.items || []).reduce((sum, it) => sum + parseFloat(it.sent_qty !== null ? it.sent_qty : it.requested_qty), 0);
                    const totalRec = (t.items || []).reduce((sum, it) => sum + (it.received_qty !== null ? parseFloat(it.received_qty) : 0), 0);
                    const varianceVal = t.status === 'Completed' ? (totalRec - totalSent) : 0;

                    let statusBg = '#f1f5f9';
                    let statusColor = '#475569';
                    if (t.status === 'Pending') { statusBg = '#fef3c7'; statusColor = '#92400e'; }
                    else if (t.status === 'In-Transit') { statusBg = '#dbeafe'; statusColor = '#1e40af'; }
                    else if (t.status === 'Completed') { statusBg = '#dcfce7'; statusColor = '#166534'; }
                    else if (t.status === 'Cancelled') { statusBg = '#fee2e2'; statusColor = '#991b1b'; }

                    return (
                      <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                          {t.transfer_id}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(t.request_date).toLocaleDateString()}
                          <span style={{ fontSize: 10.5, display: 'block', color: '#94a3b8' }}>
                            {new Date(t.request_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, minWidth: 130 }}>
                          <span title={t.from_branch} style={{ fontWeight: 700, color: '#0f172a' }}>
                            {getShortBranchName(t.from_branch)}
                          </span>
                          <span style={{ color: '#94a3b8', margin: '0 6px' }}>→</span>
                          <span title={t.to_branch} style={{ fontWeight: 700, color: '#0f172a' }}>
                            {getShortBranchName(t.to_branch)}
                          </span>
                          {t.is_external && (
                            <span style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              background: '#fff7ed',
                              color: '#c2410c',
                              padding: '1.5px 5px',
                              borderRadius: 4,
                              border: '1px solid #fed7aa',
                              whiteSpace: 'nowrap'
                            }} title={t.to_branch}>
                              Ext
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {(t.items || []).map((it, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', marginBottom: 2 }}>
                              <div style={{ width: 18, height: 18, borderRadius: 3, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                {it.image_url ? (
                                  <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                ) : (
                                  <Utensils size={10} color="#94a3b8" />
                                )}
                              </div>
                              <span style={{ fontWeight: 600 }}>{it.dish_name}</span>: {it.requested_qty} {it.uom}
                              {it.sent_qty !== null && <span style={{ color: '#2563eb', marginLeft: 4 }}>(Sent: {it.sent_qty})</span>}
                              {it.received_qty !== null && <span style={{ color: '#16a34a', marginLeft: 4 }}>(Rec: {it.received_qty})</span>}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap', minWidth: 100 }}>
                          {t.needed_by_time || 'ASAP'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: delay.includes('late') ? '#dc2626' : (delay === 'On Time' ? '#16a34a' : '#64748b'), whiteSpace: 'nowrap' }}>
                          {delay}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: varianceVal < 0 ? '#dc2626' : (varianceVal > 0 ? '#2563eb' : '#64748b'), whiteSpace: 'nowrap' }}>
                          {t.status === 'Completed' ? (
                            varianceVal === 0 ? '0 (Exact)' : `${varianceVal > 0 ? '+' : ''}${varianceVal.toFixed(2)}`
                          ) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{ background: statusBg, color: statusColor, padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                            {t.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => setDetailModalTransfer(t)}
                            style={{
                              background: '#f1f5f9',
                              border: 'none',
                              padding: '5px 9px',
                              borderRadius: 4,
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              color: '#334155'
                            }}
                          >
                            Details
                          </button>

                          <button
                            type="button"
                            onClick={() => printTransferSlip(t)}
                            title="Print Transfer Slip"
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              padding: '5px 7px',
                              borderRadius: 4,
                              fontSize: 11.5,
                              cursor: 'pointer',
                              color: '#334155',
                              marginLeft: 4,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 2
                            }}
                          >
                            <Printer size={13} />
                          </button>

                          {t.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => handleCancelTransfer(t.id, t.transfer_id)}
                              disabled={cancellingId === t.id}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                padding: '5px 8px',
                                color: cancellingId === t.id ? '#94a3b8' : '#dc2626',
                                fontSize: 11.5,
                                fontWeight: 600,
                                cursor: cancellingId === t.id ? 'not-allowed' : 'pointer',
                                marginLeft: 4,
                                opacity: cancellingId === t.id ? 0.6 : 1
                              }}
                            >
                              {cancellingId === t.id ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DISPATCH MODAL (SUPPLYING BRANCH)
      ───────────────────────────────────────────────────────────── */}
      {dispatchModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setDispatchModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 660, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header (Fixed) */}
            <div style={{ flexShrink: 0, background: '#f59e0b', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  Dispatch Request — {dispatchModalTransfer.transfer_id}
                </h3>
                <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>Request from:</span> <BranchBadge branch={dispatchModalTransfer.from_branch} /> · <span>Needed By: {dispatchModalTransfer.needed_by_time || 'ASAP'}</span>
                </span>
              </div>
              <button onClick={() => setDispatchModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Please review requested items and specify the <strong>actual dispatched quantity</strong> for each item:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(dispatchModalTransfer.items || []).map((it, idx) => (
                  <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, alignItems: 'center', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {it.image_url ? (
                          <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Utensils size={16} color="#94a3b8" />
                        )}
                      </div>
                      <div>
                        <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>{it.dish_name}</strong>
                        <span style={{ fontSize: 11.5, color: '#64748b' }}>
                          Requested: <strong>{it.requested_qty} {it.uom}</strong>
                        </span>
                      </div>
                    </div>

                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Sent Qty</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={dispatchItemQuantities[it.id] ?? it.requested_qty}
                        onChange={e => setDispatchItemQuantities({ ...dispatchItemQuantities, [it.id]: e.target.value })}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                      />
                    </div>

                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Remarks</span>
                      <input
                        type="text"
                        placeholder="e.g. 0.95 Kg"
                        value={dispatchItemRemarks[it.id] ?? ''}
                        onChange={e => setDispatchItemRemarks({ ...dispatchItemRemarks, [it.id]: e.target.value })}
                        style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sticky Footer (Buttons ALWAYS visible) */}
            <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => printTransferSlip(dispatchModalTransfer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#334155'
                }}
                title="Print 80mm Transfer Voucher"
              >
                <Printer size={15} /> Print Slip
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={dispatching}
                  onClick={() => setDispatchModalTransfer(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDispatch}
                  disabled={dispatching}
                  style={{
                    padding: '9px 20px',
                    background: dispatching ? '#94a3b8' : '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: dispatching ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: dispatching ? 0.7 : 1,
                    pointerEvents: dispatching ? 'none' : 'auto'
                  }}
                >
                  {dispatching ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Dispatching Transfer...
                    </>
                  ) : (
                    <>
                      <Truck size={16} /> Mark Dispatched / Sent
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          RECEIVING & VERIFICATION MODAL (REQUESTING BRANCH)
      ───────────────────────────────────────────────────────────── */}
      {receiveModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setReceiveModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 720, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header (Fixed) */}
            <div style={{ flexShrink: 0, background: '#16a34a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  Goods Verification & Receiving — {receiveModalTransfer.transfer_id}
                </h3>
                <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>Supplied by:</span> <BranchBadge branch={receiveModalTransfer.to_branch} isExternal={receiveModalTransfer.is_external} /> · <span>Dispatched at: {receiveModalTransfer.dispatched_at ? new Date(receiveModalTransfer.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                </span>
              </div>
              <button onClick={() => setReceiveModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Verify incoming dishes. The system automatically calculates <strong>Sent vs Received</strong> variances:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {(receiveModalTransfer.items || []).map((it, idx) => {
                  const sentQ = it.sent_qty !== null ? parseFloat(it.sent_qty) : parseFloat(it.requested_qty);
                  const recQ = parseFloat(receiveItemQuantities[it.id] !== undefined ? receiveItemQuantities[it.id] : sentQ) || 0;
                  const variance = recQ - sentQ;

                  return (
                    <div key={it.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr', gap: 10, alignItems: 'center', background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {it.image_url ? (
                            <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                          ) : (
                            <Utensils size={16} color="#94a3b8" />
                          )}
                        </div>
                        <div>
                          <strong style={{ fontSize: 13.5, color: '#0f172a', display: 'block' }}>{it.dish_name}</strong>
                          <span style={{ fontSize: 11.5, color: '#64748b' }}>
                            Sent: <strong>{sentQ} {it.uom}</strong> (Req: {it.requested_qty})
                          </span>
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Received Qty</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={receiveItemQuantities[it.id] ?? sentQ}
                          onChange={e => setReceiveItemQuantities({ ...receiveItemQuantities, [it.id]: e.target.value })}
                          style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Variance</span>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: variance < 0 ? '#dc2626' : (variance > 0 ? '#2563eb' : '#16a34a') }}>
                          {variance === 0 ? '0.00 (Match)' : `${variance > 0 ? '+' : ''}${variance.toFixed(2)} ${it.uom}`}
                        </div>
                      </div>

                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Item Remarks</span>
                        <input
                          type="text"
                          placeholder="e.g. short 1 pack, damaged"
                          value={receiveItemRemarks[it.id] ?? ''}
                          onChange={e => setReceiveItemRemarks({ ...receiveItemRemarks, [it.id]: e.target.value })}
                          style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Overall Receiving Remarks */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Overall Delivery Remarks (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Driver delayed by 15 mins due to rain, packaging intact."
                  value={receiveNotes}
                  onChange={e => setReceiveNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Sticky Footer (Buttons ALWAYS visible) */}
            <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => printTransferSlip(receiveModalTransfer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#334155'
                }}
                title="Print 80mm Transfer Voucher"
              >
                <Printer size={15} /> Print Slip
              </button>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={receiving}
                  onClick={() => setReceiveModalTransfer(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReceive}
                  disabled={receiving}
                  style={{
                    padding: '9px 20px',
                    background: receiving ? '#94a3b8' : '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: receiving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    opacity: receiving ? 0.7 : 1,
                    pointerEvents: receiving ? 'none' : 'auto'
                  }}
                >
                  {receiving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Confirming & Closing...
                    </>
                  ) : (
                    <>
                      <PackageCheck size={16} /> Confirm & Close Request
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DETAIL / SUMMARY MODAL
      ───────────────────────────────────────────────────────────── */}
      {detailModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setDetailModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 640, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flexShrink: 0, background: '#0f172a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Transfer Summary — {detailModalTransfer.transfer_id}</h3>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Status: {detailModalTransfer.status}</span>
              </div>
              <button onClick={() => setDetailModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 12.5 }}>
                <div><span style={{ color: '#64748b' }}>From Branch:</span> <BranchBadge branch={detailModalTransfer.from_branch} /></div>
                <div><span style={{ color: '#64748b' }}>To Branch:</span> <BranchBadge branch={detailModalTransfer.to_branch} isExternal={detailModalTransfer.is_external} /></div>
                <div><span style={{ color: '#64748b' }}>Requested Time:</span> {new Date(detailModalTransfer.request_date).toLocaleString()}</div>
                <div><span style={{ color: '#64748b' }}>Needed-By Time:</span> <strong style={{ color: '#dc2626' }}>{detailModalTransfer.needed_by_time || 'ASAP'}</strong></div>
                <div><span style={{ color: '#64748b' }}>Dispatched At:</span> {detailModalTransfer.dispatched_at ? new Date(detailModalTransfer.dispatched_at).toLocaleString() : 'Pending'}</div>
                <div><span style={{ color: '#64748b' }}>Received At:</span> {detailModalTransfer.received_at ? new Date(detailModalTransfer.received_at).toLocaleString() : 'Pending'}</div>
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Transferred Dishes:</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {(detailModalTransfer.items || []).map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: '#f1f5f9', borderRadius: 6, fontSize: 12.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 4, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {it.image_url ? (
                          <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                          <Utensils size={13} color="#94a3b8" />
                        )}
                      </div>
                      <span><strong>{it.dish_name}</strong> ({it.uom})</span>
                    </div>
                    <span>
                      Req: {it.requested_qty} | Sent: {it.sent_qty !== null ? it.sent_qty : '-'} | Rec: {it.received_qty !== null ? it.received_qty : '-'}
                      {it.variance_qty !== null && <strong style={{ marginLeft: 6, color: it.variance_qty < 0 ? '#dc2626' : '#16a34a' }}>(Var: {it.variance_qty})</strong>}
                    </span>
                  </div>
                ))}
              </div>

              {detailModalTransfer.notes && (
                <div style={{ background: '#fef3c7', padding: 10, borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                  <strong>Notes:</strong> {detailModalTransfer.notes}
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => printTransferSlip(detailModalTransfer)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#334155'
                }}
                title="Print 80mm Transfer Voucher"
              >
                <Printer size={15} /> Print Slip
              </button>

              <button type="button" className="btn btn-secondary" onClick={() => setDetailModalTransfer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          BROWSE VISUAL MENU CATALOG MODAL
      ───────────────────────────────────────────────────────────── */}
      {showMenuBrowser && (
        <div className="modal-overlay" style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(3px)' }} onClick={() => setShowMenuBrowser(false)}>
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 960,
              width: '95vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              borderRadius: 14,
              overflow: 'hidden',
              background: '#fff'
            }}
          >
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#dbeafe', color: '#1e40af', padding: 8, borderRadius: 8 }}>
                  <BookOpen size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    Restaurant Menu Catalog
                  </h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                    Browse dishes & click to add them directly into your Internal Branch Transfer request
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMenuBrowser(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Search & Categories Bar */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 11 }} />
                  <input
                    type="text"
                    placeholder="Search dishes by name..."
                    value={menuBrowserSearch}
                    onChange={e => setMenuBrowserSearch(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 36px',
                      borderRadius: 8,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 13,
                      fontWeight: 600
                    }}
                  />
                </div>
                {menuBrowserSearch && (
                  <button
                    onClick={() => setMenuBrowserSearch('')}
                    style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: '#475569' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                {allMenuCategories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setMenuBrowserCategory(cat)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      border: menuBrowserCategory === cat ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                      background: menuBrowserCategory === cat ? '#2563eb' : '#f8fafc',
                      color: menuBrowserCategory === cat ? '#fff' : '#475569',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Dishes Grid */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {loadingDishes ? (
                <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>Loading menu items...</div>
              ) : filteredBrowserDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                  <Utensils size={40} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#334155' }}>No dishes found</p>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Try adjusting your search query or selected category</span>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 14
                }}>
                  {filteredBrowserDishes.map(d => {
                    const existingRow = newDishRows.find(r => r.item_id === d.id || (r.dish_name && r.dish_name.toLowerCase() === d.name.toLowerCase()));
                    const isAdded = Boolean(existingRow && existingRow.dish_name);

                    return (
                      <div
                        key={d.id}
                        style={{
                          background: '#fff',
                          borderRadius: 10,
                          border: isAdded ? '2px solid #22c55e' : '1px solid #e2e8f0',
                          boxShadow: isAdded ? '0 0 0 1px #22c55e' : '0 1px 3px rgba(0,0,0,0.05)',
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Image container */}
                        <div style={{
                          height: 110,
                          background: '#f8fafc',
                          position: 'relative',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden'
                        }}>
                          {d.image_url ? (
                            <img
                              src={d.image_url}
                              alt={d.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <Utensils size={32} color="#cbd5e1" />
                          )}
                          {isAdded && (
                            <span style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              background: '#22c55e',
                              color: '#fff',
                              fontSize: 10.5,
                              fontWeight: 800,
                              padding: '2px 7px',
                              borderRadius: 12,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 3,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                            }}>
                              <Check size={11} /> In Request
                            </span>
                          )}
                        </div>

                        {/* Body */}
                        <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3, marginBottom: 4 }}>
                              {d.name}
                            </div>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#2563eb' }}>
                              SAR {parseFloat(d.price || 0).toFixed(2)}
                            </div>
                          </div>

                          {/* Action */}
                          <div style={{ marginTop: 10 }}>
                            {isAdded ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '3px 6px' }}>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQtyFromBrowser(d, -1)}
                                  style={{ background: '#fff', border: '1px solid #86efac', borderRadius: 4, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}
                                  title="Decrease quantity"
                                >
                                  -
                                </button>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#166534' }}>
                                  Qty: {existingRow.requested_qty || 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateQtyFromBrowser(d, 1)}
                                  style={{ background: '#fff', border: '1px solid #86efac', borderRadius: 4, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}
                                  title="Increase quantity"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddDishFromBrowser(d)}
                                style={{
                                  width: '100%',
                                  padding: '6px 8px',
                                  background: '#eff6ff',
                                  border: '1.5px solid #3b82f6',
                                  borderRadius: 6,
                                  color: '#1d4ed8',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 5
                                }}
                              >
                                <PlusCircle size={13} /> Add to Transfer
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                <strong>{newDishRows.filter(r => r.dish_name.trim()).length}</strong> dishes currently in transfer request
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowMenuBrowser(false)}
                style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <CheckCircle2 size={16} />
                Done & Review Request Form
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

