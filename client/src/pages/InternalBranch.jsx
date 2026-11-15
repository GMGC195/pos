import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '../api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { usePOS } from '../contexts/POSContext';
import { getMenuItems as getCachedMenuItems } from '../utils/db';
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
  ArrowLeft,
  ArrowRight,
  User,
  Play,
  Edit,
  Edit3,
  Eye,
  History,
  Timer,
  Lock,
  CheckCheck,
  Save
} from 'lucide-react';

const STANDARD_BRANCH_NAMES = ['branch 1', 'branch 2', 'branch 3', 'central kitchen'];
const INITIAL_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3', 'Central Kitchen', 'Other'];

// Normalize legacy or user branch names
function normalizeBranchName(name) {
  if (!name) return 'Branch 1';
  const lower = String(name).trim().toLowerCase();
  if (lower === 'restaurant 1' || lower === 'r1') return 'Branch 1';
  if (lower === 'restaurant 2' || lower === 'r2') return 'Branch 2';
  if (lower === 'restaurant 3' || lower === 'r3') return 'Branch 3';
  return String(name).trim();
}

// Sanitize branches list: remove Restaurant 1 & 3 duplicates, keep Other at end
function sanitizeBranchList(rawList) {
  if (!Array.isArray(rawList)) return INITIAL_BRANCHES;
  const cleaned = rawList
    .filter(b => typeof b === 'string' && b.trim())
    .map(b => normalizeBranchName(b))
    .filter(b => {
      const lower = b.toLowerCase();
      return !lower.includes('restaurant') && lower !== 'all';
    });
  const unique = Array.from(new Set(cleaned));
  const withoutOther = unique.filter(b => b.toLowerCase() !== 'other');
  return [...withoutOther, 'Other'];
}

function isExternalBranch(name) {
  if (!name) return false;
  return !STANDARD_BRANCH_NAMES.includes(name.trim().toLowerCase());
}

// Short format for branch names: Branch 1 -> B1, Branch 2 -> B2, Branch 3 -> B3, Central Kitchen -> CK
function getShortBranchName(name) {
  if (!name) return '-';
  const trimmed = normalizeBranchName(name);
  const lower = trimmed.toLowerCase();
  if (lower === 'branch 1') return 'B1';
  if (lower === 'branch 2') return 'B2';
  if (lower === 'branch 3') return 'B3';
  if (lower === 'central kitchen') return 'CK';
  return trimmed;
}

// Standard units in exact required order: 1. KG, 2. Pices, 3. Liters, 4. Pantry, 5. Parcel, 6. Packet, 7. Box
const STANDARD_TOP_UNITS = ['KG', 'Pices', 'Liters', 'Pantry', 'Parcel', 'Packet', 'Box'];

function getItemUnits(dish) {
  const units = [...STANDARD_TOP_UNITS];
  if (!dish) return units;

  const rawSizes = dish.size_options || [];
  if (Array.isArray(rawSizes)) {
    rawSizes.forEach(s => {
      if (!s) return;
      const clean = (typeof s === 'string' ? (s.includes(':') ? s.split(':')[0] : s) : String(s)).trim();
      if (clean && !units.some(u => u.toLowerCase() === clean.toLowerCase())) {
        units.push(clean);
      }
    });
  }
  if (dish.unit && typeof dish.unit === 'string' && dish.unit.trim()) {
    const cleanUnit = dish.unit.trim();
    if (!units.some(u => u.toLowerCase() === cleanUnit.toLowerCase())) {
      units.push(cleanUnit);
    }
  }
  return units;
}

// Live Countdown Timer Badge based on server expected_delivery_at timestamp
function DeliveryTimerBadge({ expectedDeliveryAt, status }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!['Pending', 'In Progress', 'Ready for Dispatch'].includes(status)) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (!expectedDeliveryAt) return null;

  const target = new Date(expectedDeliveryAt).getTime();
  const diffMs = target - now;
  const isOverdue = diffMs <= 0;
  const absSec = Math.floor(Math.abs(diffMs) / 1000);
  const m = Math.floor(absSec / 60);
  const s = absSec % 60;
  const formatted = `${m}m ${s < 10 ? '0' : ''}${s}s`;

  if (['Dispatched', 'In-Transit'].includes(status)) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#eff6ff',
        color: '#1d4ed8',
        border: '1px solid #bfdbfe',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700
      }}>
        <Truck size={12} /> Dispatched / In-Transit
      </span>
    );
  }

  if (['Partially Received', 'Fully Received', 'Completed'].includes(status)) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#f0fdf4',
        color: '#166534',
        border: '1px solid #bbf7d0',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700
      }}>
        <CheckCircle2 size={12} /> Received / Completed
      </span>
    );
  }

  if (['Cancelled'].includes(status)) return null;

  if (isOverdue) {
    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        background: '#fef2f2',
        color: '#b91c1c',
        border: '1.5px solid #f87171',
        padding: '2.5px 8px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 800
      }}>
        <AlertTriangle size={12} color="#dc2626" /> Overdue by {formatted}
      </span>
    );
  }

  const isWarning = m < 10;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      background: isWarning ? '#fffbeb' : '#f0fdf4',
      color: isWarning ? '#b45309' : '#15803d',
      border: `1px solid ${isWarning ? '#fcd34d' : '#86efac'}`,
      padding: '2.5px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700
    }}>
      <Clock size={12} /> {formatted} remaining
    </span>
  );
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
      <td style="width: 44%; padding: 4px 2px; font-weight: normal; border-bottom: 1px dashed #cbd5e1; word-break: break-word;">${idx + 1}. ${it.dish_name}</td>
      <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.uom || 'Piece'}</td>
      <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1; font-weight: 600;">${it.requested_qty}</td>
      <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.sent_qty !== null && it.sent_qty !== undefined ? it.sent_qty : '-'}</td>
      <td style="width: 14%; padding: 4px 2px; text-align: right; border-bottom: 1px dashed #cbd5e1;">${it.received_qty !== null && it.received_qty !== undefined ? it.received_qty : '-'}</td>
    </tr>
  `).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Transfer Slip - ${t.transfer_id}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          body {
            width: 100%;
            max-width: 72mm;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 2px 20px 2px 4px;
            line-height: 1.25;
            text-rendering: geometricPrecision;
            overflow-x: hidden;
            word-break: break-word;
          }
          .header {
            text-align: center;
            border-bottom: 1.5px dashed #000;
            padding-bottom: 4px;
            margin-bottom: 4px;
          }
          .header .header-brand {
            margin: 0 0 2px;
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #000;
          }
          .header .header-title {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #000;
          }
          .header .header-id {
            margin: 1px 0;
            font-size: 11.5px;
            font-weight: 700;
            color: #000;
          }
          .header .header-demand {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #000;
          }
          .header .header-route {
            margin: 1px 0 2px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            word-break: break-word;
            color: #000;
          }
          .meta-table {
            width: 100%;
            table-layout: fixed;
            font-size: 10.5px;
            margin-bottom: 4px;
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 1px 0;
            word-break: break-word;
            color: #000;
          }
          .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 10.5px;
            margin: 4px 0;
          }
          .items-table th {
            border-bottom: 1.5px solid #000;
            border-top: 1.5px solid #000;
            padding: 3px 2px;
            font-weight: 700;
            font-size: 10.5px;
            color: #000;
          }
          .footer {
            margin-top: 5px;
            border-top: 1px dashed #000;
            padding-top: 3px;
            padding-bottom: 0;
            margin-bottom: 0;
            font-size: 10px;
            text-align: center;
            color: #000;
          }
          .sign-area {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 2px;
          }
          .sign-box {
            border-top: 1px solid #000;
            width: 44%;
            text-align: center;
            font-size: 9px;
            padding-top: 2px;
            font-weight: normal;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-brand">AL RAWAQ RESTAURANT</div>
          <div class="header-title">INTERNAL BRANCH TRANSFER</div>
          <div class="header-id">ID: ${t.transfer_id}</div>
          <div class="header-demand">DEMAND FROM: ${(t.from_branch || '').toUpperCase()}</div>
          <div class="header-route">${(t.from_branch || 'BRANCH 1').toUpperCase()} → TO → ${(t.to_branch || 'BRANCH 2').toUpperCase()}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td style="width: 52%;"><strong>Date:</strong> ${reqDate} ${reqTime}</td>
            <td style="width: 48%; text-align: right;"><strong>Status:</strong> ${t.status}</td>
          </tr>
          <tr>
            <td style="width: 52%;"><strong>Day:</strong> ${t.delivery_day || 'Today'}</td>
            <td style="width: 48%; text-align: right;"><strong>Needed By:</strong> ${t.needed_by_time || 'ASAP'}</td>
          </tr>
          <tr>
            <td style="width: 52%;"><strong>Req By:</strong> ${t.requested_by_name || 'Staff'}</td>
            <td style="width: 48%; text-align: right;">${t.dispatched_at ? `<strong>Dispatched:</strong> ${dispTime}` : ''}</td>
          </tr>
          ${t.dispatched_by_name ? `<tr><td style="width: 52%;"><strong>Disp By:</strong> ${t.dispatched_by_name}</td><td style="width: 48%; text-align: right;">${t.received_by_name ? `<strong>Rec By:</strong> ${t.received_by_name}` : ''}</td></tr>` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 44%; text-align: left;">Dish</th>
              <th style="width: 14%; text-align: center;">Unit</th>
              <th style="width: 14%; text-align: center;">Req</th>
              <th style="width: 14%; text-align: center;">Sent</th>
              <th style="width: 14%; text-align: right;">Rec</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        ${t.notes ? `<div style="font-size: 10px; margin-top: 4px; padding: 3px 5px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; word-break: break-word; color: #000;"><strong>Notes:</strong> ${t.notes}</div>` : ''}

        <div class="sign-area">
          <div class="sign-box">Dispatcher Signature</div>
          <div class="sign-box">Receiver Signature</div>
        </div>

        <div class="footer">
          <p style="margin: 0; font-weight: normal; color: #000;">Verified via Electronic POS System</p>
          <p style="margin: 2px 0 0; font-size: 11px; font-weight: normal; color: #000;">Printed: ${new Date().toLocaleString()}</p>
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

// Thermal / Standard Slip: Accepted Items Voucher (Incoming Requests)
function printAcceptedItemsSlip(t) {
  if (!t) return;
  const printWindow = window.open('', '_blank', 'width=460,height=700');
  if (!printWindow) {
    toast.error('Popup blocked. Please allow popups to print slip.');
    return;
  }

  const items = t.items || [];
  const itemsHtml = items.map((it, idx) => {
    const isAcc = it.item_status === 'Accepted';
    const isRej = it.item_status === 'Rejected';
    const reqQ = parseFloat(it.requested_qty || 0);
    const accQ = it.accepted_qty !== null && it.accepted_qty !== undefined ? parseFloat(it.accepted_qty) : reqQ;

    let statusCol = isAcc ? 'Acc' : (isRej ? 'Rej' : 'Pen');

    return `
      <tr>
        <td style="width: 44%; padding: 4px 2px; font-weight: normal; border-bottom: 1px dashed #cbd5e1; word-break: break-word;">
          ${idx + 1}. ${it.dish_name}
        </td>
        <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.uom || 'Piece'}</td>
        <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1; font-weight: 600;">${reqQ}</td>
        <td style="width: 14%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1; font-weight: bold; color: ${isAcc ? '#16a34a' : (isRej ? '#dc2626' : '#000')}">
          ${isAcc ? accQ : (isRej ? '0' : '-')}
        </td>
        <td style="width: 14%; padding: 4px 2px; text-align: right; border-bottom: 1px dashed #cbd5e1; font-size: 10.5px; font-weight: bold; color: ${isAcc ? '#16a34a' : (isRej ? '#dc2626' : '#d97706')}">
          ${statusCol}
        </td>
      </tr>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Accepted Items Slip - ${t.transfer_id}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          body {
            width: 100%;
            max-width: 72mm;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 2px 20px 2px 4px;
            line-height: 1.25;
            text-rendering: geometricPrecision;
            overflow-x: hidden;
            word-break: break-word;
          }
          .header {
            text-align: center;
            border-bottom: 1.5px dashed #000;
            padding-bottom: 4px;
            margin-bottom: 4px;
          }
          .header .header-brand {
            margin: 0 0 2px;
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #000;
          }
          .header .header-title {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #000;
          }
          .header .header-id {
            margin: 1px 0;
            font-size: 11.5px;
            font-weight: 700;
            color: #000;
          }
          .header .header-demand {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #000;
          }
          .header .header-route {
            margin: 1px 0 2px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            word-break: break-word;
            color: #000;
          }
          .meta-table {
            width: 100%;
            table-layout: fixed;
            font-size: 10.5px;
            margin-bottom: 4px;
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 1px 0;
            word-break: break-word;
            color: #000;
          }
          .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 10.5px;
            margin: 4px 0;
          }
          .items-table th {
            border-bottom: 1.5px solid #000;
            border-top: 1.5px solid #000;
            padding: 3px 2px;
            font-weight: 700;
            font-size: 10.5px;
            color: #000;
          }
          .footer {
            margin-top: 5px;
            border-top: 1px dashed #000;
            padding-top: 3px;
            padding-bottom: 0;
            margin-bottom: 0;
            font-size: 10px;
            text-align: center;
            color: #000;
          }
          .sign-area {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 2px;
          }
          .sign-box {
            border-top: 1px solid #000;
            width: 44%;
            text-align: center;
            font-size: 9px;
            padding-top: 2px;
            font-weight: normal;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-brand">AL RAWAQ RESTAURANT</div>
          <div class="header-title">INTERNAL BRANCH TRANSFER</div>
          <div class="header-id">ID: ${t.transfer_id}</div>
          <div class="header-demand">DEMAND FROM: ${(t.from_branch || '').toUpperCase()}</div>
          <div class="header-route">${(t.from_branch || 'BRANCH 1').toUpperCase()} → TO → ${(t.to_branch || 'BRANCH 2').toUpperCase()}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td style="width: 50%;"><strong>Day:</strong> ${t.delivery_day || 'Today'}</td>
            <td style="width: 50%; text-align: right;"><strong>Status:</strong> ${t.status}</td>
          </tr>
          <tr>
            <td style="width: 50%;"><strong>Needed By:</strong> ${t.needed_by_time || 'ASAP'}</td>
            <td style="width: 50%; text-align: right;"><strong>Requested By:</strong> ${t.requested_by_name || 'Staff'}</td>
          </tr>
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 44%; text-align: left;">Dish</th>
              <th style="width: 14%; text-align: center;">Unit</th>
              <th style="width: 14%; text-align: center;">Req</th>
              <th style="width: 14%; text-align: center;">Acc</th>
              <th style="width: 14%; text-align: right;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="sign-area">
          <div class="sign-box">Prepared By</div>
          <div class="sign-box">Dispatcher Sign</div>
        </div>

        <div class="footer">
          <p style="margin: 0; font-weight: normal; color: #000;">Verified Accepted Goods</p>
          <p style="margin: 2px 0 0; font-size: 11px; font-weight: normal; color: #000;">Printed: ${new Date().toLocaleString()}</p>
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

// Thermal / Standard Slip: Dispatched Goods Slip (Pending Review / Received)
function printDispatchedItemsSlip(t) {
  if (!t) return;
  const printWindow = window.open('', '_blank', 'width=460,height=700');
  if (!printWindow) {
    toast.error('Popup blocked. Please allow popups to print slip.');
    return;
  }

  const dispatchedItems = (t.items || []).filter(it => {
    const s = parseFloat(it.sent_qty !== null && it.sent_qty !== undefined ? it.sent_qty : (it.dispatched_qty ?? 0));
    return s > 0;
  });

  const itemsHtml = dispatchedItems.map((it, idx) => {
    const sentQ = parseFloat(it.sent_qty !== null && it.sent_qty !== undefined ? it.sent_qty : (it.dispatched_qty ?? 0));
    const recQ = it.received_qty !== null && it.received_qty !== undefined ? parseFloat(it.received_qty) : '-';
    return `
      <tr>
        <td style="width: 44%; padding: 4px 2px; font-weight: normal; border-bottom: 1px dashed #cbd5e1; word-break: break-word;">${idx + 1}. ${it.dish_name}</td>
        <td style="width: 16%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1;">${it.uom || 'Piece'}</td>
        <td style="width: 20%; padding: 4px 2px; text-align: center; border-bottom: 1px dashed #cbd5e1; font-weight: bold; color: #16a34a;">${sentQ}</td>
        <td style="width: 20%; padding: 4px 2px; text-align: right; border-bottom: 1px dashed #cbd5e1;">${recQ}</td>
      </tr>
    `;
  }).join('');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dispatched Goods - ${t.transfer_id}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          html {
            margin: 0;
            padding: 0;
            background: #fff;
          }
          body {
            width: 100%;
            max-width: 72mm;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 11px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 2px 20px 2px 4px;
            line-height: 1.25;
            text-rendering: geometricPrecision;
            overflow-x: hidden;
            word-break: break-word;
          }
          .header {
            text-align: center;
            border-bottom: 1.5px dashed #000;
            padding-bottom: 4px;
            margin-bottom: 4px;
          }
          .header .header-brand {
            margin: 0 0 2px;
            font-size: 14px;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #000;
          }
          .header .header-title {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            color: #000;
          }
          .header .header-id {
            margin: 1px 0;
            font-size: 11.5px;
            font-weight: 700;
            color: #000;
          }
          .header .header-demand {
            margin: 1px 0;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            color: #000;
          }
          .header .header-route {
            margin: 1px 0 2px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            word-break: break-word;
            color: #000;
          }
          .meta-table {
            width: 100%;
            table-layout: fixed;
            font-size: 10.5px;
            margin-bottom: 4px;
            border-collapse: collapse;
          }
          .meta-table td {
            padding: 1px 0;
            word-break: break-word;
            color: #000;
          }
          .items-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            font-size: 10.5px;
            margin: 4px 0;
          }
          .items-table th {
            border-bottom: 1.5px solid #000;
            border-top: 1.5px solid #000;
            padding: 3px 2px;
            font-weight: 700;
            font-size: 10.5px;
            color: #000;
          }
          .footer {
            margin-top: 5px;
            border-top: 1px dashed #000;
            padding-top: 3px;
            padding-bottom: 0;
            margin-bottom: 0;
            font-size: 10px;
            text-align: center;
            color: #000;
          }
          .sign-area {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            padding-top: 2px;
          }
          .sign-box {
            border-top: 1px solid #000;
            width: 44%;
            text-align: center;
            font-size: 9px;
            padding-top: 2px;
            font-weight: normal;
            color: #000;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-brand">AL RAWAQ RESTAURANT</div>
          <div class="header-title">INTERNAL BRANCH TRANSFER</div>
          <div class="header-id">ID: ${t.transfer_id}</div>
          <div class="header-demand">DEMAND FROM: ${(t.from_branch || '').toUpperCase()}</div>
          <div class="header-route">${(t.from_branch || 'BRANCH 1').toUpperCase()} → TO → ${(t.to_branch || 'BRANCH 2').toUpperCase()}</div>
        </div>

        <table class="meta-table">
          <tr>
            <td style="width: 50%;"><strong>Day:</strong> ${t.delivery_day || 'Today'}</td>
            <td style="width: 50%; text-align: right;"><strong>Status:</strong> ${t.status}</td>
          </tr>
          <tr>
            <td style="width: 50%;"><strong>Dispatched:</strong> ${t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</td>
            <td style="width: 50%; text-align: right;"><strong>Disp By:</strong> ${t.dispatched_by_name || 'Kitchen Staff'}</td>
          </tr>
          ${t.handover_to_name ? `<tr><td colspan="2"><strong>Driver / Rep:</strong> ${t.handover_to_name}</td></tr>` : ''}
        </table>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 44%; text-align: left;">Dish</th>
              <th style="width: 16%; text-align: center;">Unit</th>
              <th style="width: 20%; text-align: center;">Dispatched</th>
              <th style="width: 20%; text-align: right;">Received</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml || '<tr><td colspan="4" style="text-align: center; padding: 10px;">No dispatched items</td></tr>'}
          </tbody>
        </table>

        <div class="sign-area">
          <div class="sign-box">Handover Sign</div>
          <div class="sign-box">Receiver Sign</div>
        </div>

        <div class="footer">
          <p style="margin: 0; font-weight: normal; color: #000;">Dispatched Shipment Verification</p>
          <p style="margin: 2px 0 0; font-size: 11px; font-weight: normal; color: #000;">Printed: ${new Date().toLocaleString()}</p>
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

// Clean, consistently aligned single-row Due By Badge with extension indicator
function DueByBadge({ neededByTime, totalExtendedMinutes, compact = false }) {
  const displayTime = neededByTime || 'ASAP';
  const hasExtension = (totalExtendedMinutes || 0) > 0;

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
      flexWrap: 'nowrap',
      maxWidth: '100%',
      verticalAlign: 'middle'
    }}>
      <span style={{
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        color: '#dc2626',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        padding: compact ? '1.5px 6px' : '2px 8px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4
      }}>
        <Clock size={compact ? 11 : 12} color="#dc2626" />
        {displayTime}
      </span>
      {hasExtension && (
        <span style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: '#b45309',
          background: '#fef3c7',
          border: '1px solid #fde68a',
          padding: '1.5px 6px',
          borderRadius: 4,
          whiteSpace: 'nowrap'
        }}>
          +{totalExtendedMinutes}m
        </span>
      )}
    </div>
  );
}

// Consistent Priority Badge Component across all views
function PriorityBadge({ priority }) {
  const p = priority || 'Normal';
  if (p === 'Urgent') {
    return (
      <span style={{
        fontSize: 11,
        fontWeight: 800,
        padding: '2px 7px',
        borderRadius: 4,
        background: '#fef2f2',
        color: '#dc2626',
        border: '1px solid #fca5a5',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        whiteSpace: 'nowrap'
      }}>
        🚨 Urgent Rush
      </span>
    );
  }
  if (p === 'High') {
    return (
      <span style={{
        fontSize: 11,
        fontWeight: 800,
        padding: '2px 7px',
        borderRadius: 4,
        background: '#fffbeb',
        color: '#d97706',
        border: '1px solid #fde68a',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        whiteSpace: 'nowrap'
      }}>
        ⚡ High Priority
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 7px',
      borderRadius: 4,
      background: '#f1f5f9',
      color: '#475569',
      border: '1px solid #cbd5e1',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      whiteSpace: 'nowrap'
    }}>
      Normal
    </span>
  );
}

// Clean Searchable Dish Dropdown with Smart Popularity Ranking, Image Thumbnail & Ultra-High Z-Index
function DishSearchDropdown({ value, imageUrl, dishes, popularityMap = {}, onSelect, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const containerRef = useRef(null);

  const setOpenState = (open) => {
    setIsOpen(open);
    if (typeof onOpenChange === 'function') {
      onOpenChange(open);
    }
  };

  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpenState(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const safeDishes = Array.isArray(dishes) ? dishes : [];

  const filteredDishes = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();

    // Attach popularity counts from dish or external map
    const enriched = safeDishes.map(d => {
      if (!d) return null;
      const cleanName = String(d.name || d.dish_name || '').trim().toLowerCase();
      const popData = (popularityMap?.by_id && d.id ? popularityMap.by_id[d.id] : null) ||
                      (popularityMap?.by_name ? popularityMap.by_name[cleanName] : null);
      const reqCount = d.request_count !== undefined ? d.request_count : (popData?.request_count || 0);
      const reqQty = d.total_requested_qty !== undefined ? d.total_requested_qty : (popData?.total_requested_qty || 0);
      return {
        ...d,
        request_count: reqCount,
        total_requested_qty: reqQty
      };
    }).filter(Boolean);

    // Filter by query
    const matching = !term
      ? enriched
      : enriched.filter(d => {
          const name = String(d.name || d.dish_name || '').toLowerCase();
          const sku = String(d.sku || d.short_code || '').toLowerCase();
          const barcode = String(d.barcode || '').toLowerCase();
          return name.includes(term) || (sku && sku.includes(term)) || (barcode && barcode.includes(term));
        });

    // Intelligent sorting:
    // 1. Exact name match
    // 2. Starts with query
    // 3. Historical popularity score: (request_count * 10 + total_requested_qty)
    // 4. Alphabetical fallback
    return matching.sort((a, b) => {
      const nameA = String(a.name || a.dish_name || '').toLowerCase();
      const nameB = String(b.name || b.dish_name || '').toLowerCase();

      if (term) {
        const exactA = nameA === term;
        const exactB = nameB === term;
        if (exactA && !exactB) return -1;
        if (!exactA && exactB) return 1;

        const startsA = nameA.startsWith(term);
        const startsB = nameB.startsWith(term);
        if (startsA && !startsB) return -1;
        if (!startsA && startsB) return 1;
      }

      const scoreA = ((a.request_count || 0) * 10) + (a.total_requested_qty || 0);
      const scoreB = ((b.request_count || 0) * 10) + (b.total_requested_qty || 0);

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      return nameA.localeCompare(nameB);
    }).slice(0, 80);
  }, [safeDishes, searchTerm, popularityMap]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', zIndex: isOpen ? 999999 : 'auto' }}>
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
            placeholder="Search menu dish (popular items prioritized)..."
            value={searchTerm}
            onFocus={() => setOpenState(true)}
            onClick={() => setOpenState(true)}
            onChange={(e) => {
              const val = e.target.value;
              setSearchTerm(val);
              setOpenState(true);
              const found = safeDishes.find(d => {
                const name = String(d?.name || d?.dish_name || '').toLowerCase();
                return name === val.toLowerCase();
              });
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
              border: isOpen ? '2px solid #2563eb' : '1px solid #cbd5e1',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              background: '#fff'
            }}
          />
        </div>
      </div>

      {/* Floating Dropdown with Ultra-High Z-Index & Elevation (Opens upward to prevent clipping) */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            top: 'auto',
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: 'auto',
            background: '#ffffff',
            borderRadius: 8,
            border: '2px solid #2563eb',
            boxShadow: '0 -10px 25px -4px rgba(0,0,0,0.25), 0 -4px 10px -4px rgba(0,0,0,0.15)',
            zIndex: 9999999
          }}
        >
          {filteredDishes.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: 12.5, color: '#64748b', textAlign: 'center' }}>
              No dishes found matching "{searchTerm}"
            </div>
          ) : (
            filteredDishes.map((dish) => (
              <div
                key={dish.id || dish.name}
                onMouseDown={() => {
                  setSearchTerm(dish.name);
                  onSelect(dish);
                  setOpenState(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'background 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f9ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Product thumbnail */}
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

                {/* Dish Name + Popularity Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, minWidth: 0, gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dish.name}
                  </span>
                  {dish.request_count > 0 && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#b45309',
                      background: '#fffbeb',
                      border: '1px solid #fef3c7',
                      padding: '1.5px 6px',
                      borderRadius: 10,
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      flexShrink: 0
                    }}>
                      🔥 {dish.request_count}x requested
                    </span>
                  )}
                </div>
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

  // POS Menu System integration
  const { items: posItems, categories: posCategories, loadData: reloadPOSData } = usePOS();

  // Active Tab - default to transfer_request so latest requests appear right away
  const location = useLocation();

  // Navigation source tracking: Only show 'Back to Order Taking' if navigated from POS
  const isFromOrderTaking = Boolean(
    location.state?.from === 'order_taking' ||
    location.state?.from === '/pos' ||
    location.state?.from === 'pos' ||
    new URLSearchParams(location.search).get('from') === 'pos' ||
    new URLSearchParams(location.search).get('from') === 'order_taking'
  );

  // Active Tab - default to new request screen on opening
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'transfer_request' | 'incoming' | 'receivals' | 'logs'
  const [openDropdownRowId, setOpenDropdownRowId] = useState(null);

  // Branches & Menu Items
  const [branches, setBranches] = useState(INITIAL_BRANCHES);
  const [dishes, setDishes] = useState(() => (Array.isArray(posItems) && posItems.length > 0 ? posItems : []));
  const [loadingDishes, setLoadingDishes] = useState(false);
  const [popularityMap, setPopularityMap] = useState({ by_id: {}, by_name: {} });

  // Sync dishes whenever POSContext items update
  useEffect(() => {
    if (Array.isArray(posItems) && posItems.length > 0) {
      setDishes(posItems);
    }
  }, [posItems]);

  // Load product popularity ranking from backend
  useEffect(() => {
    axios.get('/api/internal-branch/product-popularity')
      .then(res => {
        if (res.data) setPopularityMap(res.data);
      })
      .catch(err => console.warn('Could not load product popularity map:', err));
  }, []);

  // Stats / Badges
  const [stats, setStats] = useState({
    pending_count: 0,
    in_progress_count: 0,
    ready_count: 0,
    dispatched_count: 0,
    partially_received_count: 0,
    fully_received_count: 0,
    completed_count: 0,
    incoming_pending_count: 0,
    pending_receivals_count: 0,
    sent_active_count: 0
  });

  // Transfers List
  const [transfers, setTransfers] = useState([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);

  // Fast Filters for Sent Transfer Requests
  const [sentSearchQuery, setSentSearchQuery] = useState('');
  const [sentFilterBranch, setSentFilterBranch] = useState('All');
  const [sentFilterPriority, setSentFilterPriority] = useState('All');

  // Sorted and filtered active sent transfer requests (LATEST REQUESTS FIRST, ACTIVE ONLY)
  const filteredSentTransfers = useMemo(() => {
    // Only display active & in-progress requests (Completed and Cancelled move to Transfer Logs)
    let list = transfers.filter(t => t.status !== 'Completed' && t.status !== 'Cancelled');

    // Always sort latest requests first
    list.sort((a, b) => {
      const timeA = new Date(a.created_at || a.request_date).getTime();
      const timeB = new Date(b.created_at || b.request_date).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.id || 0) - (a.id || 0);
    });

    if (sentFilterBranch !== 'All') {
      list = list.filter(t => (t.to_branch || '').toLowerCase() === sentFilterBranch.toLowerCase());
    }

    if (sentFilterPriority !== 'All') {
      list = list.filter(t => (t.priority || 'Normal').toLowerCase() === sentFilterPriority.toLowerCase());
    }

    if (sentSearchQuery && sentSearchQuery.trim()) {
      const q = sentSearchQuery.trim().toLowerCase();
      list = list.filter(t => {
        const idMatch = String(t.transfer_id || t.id || '').toLowerCase().includes(q);
        const toMatch = String(t.to_branch || '').toLowerCase().includes(q);
        const notesMatch = String(t.notes || '').toLowerCase().includes(q);
        const itemMatch = (t.items || []).some(it => String(it.dish_name || '').toLowerCase().includes(q));
        return idMatch || toMatch || notesMatch || itemMatch;
      });
    }

    return list;
  }, [transfers, sentFilterBranch, sentFilterPriority, sentSearchQuery]);

  // Admin Branch Switcher & Activity Filter
  const [adminSelectedBranch, setAdminSelectedBranch] = useState('All');
  const [adminDirection, setAdminDirection] = useState('all'); // 'all' | 'sent' | 'received'

  // Filters for Master Logs
  const [filterFromBranch, setFilterFromBranch] = useState('All');
  const [filterToBranch, setFilterToBranch] = useState('All');
  const [customFilterFromBranch, setCustomFilterFromBranch] = useState('');
  const [customFilterToBranch, setCustomFilterToBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRequestType, setFilterRequestType] = useState('All'); // 'All' | 'Transfer Request' | 'New Request'
  const [filterPriority, setFilterPriority] = useState('All'); // 'All' | 'Normal' | 'High' | 'Urgent'
  const [filterPeriod, setFilterPeriod] = useState('all'); // 'all' | 'today' | 'daily' | 'weekly' | 'monthly'
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterDishName, setFilterDishName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dedicated Transfer Request Form State
  const defaultTrfFrom = normalizeBranchName(user?.branch && user.branch !== 'All' ? user.branch : 'Branch 1');
  const [trfFromBranch, setTrfFromBranch] = useState(defaultTrfFrom);
  const [trfToBranch, setTrfToBranch] = useState('');
  const [trfCustomFromBranch, setTrfCustomFromBranch] = useState('');
  const [trfCustomToBranch, setTrfCustomToBranch] = useState('');
  const [trfPriority, setTrfPriority] = useState('Normal'); // 'Normal' | 'High' | 'Urgent'
  const [trfPurpose, setTrfPurpose] = useState('Stock Replenishment');
  const [trfCustomPurpose, setTrfCustomPurpose] = useState('');
  const [trfDayOption, setTrfDayOption] = useState('Today'); // 'Today' | 'Tomorrow' | 'Custom Date'
  const [trfCustomDayDate, setTrfCustomDayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [trfNotes, setTrfNotes] = useState('');
  const [trfDishRows, setTrfDishRows] = useState([
    { 
      id: 1, 
      dish_name: '', 
      item_id: null, 
      sku: '', 
      barcode: '', 
      uom: 'KG', 
      requested_qty: '', 
      needed_by_date: new Date().toISOString().split('T')[0],
      needed_by_time: '', 
      priority: 'Normal', 
      remarks: '', 
      image_url: null, 
      price: null, 
      available_units: [...STANDARD_TOP_UNITS] 
    }
  ]);
  const [submittingTrfRequest, setSubmittingTrfRequest] = useState(false);

  // Modals / Actions
  // 1. Extend Delivery Time (Request from supplying branch)
  const [extendTimeTransfer, setExtendTimeTransfer] = useState(null);
  const [extendMinutes, setExtendMinutes] = useState(15);
  const [isCustomMinutes, setIsCustomMinutes] = useState(false);
  const [customMinutesInput, setCustomMinutesInput] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [extendingTime, setExtendingTime] = useState(false);

  // 1b. Review & Approve/Modify/Reject Extension (Requester Action)
  const [reviewExtensionTransfer, setReviewExtensionTransfer] = useState(null);
  const [reviewAction, setReviewAction] = useState('accept'); // 'accept' | 'modify' | 'reject'
  const [modifiedExtensionMinutes, setModifiedExtensionMinutes] = useState(15);
  const [modificationReason, setModificationReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewingExtension, setReviewingExtension] = useState(false);

  // 2. Modify Quantities
  const [modifyQtyTransfer, setModifyQtyTransfer] = useState(null);
  const [modifiedItemQuantities, setModifiedItemQuantities] = useState({});
  const [modifiedItemReasons, setModifiedItemReasons] = useState({});
  const [modifyGeneralReason, setModifyGeneralReason] = useState('');
  const [modifyingQty, setModifyingQty] = useState(false);

  // 3. Dispatch & Handover
  const [dispatchModalTransfer, setDispatchModalTransfer] = useState(null);
  const [dispatchItemQuantities, setDispatchItemQuantities] = useState({});
  const [dispatchItemRemarks, setDispatchItemRemarks] = useState({});
  const [handoverByName, setHandoverByName] = useState('');
  const [handoverToName, setHandoverToName] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // 4. Goods Receiving & Verification
  const [receiveModalTransfer, setReceiveModalTransfer] = useState(null);
  const [receiveItemQuantities, setReceiveItemQuantities] = useState({});
  const [receiveItemRemarks, setReceiveItemRemarks] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [receiving, setReceiving] = useState(false);

  // 5. Transfer Detail with Activity Timeline
  const [detailModalTransfer, setDetailModalTransfer] = useState(null);
  const [detailModalTab, setDetailModalTab] = useState('summary'); // 'summary' | 'activity'
  const [activityLogs, setActivityLogs] = useState([]);
  const [loadingActivityLogs, setLoadingActivityLogs] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);

  // 6. Modify Transfer Request Modal (Requesting branch edits items/quantities before dispatch)
  const [editTransferModal, setEditTransferModal] = useState(null);
  const [editDishRows, setEditDishRows] = useState([]);
  const [editPriority, setEditPriority] = useState('Normal');
  const [editDayOption, setEditDayOption] = useState('Today');
  const [editCustomDayDate, setEditCustomDayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [editDeliveryMinutes, setEditDeliveryMinutes] = useState(30);
  const [editCustomDeliveryMinutes, setEditCustomDeliveryMinutes] = useState('');
  const [editNeededByTime, setEditNeededByTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingEditRequest, setSavingEditRequest] = useState(false);

  // 7. Item-Level Accept Modal (Quantity modification & mandatory reason rule)
  const [acceptItemModal, setAcceptItemModal] = useState(null); // { transferId, item, acceptedQty, reason, saving }
  // 8. Item-Level Reject Modal (Mandatory rejection reason)
  const [rejectItemModal, setRejectItemModal] = useState(null); // { transferId, item, reason, saving }
  // 9. Bulk Actions Modals
  const [acceptAllConfirmModal, setAcceptAllConfirmModal] = useState(null); // { transfer, items, saving }
  const [rejectAllModal, setRejectAllModal] = useState(null); // { transfer, reason, saving }
  // 9b. Detailed Accept and Done Modal (Batch item-by-item decisions)
  const [acceptAndDoneModal, setAcceptAndDoneModal] = useState(null); // { transfer, items, saving }
  // 10. Clear All Active Requests Modal
  const [clearAllModalOpen, setClearAllModalOpen] = useState(false);
  const [clearAllReason, setClearAllReason] = useState('');
  const [clearingAll, setClearingAll] = useState(false);
  // 11. Partial Dispatch & Partial Receive selections
  const [dispatchSelectedItems, setDispatchSelectedItems] = useState({});
  const [receiveSelectedItems, setReceiveSelectedItems] = useState({});
  const [itemAcceptedQtys, setItemAcceptedQtys] = useState({});

  // Double-click protection refs & socket event deduplication
  const isSubmittingRef = useRef(false);
  const isDispatchingRef = useRef(false);
  const isReceivingRef = useRef(false);
  const processedEventKeysRef = useRef(new Set());
  const localActionTransferIdsRef = useRef(new Map());

  // New Request Form State
  const defaultFromBranch = normalizeBranchName(user?.branch && user.branch !== 'All' ? user.branch : 'Branch 1');
  const [newFromBranch, setNewFromBranch] = useState(defaultFromBranch);
  const [newToBranch, setNewToBranch] = useState('');
  const [customFromBranch, setCustomFromBranch] = useState('');
  const [customToBranch, setCustomToBranch] = useState('');
  const [newDeliveryMinutes, setNewDeliveryMinutes] = useState(30);
  const [customDeliveryMinutes, setCustomDeliveryMinutes] = useState('');
  const [newNeededByTime, setNewNeededByTime] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDishRows, setNewDishRows] = useState([
    { id: 1, dish_name: '', item_id: null, uom: 'KG', requested_qty: '', remarks: '', image_url: null, price: null, available_units: [...STANDARD_TOP_UNITS] }
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
    const list = Array.isArray(dishes) && dishes.length > 0 ? dishes : (Array.isArray(posItems) ? posItems : []);
    list.forEach(d => {
      if (!d) return;
      const itemCats = Array.isArray(d.category_names)
        ? d.category_names
        : (d.category_name ? [d.category_name] : (d.category ? [d.category] : []));
      itemCats.forEach(c => {
        if (c && typeof c === 'string' && c.trim()) cats.add(c.trim());
      });
    });
    if (Array.isArray(posCategories)) {
      posCategories.forEach(c => {
        const cName = typeof c === 'string' ? c : c?.name;
        if (cName && typeof cName === 'string' && cName.trim()) cats.add(cName.trim());
      });
    }
    return ['All', ...Array.from(cats).sort()];
  }, [dishes, posItems, posCategories]);

  const filteredBrowserDishes = useMemo(() => {
    const list = Array.isArray(dishes) && dishes.length > 0 ? dishes : (Array.isArray(posItems) ? posItems : []);
    const searchLower = (menuBrowserSearch || '').trim().toLowerCase();
    const matching = list.filter(d => {
      if (!d) return false;
      const name = String(d.name || d.dish_name || '').toLowerCase();
      const sku = String(d.sku || d.short_code || '').toLowerCase();
      const matchSearch = !searchLower || name.includes(searchLower) || sku.includes(searchLower);
      
      const itemCats = Array.isArray(d.category_names)
        ? d.category_names
        : (d.category_name ? [d.category_name] : (d.category ? [d.category] : []));
      
      const matchCat = menuBrowserCategory === 'All' || itemCats.some(c => String(c).trim().toLowerCase() === menuBrowserCategory.trim().toLowerCase());
      return matchSearch && matchCat;
    });

    // Intelligent sorting: Frequently requested products appear first!
    return matching.sort((a, b) => {
      const cleanA = String(a.name || a.dish_name || '').trim().toLowerCase();
      const cleanB = String(b.name || b.dish_name || '').trim().toLowerCase();

      const popA = (popularityMap?.by_id && a.id ? popularityMap.by_id[a.id] : null) ||
                   (popularityMap?.by_name ? popularityMap.by_name[cleanA] : null);
      const popB = (popularityMap?.by_id && b.id ? popularityMap.by_id[b.id] : null) ||
                   (popularityMap?.by_name ? popularityMap.by_name[cleanB] : null);

      const countA = a.request_count !== undefined ? a.request_count : (popA?.request_count || 0);
      const countB = b.request_count !== undefined ? b.request_count : (popB?.request_count || 0);
      const qtyA = a.total_requested_qty !== undefined ? a.total_requested_qty : (popA?.total_requested_qty || 0);
      const qtyB = b.total_requested_qty !== undefined ? b.total_requested_qty : (popB?.total_requested_qty || 0);

      const scoreA = (countA * 10) + qtyA;
      const scoreB = (countB * 10) + qtyB;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }
      return cleanA.localeCompare(cleanB);
    });
  }, [dishes, posItems, menuBrowserSearch, menuBrowserCategory, popularityMap]);

  const handleAddDishFromBrowser = (dish) => {
    const units = getItemUnits(dish);
    const defaultUom = units[0] || 'Piece';
    const dishSku = dish.short_code || dish.sku || (dish.id ? `SKU-${dish.id}` : '');
    const dishBarcode = dish.barcode || '';

    const isEdit = Boolean(editTransferModal);
    const setRows = isEdit ? setEditDishRows : setTrfDishRows;

    setRows(prev => {
      if (prev.length === 1 && (!prev[0].dish_name || !prev[0].dish_name.trim())) {
        return [{
          id: prev[0].id,
          dish_name: dish.name,
          item_id: dish.id,
          sku: dishSku,
          barcode: dishBarcode,
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
          sku: dishSku,
          barcode: dishBarcode,
          uom: defaultUom,
          available_units: units,
          requested_qty: 1,
          image_url: dish.image_url || null,
          price: dish.price || null,
          remarks: ''
        }
      ];
    });
    toast.success(`Added "${dish.name}" to request items`);
  };

  const handleUpdateQtyFromBrowser = (dish, delta) => {
    const isEdit = Boolean(editTransferModal);
    const setRows = isEdit ? setEditDishRows : setTrfDishRows;

    setRows(prev => {
      const existing = prev.find(r => r.item_id === dish.id || (r.dish_name && r.dish_name.toLowerCase() === dish.name.toLowerCase()));
      if (!existing) return prev;
      const newQty = (parseFloat(existing.requested_qty) || 0) + delta;
      if (newQty <= 0) {
        if (prev.length === 1) {
          return [{ id: Date.now(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'] }];
        }
        return prev.filter(r => r.id !== existing.id);
      }
      return prev.map(r => r.id === existing.id ? { ...r, requested_qty: newQty } : r);
    });
  };

  // Audio test state
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Fetch centralized dishes from POS system, IndexedDB cache, and APIs
  const fetchDishes = useCallback(() => {
    setLoadingDishes(true);

    // 1. If posItems is already in memory from POSContext, use immediately
    if (Array.isArray(posItems) && posItems.length > 0) {
      setDishes(posItems);
      setLoadingDishes(false);
      return;
    }

    // 2. Check IndexedDB cache for instant display
    getCachedMenuItems().then(cached => {
      if (Array.isArray(cached) && cached.length > 0) {
        setDishes(prev => prev.length > 0 ? prev : cached);
      }
    }).catch(console.error);

    // 3. Centralized dishes endpoint
    axios.get('/api/internal-branch/dishes')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          setDishes(res.data);
        } else {
          // 4. Fallback to /api/items?all=true
          return axios.get('/api/items?all=true').then(fallbackRes => {
            if (Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
              setDishes(fallbackRes.data);
            } else if (typeof reloadPOSData === 'function') {
              reloadPOSData(true);
            }
          });
        }
      })
      .catch(() => {
        // 5. Fallback to /api/items?all=true
        return axios.get('/api/items?all=true')
          .then(fallbackRes => {
            if (Array.isArray(fallbackRes.data) && fallbackRes.data.length > 0) {
              setDishes(fallbackRes.data);
            }
          })
          .catch(err => console.error('Failed to load menu dishes:', err));
      })
      .finally(() => setLoadingDishes(false));
  }, [posItems, reloadPOSData]);

  // Load initial branches, dishes, and stats
  useEffect(() => {
    // Branches
    axios.get('/api/internal-branch/branches')
      .then(res => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const cleaned = sanitizeBranchList(res.data);
          setBranches(cleaned);
          // Set default target branch
          const otherBranches = cleaned.filter(b => b !== defaultFromBranch && b !== 'Other');
          if (otherBranches.length > 0 && !newToBranch) {
            setNewToBranch(otherBranches[0]);
          }
        }
      })
      .catch(err => {
        console.error('Failed to load branches:', err);
        setBranches(INITIAL_BRANCHES);
      });

    // Dishes from centralized items
    fetchDishes();

    fetchStats();
  }, [defaultFromBranch, fetchDishes]);

  const fetchStats = useCallback((branchToQuery) => {
    const qBranch = branchToQuery || (isSuperUser && adminSelectedBranch !== 'All' ? adminSelectedBranch : undefined);
    const params = qBranch ? { branch: qBranch } : {};
    axios.get('/api/internal-branch/stats', { params })
      .then(res => setStats(res.data || {}))
      .catch(err => console.error('Failed to load transfer stats:', err));
  }, [isSuperUser, adminSelectedBranch]);

  // Fetch transfers based on active tab and filters
  const fetchTransfers = useCallback(() => {
    setLoadingTransfers(true);
    const params = {};

    // Admin branch & direction filtering
    if (adminSelectedBranch !== 'All') {
      params.branch = adminSelectedBranch;
      params.branch_direction = adminDirection;
    }

    if (activeTab === 'incoming') {
      params.tab = 'incoming';
      if (filterFromBranch !== 'All') params.sent_by = filterFromBranch;
      if (filterStatus !== 'All') params.status = filterStatus;
      if (filterRequestType !== 'All') params.request_type = filterRequestType;
      if (filterPriority !== 'All') params.priority = filterPriority;
      if (searchQuery) params.search = searchQuery;
    } else if (activeTab === 'receivals') {
      params.tab = 'pending_receivals';
      if (filterToBranch !== 'All') params.received_by = filterToBranch;
      if (filterRequestType !== 'All') params.request_type = filterRequestType;
      if (filterPriority !== 'All') params.priority = filterPriority;
      if (searchQuery) params.search = searchQuery;
    } else if (activeTab === 'transfer_request') {
      // Sent Requests: Orders requested by this branch until completed
      params.tab = 'sent_requests';
      if (filterToBranch !== 'All') params.to_branch = filterToBranch;
      if (filterStatus !== 'All') params.status = filterStatus;
      if (filterRequestType !== 'All') params.request_type = filterRequestType;
      if (filterPriority !== 'All') params.priority = filterPriority;
      if (searchQuery) params.search = searchQuery;
    } else {
      // Master Logs & Reporting Tab
      params.tab = 'logs';
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
      if (filterRequestType !== 'All') params.request_type = filterRequestType;
      if (filterPriority !== 'All') params.priority = filterPriority;
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
    adminSelectedBranch,
    adminDirection,
    isSuperUser,
    filterFromBranch, 
    filterToBranch, 
    customFilterFromBranch,
    customFilterToBranch,
    filterStatus, 
    filterRequestType,
    filterPriority,
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

    const handleExtensionRequested = (data) => {
      fetchStats();
      fetchTransfers();
      if (!isNewEvent('ext_req', `${data.id}_${data.updated_at}`)) return;

      const userBranch = user?.branch;
      const isRequester = isSuperUser || (userBranch && [data.from_branch].map(b => (b||'').toLowerCase()).includes(userBranch.toLowerCase())) || (user?.id && Number(user.id) === Number(data.requested_by_user_id));

      if (isRequester) {
        if (audioEnabled) {
          playIncomingTransferAlert();
        }
        toast.custom(() => (
          <div style={{
            background: '#78350f',
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
              <strong style={{ fontSize: 13.5, display: 'block' }}>⏳ Extension Requested! (+{data.pending_extension_minutes}m)</strong>
              <span style={{ fontSize: 12, color: '#fef3c7' }}>
                Transfer #{data.transfer_id} from {data.to_branch}: "{data.pending_extension_reason}"
              </span>
            </div>
          </div>
        ), { duration: 7000 });
      }
    };

    const handleExtensionAccepted = (data) => {
      fetchStats();
      fetchTransfers();
      if (!isNewEvent('ext_acc', `${data.id}_${data.updated_at}`)) return;
      toast.success(`✅ Extension accepted for Transfer #${data.transfer_id}! Total allowed time updated.`);
    };

    const handleExtensionRejected = (data) => {
      fetchStats();
      fetchTransfers();
      if (!isNewEvent('ext_rej', `${data.id}_${data.updated_at}`)) return;
      toast.error(`❌ Extension request rejected for Transfer #${data.transfer_id}.`);
    };

    const handleExtensionModified = (data) => {
      fetchStats();
      fetchTransfers();
      if (!isNewEvent('ext_mod', `${data.id}_${data.updated_at}`)) return;
      toast.info(`✏️ Extension modified & approved for Transfer #${data.transfer_id}!`);
    };

    const handleRequestModified = (data) => {
      fetchStats();
      fetchTransfers();
      if (!isNewEvent('req_mod', `${data.id}_${data.updated_at}`)) return;
      const userBranch = user?.branch;
      if (isSuperUser || (userBranch && userBranch.toLowerCase() === (data.to_branch || '').toLowerCase())) {
        toast.info(`✏️ Transfer Request #${data.transfer_id} items updated by ${data.from_branch}.`);
      }
    };

    socket.on('internal_transfer_created', handleTransferCreated);
    socket.on('internal_transfer_dispatched', handleTransferDispatched);
    socket.on('internal_transfer_received', handleTransferReceived);
    socket.on('internal_transfer_cancelled', handleTransferCancelled);
    socket.on('internal_transfer_extension_requested', handleExtensionRequested);
    socket.on('internal_transfer_extension_accepted', handleExtensionAccepted);
    socket.on('internal_transfer_extension_rejected', handleExtensionRejected);
    socket.on('internal_transfer_extension_modified', handleExtensionModified);
    socket.on('internal_transfer_request_modified', handleRequestModified);
    socket.on('internal_transfer_updated', fetchTransfers);

    return () => {
      socket.off('internal_transfer_created', handleTransferCreated);
      socket.off('internal_transfer_dispatched', handleTransferDispatched);
      socket.off('internal_transfer_received', handleTransferReceived);
      socket.off('internal_transfer_cancelled', handleTransferCancelled);
      socket.off('internal_transfer_extension_requested', handleExtensionRequested);
      socket.off('internal_transfer_extension_accepted', handleExtensionAccepted);
      socket.off('internal_transfer_extension_rejected', handleExtensionRejected);
      socket.off('internal_transfer_extension_modified', handleExtensionModified);
      socket.off('internal_transfer_request_modified', handleRequestModified);
      socket.off('internal_transfer_updated', fetchTransfers);
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
    const dishSku = dish.short_code || dish.sku || (dish.id ? `SKU-${dish.id}` : '');
    const dishBarcode = dish.barcode || '';
    setNewDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        dish_name: dish.name,
        item_id: dish.id || null,
        sku: dishSku,
        barcode: dishBarcode,
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
        const dishSku = foundItem ? (foundItem.short_code || foundItem.sku || `SKU-${foundItem.id}`) : r.sku;
        const dishBarcode = foundItem ? (foundItem.barcode || '') : r.barcode;
        return { 
          ...r, 
          dish_name: value, 
          item_id: foundItem ? foundItem.id : r.item_id,
          sku: dishSku,
          barcode: dishBarcode,
          image_url: foundItem ? foundItem.image_url : r.image_url,
          price: foundItem ? foundItem.price : r.price,
          available_units: units,
          uom: r.uom || units[0] || 'Piece'
        };
      }
      return { ...r, [field]: value };
    }));
  };

  // Dedicated Transfer Request Handlers
  const handleSelectDishTrf = (rowId, dish) => {
    if (!dish) return;
    const units = getItemUnits(dish);
    const defaultUom = units[0] || 'KG';
    const dishSku = dish.short_code || dish.sku || (dish.id ? `SKU-${dish.id}` : '');
    const dishBarcode = dish.barcode || '';
    setTrfDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        dish_name: dish.name,
        item_id: dish.id || null,
        sku: dishSku,
        barcode: dishBarcode,
        image_url: dish.image_url || null,
        price: dish.price || null,
        available_units: units,
        uom: defaultUom,
        requested_qty: r.requested_qty || '1'
      };
    }));
  };

  const handleDishRowChangeTrf = (rowId, field, value) => {
    setTrfDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      if (field === 'dish_name') {
        const foundItem = dishes.find(d => d.name.toLowerCase() === value.toLowerCase());
        const units = foundItem ? getItemUnits(foundItem) : ['KG'];
        const dishSku = foundItem ? (foundItem.short_code || foundItem.sku || `SKU-${foundItem.id}`) : r.sku;
        const dishBarcode = foundItem ? (foundItem.barcode || '') : r.barcode;
        return {
          ...r,
          dish_name: value,
          item_id: foundItem ? foundItem.id : r.item_id,
          sku: dishSku,
          barcode: dishBarcode,
          image_url: foundItem ? foundItem.image_url : r.image_url,
          price: foundItem ? foundItem.price : r.price,
          available_units: units,
          uom: r.uom || units[0] || 'KG'
        };
      }
      return { ...r, [field]: value };
    }));
  };

  const handleAddTrfDishRow = () => {
    setTrfDishRows(prev => {
      const prevItem = prev.length > 0 ? prev[prev.length - 1] : null;
      const inheritedDate = (prevItem && prevItem.needed_by_date) ? prevItem.needed_by_date : new Date().toISOString().split('T')[0];
      const inheritedTime = (prevItem && prevItem.needed_by_time) ? prevItem.needed_by_time : '';
      return [
        ...prev,
        {
          id: Date.now() + Math.random(),
          dish_name: '',
          item_id: null,
          sku: '',
          barcode: '',
          uom: 'KG',
          requested_qty: '',
          needed_by_date: inheritedDate,
          needed_by_time: inheritedTime,
          priority: prevItem?.priority || 'Normal',
          remarks: '',
          image_url: null,
          price: null,
          available_units: [...STANDARD_TOP_UNITS]
        }
      ];
    });
  };

  const handleRemoveTrfDishRow = (rowId) => {
    setTrfDishRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(r => r.id !== rowId);
    });
  };

  // Aliases for handler name variations
  const handleAddDishRowTrf = handleAddTrfDishRow;
  const handleRemoveDishRowTrf = handleRemoveTrfDishRow;

  // Submit Dedicated Transfer Request (Branch to Branch Transfer)
  const handleSubmitTrfRequest = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (submittingTrfRequest || isSubmittingRef.current) return;

    const fromB = (trfFromBranch === 'Other' ? trfCustomFromBranch.trim() : trfFromBranch) || defaultTrfFrom;
    const toB = trfToBranch === 'Other' ? trfCustomToBranch.trim() : trfToBranch;

    if (!fromB) return toast.error('Origin (Sending) Branch is required.');
    if (!toB) return toast.error('Destination (Receiving) Branch is required.');
    if (fromB.toLowerCase() === toB.toLowerCase()) {
      return toast.error('Sending and Receiving branches cannot be the same.');
    }

    // Filter valid rows
    const validRows = trfDishRows.filter(r => r.dish_name && r.dish_name.trim());
    if (validRows.length === 0) {
      return toast.error('Please add at least one item to transfer.');
    }

    for (const [idx, r] of validRows.entries()) {
      const q = parseFloat(r.requested_qty);
      if (isNaN(q) || q <= 0) {
        return toast.error(`Please enter a valid requested quantity for row #${idx + 1} ("${r.dish_name}").`);
      }
      if (!r.uom) {
        return toast.error(`Please select a Unit (UOM) for row #${idx + 1} ("${r.dish_name}").`);
      }
    }

    let finalDeliveryDay = 'Today';
    if (trfDayOption === 'Custom Date') {
      if (!trfCustomDayDate || !trfCustomDayDate.trim()) {
        return toast.error('Please select a valid date for Custom Date.');
      }
      finalDeliveryDay = trfCustomDayDate.trim();
    } else if (trfDayOption === 'Tomorrow') {
      finalDeliveryDay = 'Tomorrow';
    } else {
      finalDeliveryDay = 'Today';
    }

    const combinedNotes = [
      trfPurpose ? `[Purpose: ${trfPurpose === 'Other' ? trfCustomPurpose : trfPurpose}]` : '',
      trfNotes ? trfNotes.trim() : ''
    ].filter(Boolean).join(' ');

    const payload = {
      request_type: 'Transfer Request',
      priority: trfPriority,
      from_branch: fromB,
      to_branch: toB,
      is_external: trfToBranch === 'Other' || trfFromBranch === 'Other',
      delivery_day: finalDeliveryDay,
      notes: combinedNotes,
      items: validRows.map(r => ({
        item_id: r.item_id || null,
        dish_name: r.dish_name.trim(),
        uom: r.uom.trim(),
        requested_qty: parseFloat(r.requested_qty),
        sku: r.sku || null,
        barcode: r.barcode || null,
        remarks: r.remarks ? r.remarks.trim() : null,
        image_url: r.image_url || null,
        price: r.price ? parseFloat(r.price) : null,
        needed_by_time: r.needed_by_time ? r.needed_by_time.trim() : null,
        needed_by_date: r.needed_by_date ? r.needed_by_date.trim() : finalDeliveryDay,
        priority: r.priority || trfPriority || 'Normal'
      }))
    };

    try {
      isSubmittingRef.current = true;
      setSubmittingTrfRequest(true);

      const res = await axios.post('/api/internal-branch/transfers', payload);
      if (res.data?.transfer_id) {
        localActionTransferIdsRef.current.set(`created_${res.data.transfer_id}`, Date.now());
      }
      if (res.data?.id) {
        localActionTransferIdsRef.current.set(`created_${res.data.id}`, Date.now());
      }

      toast.success(`Transfer Request ${res.data?.transfer_id || ''} created successfully! Destination branch (${toB}) notified.`);
      setActiveTab('transfer_request');

      // Reset form
      setTrfDishRows([{ id: Date.now(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'KG', requested_qty: '', needed_by_date: new Date().toISOString().split('T')[0], needed_by_time: '', remarks: '', image_url: null, price: null, available_units: [...STANDARD_TOP_UNITS] }]);
      setTrfCustomFromBranch('');
      setTrfCustomToBranch('');
      setTrfNotes('');
      setTrfPriority('Normal');
      setTrfPurpose('Stock Replenishment');
      setTrfDayOption('Today');
      setTrfCustomDayDate(new Date().toISOString().slice(0, 10));
      fetchStats();
      fetchTransfers();
      // Keep on transfer_request tab so the user immediately sees the sent order in active sent list!
    } catch (err) {
      console.error('Error submitting transfer request:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to submit transfer request.';
      toast.error(msg);
    } finally {
      setSubmittingTrfRequest(false);
      isSubmittingRef.current = false;
    }
  };

  // Submit New Request (Kitchen Food Requisition)
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
      const mins = newDeliveryMinutes === 'custom'
        ? (parseInt(customDeliveryMinutes, 10) || 30)
        : (parseInt(newDeliveryMinutes, 10) || 30);
      const targetDate = new Date(Date.now() + mins * 60 * 1000);
      const formattedNeededBy = newNeededByTime || `${mins} mins (~${targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

      const res = await axios.post('/api/internal-branch/transfers', {
        request_type: 'New Request',
        priority: 'Normal',
        from_branch: effectiveFrom,
        to_branch: effectiveTo,
        needed_by_time: formattedNeededBy,
        delivery_minutes: mins,
        notes: newNotes,
        is_external: isExternal,
        items: newDishRows.map(r => ({
          item_id: r.item_id,
          dish_name: r.dish_name,
          sku: r.sku || null,
          barcode: r.barcode || null,
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
      setNewDishRows([{ id: Date.now(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'KG', requested_qty: '', remarks: '', image_url: null, price: null, available_units: [...STANDARD_TOP_UNITS] }]);
      setCustomFromBranch('');
      setCustomToBranch('');
      setNewNeededByTime('');
      setNewNotes('');
      setNewDeliveryMinutes(30);
      setCustomDeliveryMinutes('');
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

  // 1. Start Processing Action (Pending -> In Progress)
  const handleStartProcessing = async (transferId, trfCode) => {
    try {
      await axios.put(`/api/internal-branch/transfers/${transferId}/start-processing`);
      toast.success(`Transfer ${trfCode} marked as In Progress! Kitchen order preparation started.`);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error starting processing:', err);
      toast.error(err.response?.data?.error || 'Failed to start processing');
    }
  };

  // 2. Extend Delivery Time Action (Supplying branch requests extension)
  const canReviewExtension = useCallback((t) => {
    if (!t || t.extension_status !== 'Pending') return false;
    if (isSuperUser) return true;
    const userBranch = user?.branch;
    if (userBranch && userBranch.toLowerCase() === (t.from_branch || '').toLowerCase()) return true;
    if (user?.id && t.requested_by_user_id && Number(user.id) === Number(t.requested_by_user_id)) return true;
    return false;
  }, [user, isSuperUser]);

  const canRequestExtension = useCallback((t) => {
    if (!t) return false;
    if (t.extension_status === 'Pending') return false;
    if (['Completed', 'Fully Received', 'Partially Received', 'Cancelled'].includes(t.status)) return false;
    if (isSuperUser) return true;
    const userBranch = user?.branch;
    if (userBranch && userBranch.toLowerCase() === (t.to_branch || '').toLowerCase()) return true;
    return false;
  }, [user, isSuperUser]);

  const handleOpenExtendTimeModal = (t) => {
    setExtendTimeTransfer(t);
    setExtendMinutes(15);
    setIsCustomMinutes(false);
    setCustomMinutesInput('');
    setExtendReason('');
  };

  const handleConfirmExtendTime = async () => {
    if (!extendTimeTransfer || extendingTime) return;
    if (!extendReason.trim()) {
      return toast.error('Mandatory reason is required to request delivery time extension.');
    }
    const mins = isCustomMinutes ? parseInt(customMinutesInput, 10) : parseInt(extendMinutes, 10);
    if (isNaN(mins) || mins <= 0) {
      return toast.error('Please enter a valid positive number for extension minutes.');
    }

    try {
      setExtendingTime(true);
      await axios.put(`/api/internal-branch/transfers/${extendTimeTransfer.id}/extend-delivery-time`, {
        additional_minutes: mins,
        reason: extendReason.trim()
      });
      toast.success(`Extension request of +${mins}m submitted to requesting branch for approval.`);
      setExtendTimeTransfer(null);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error requesting delivery time extension:', err);
      toast.error(err.response?.data?.error || 'Failed to request delivery time extension');
    } finally {
      setExtendingTime(false);
    }
  };

  // 2b. Extension Review Actions (Requesting Branch / SuperUser)
  const handleOpenReviewExtensionModal = (t) => {
    setReviewExtensionTransfer(t);
    setReviewAction('accept');
    setModifiedExtensionMinutes(t.pending_extension_minutes || 15);
    setModificationReason('');
    setRejectionReason('');
  };

  const handleAcceptExtension = async (t) => {
    const target = t || reviewExtensionTransfer;
    if (!target || reviewingExtension) return;
    try {
      setReviewingExtension(true);
      await axios.put(`/api/internal-branch/transfers/${target.id}/extension-accept`);
      toast.success(`Extension of +${target.pending_extension_minutes}m approved for Transfer #${target.transfer_id}`);
      setReviewExtensionTransfer(null);
      fetchStats();
      fetchTransfers();
      if (detailModalTransfer?.id === target.id) {
        handleOpenDetailModal(target);
      }
    } catch (err) {
      console.error('Error accepting extension:', err);
      toast.error(err.response?.data?.error || 'Failed to accept extension');
    } finally {
      setReviewingExtension(false);
    }
  };

  const handleModifyExtension = async () => {
    if (!reviewExtensionTransfer || reviewingExtension) return;
    const mins = parseInt(modifiedExtensionMinutes, 10);
    if (isNaN(mins) || mins <= 0) {
      return toast.error('Please enter a valid positive number for modified minutes.');
    }
    try {
      setReviewingExtension(true);
      await axios.put(`/api/internal-branch/transfers/${reviewExtensionTransfer.id}/extension-modify`, {
        modified_minutes: mins,
        reason: modificationReason.trim()
      });
      toast.success(`Extension modified to +${mins}m and approved for Transfer #${reviewExtensionTransfer.transfer_id}`);
      setReviewExtensionTransfer(null);
      fetchStats();
      fetchTransfers();
      if (detailModalTransfer?.id === reviewExtensionTransfer.id) {
        handleOpenDetailModal(reviewExtensionTransfer);
      }
    } catch (err) {
      console.error('Error modifying extension:', err);
      toast.error(err.response?.data?.error || 'Failed to modify extension');
    } finally {
      setReviewingExtension(false);
    }
  };

  const handleRejectExtension = async () => {
    if (!reviewExtensionTransfer || reviewingExtension) return;
    if (!rejectionReason.trim()) {
      return toast.error('Mandatory rejection reason is required.');
    }
    try {
      setReviewingExtension(true);
      await axios.put(`/api/internal-branch/transfers/${reviewExtensionTransfer.id}/extension-reject`, {
        rejection_reason: rejectionReason.trim()
      });
      toast.info(`Extension request rejected for Transfer #${reviewExtensionTransfer.transfer_id}`);
      setReviewExtensionTransfer(null);
      fetchStats();
      fetchTransfers();
      if (detailModalTransfer?.id === reviewExtensionTransfer.id) {
        handleOpenDetailModal(reviewExtensionTransfer);
      }
    } catch (err) {
      console.error('Error rejecting extension:', err);
      toast.error(err.response?.data?.error || 'Failed to reject extension');
    } finally {
      setReviewingExtension(false);
    }
  };

  // 3. Modify Quantities Action (Supplying Branch)
  const handleOpenModifyQtyModal = (t) => {
    setModifyQtyTransfer(t);
    const initQtys = {};
    const initReasons = {};
    (t.items || []).forEach(it => {
      initQtys[it.id] = it.confirmed_qty !== null && it.confirmed_qty !== undefined ? it.confirmed_qty : it.requested_qty;
      initReasons[it.id] = it.quantity_change_reason || '';
    });
    setModifiedItemQuantities(initQtys);
    setModifiedItemReasons(initReasons);
    setModifyGeneralReason('');
  };

  const handleConfirmModifyQty = async () => {
    if (!modifyQtyTransfer || modifyingQty) return;

    // Validate reasons for items with altered quantities
    for (const it of (modifyQtyTransfer.items || [])) {
      const orig = parseFloat(it.requested_qty);
      const updated = parseFloat(modifiedItemQuantities[it.id] ?? orig);
      if (Math.abs(orig - updated) > 0.001) {
        const rsn = (modifiedItemReasons[it.id] || modifyGeneralReason).trim();
        if (!rsn) {
          return toast.error(`Please provide a reason for altering quantity of "${it.dish_name}".`);
        }
      }
    }

    try {
      setModifyingQty(true);
      const itemsPayload = (modifyQtyTransfer.items || []).map(it => ({
        id: it.id,
        confirmed_qty: parseFloat(modifiedItemQuantities[it.id] ?? it.requested_qty),
        reason: (modifiedItemReasons[it.id] || modifyGeneralReason).trim()
      }));

      await axios.put(`/api/internal-branch/transfers/${modifyQtyTransfer.id}/modify-quantities`, {
        items: itemsPayload,
        general_reason: modifyGeneralReason.trim()
      });

      toast.success(`Quantities confirmed & modified for ${modifyQtyTransfer.transfer_id}. Requesting branch notified.`);
      setModifyQtyTransfer(null);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error modifying quantities:', err);
      toast.error(err.response?.data?.error || 'Failed to modify quantities');
    } finally {
      setModifyingQty(false);
    }
  };

  // 4. Ready to Process Actions (Stage 2: Accepted -> Ready to Process)
  const handleBulkReadyToProcess = async (t) => {
    const acceptedItems = (t.items || []).filter(it => it.item_status === 'Accepted');
    if (acceptedItems.length === 0) {
      return toast.error('No Accepted items to mark as Ready to Process.');
    }
    try {
      const res = await axios.put(`/api/internal-branch/transfers/${t.id}/ready-to-process`, {
        item_ids: acceptedItems.map(it => it.id)
      });
      toast.success(`${acceptedItems.length} item(s) marked as Ready to Process!`);
      setTransfers(prev => prev.map(x => String(x.id) === String(t.id) ? { ...x, ...res.data } : x));
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error marking items ready to process:', err);
      toast.error(err.response?.data?.error || 'Failed to mark items ready to process');
    }
  };

  const handleItemReadyToProcess = async (transferId, item) => {
    try {
      const res = await axios.put(`/api/internal-branch/transfers/${transferId}/items/${item.id}/ready-to-process`);
      toast.success(`"${item.dish_name}" is now Ready to Process!`);
      setTransfers(prev => prev.map(x => String(x.id) === String(transferId) ? { ...x, ...res.data } : x));
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error marking item ready to process:', err);
      toast.error(err.response?.data?.error || 'Failed to mark item ready to process');
    }
  };

  const handleMarkReady = async (transferId, trfCode) => {
    try {
      await axios.put(`/api/internal-branch/transfers/${transferId}/ready-to-process`);
      toast.success(`Transfer ${trfCode} marked as Ready to Process!`);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error marking ready:', err);
      toast.error(err.response?.data?.error || 'Failed to mark ready');
    }
  };

  // 5. Open Dispatch & Handover Modal (Stage 3: Ready to Process -> Dispatch)
  const openDispatchModal = (t) => {
    if (dispatching || isDispatchingRef.current) return;
    const readyItems = (t.items || []).filter(it => it.item_status === 'Ready to Process');
    if (readyItems.length === 0) {
      return toast.error("Only items marked 'Ready to Process' can be dispatched. Please mark items Ready to Process first.");
    }
    setDispatchModalTransfer(t);
    setHandoverByName(user?.name || user?.username || 'Kitchen Staff');
    setHandoverToName('');
    setDispatchNotes('');
    const initQtys = {};
    const initRemarks = {};
    const initSelected = {};
    (t.items || []).forEach(item => {
      const isReady = item.item_status === 'Ready to Process';
      initSelected[item.id] = isReady;
      initQtys[item.id] = item.sent_qty !== null && item.sent_qty !== undefined 
        ? item.sent_qty 
        : (item.accepted_qty !== null && item.accepted_qty !== undefined ? item.accepted_qty : (item.confirmed_qty ?? item.requested_qty));
      initRemarks[item.id] = item.remarks || '';
    });
    setDispatchSelectedItems(initSelected);
    setDispatchItemQuantities(initQtys);
    setDispatchItemRemarks(initRemarks);
  };
  const handleOpenDispatchModal = openDispatchModal;

  // Submit Dispatch & Handover
  const handleConfirmDispatch = async () => {
    if (!dispatchModalTransfer || dispatching || isDispatchingRef.current) return;
    if (!handoverToName.trim()) {
      return toast.error('Please specify Handover To (Driver / Branch Representative Name).');
    }

    const readyItems = (dispatchModalTransfer.items || []).filter(item => item.item_status === 'Ready to Process');
    const itemsPayload = readyItems.map(item => {
      const isSelected = dispatchSelectedItems[item.id] !== undefined ? dispatchSelectedItems[item.id] : true;
      return {
        id: item.id,
        is_dispatched: isSelected,
        mark_pending: !isSelected,
        sent_qty: isSelected ? parseFloat(dispatchItemQuantities[item.id] || 0) : 0,
        remarks: dispatchItemRemarks[item.id] || ''
      };
    });

    const hasAnyDispatched = itemsPayload.some(it => it.is_dispatched && it.sent_qty > 0);
    if (!hasAnyDispatched) {
      return toast.error('Please check at least one item with quantity > 0 to dispatch.');
    }

    try {
      isDispatchingRef.current = true;
      setDispatching(true);

      await axios.put(`/api/internal-branch/transfers/${dispatchModalTransfer.id}/dispatch`, {
        handover_by_name: handoverByName.trim(),
        handover_to_name: handoverToName.trim(),
        notes: dispatchNotes.trim(),
        items: itemsPayload
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`dispatched_${dispatchModalTransfer.transfer_id}`, Date.now());
      localActionTransferIdsRef.current.set(`dispatched_${dispatchModalTransfer.id}`, Date.now());

      toast.success(`Transfer ${dispatchModalTransfer.transfer_id} handed over & marked as Dispatched!`);
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

  // 6. Open Receive Modal
  const openReceiveModal = (t) => {
    if (receiving || isReceivingRef.current) return;
    setReceiveModalTransfer(t);
    setDiscrepancyReason('');
    setReceiveNotes('');
    const initQtys = {};
    const initRemarks = {};
    const initSelected = {};
    (t.items || []).forEach(item => {
      // Only items that were dispatched (sent_qty > 0 or dispatched_qty > 0) are eligible to be received
      const sentAmount = parseFloat(item.sent_qty !== null && item.sent_qty !== undefined ? item.sent_qty : (item.dispatched_qty ?? 0));
      const isEligible = sentAmount > 0;
      initSelected[item.id] = isEligible;
      initQtys[item.id] = item.received_qty !== null && item.received_qty !== undefined
        ? item.received_qty
        : (sentAmount > 0 ? sentAmount : (item.confirmed_qty ?? item.requested_qty));
      initRemarks[item.id] = item.remarks || '';
    });
    setReceiveSelectedItems(initSelected);
    setReceiveItemQuantities(initQtys);
    setReceiveItemRemarks(initRemarks);
  };

  // Submit Receiving & Quantity Verification
  const handleConfirmReceive = async (autoPrint = false) => {
    if (!receiveModalTransfer || receiving || isReceivingRef.current) return;

    const itemsPayload = (receiveModalTransfer.items || []).map(item => {
      const isSelected = receiveSelectedItems[item.id] !== undefined ? receiveSelectedItems[item.id] : true;
      return {
        id: item.id,
        is_received: isSelected,
        mark_pending: !isSelected,
        received_qty: isSelected ? parseFloat(receiveItemQuantities[item.id] || 0) : 0,
        remarks: receiveItemRemarks[item.id] || ''
      };
    });

    const hasAnyReceived = itemsPayload.some(it => it.is_received && it.received_qty > 0);
    if (!hasAnyReceived) {
      return toast.error('Please select at least one dispatched item with received quantity > 0 to confirm receiving.');
    }

    // Check if any discrepancy exists between sent and received for selected items
    let hasVariance = false;
    (receiveModalTransfer.items || []).forEach(it => {
      if (receiveSelectedItems[it.id] === false) return; // Unchecked items will be received later
      const sentQ = parseFloat(it.sent_qty !== null ? it.sent_qty : (it.confirmed_qty ?? it.requested_qty));
      const recQ = parseFloat(receiveItemQuantities[it.id] ?? sentQ);
      if (Math.abs(recQ - sentQ) > 0.001) {
        hasVariance = true;
      }
    });

    if (hasVariance && !discrepancyReason.trim()) {
      return toast.error('Discrepancy detected between Sent and Received quantities. A Discrepancy Reason is mandatory!');
    }

    try {
      isReceivingRef.current = true;
      setReceiving(true);

      const res = await axios.put(`/api/internal-branch/transfers/${receiveModalTransfer.id}/receive`, {
        items: itemsPayload,
        notes: receiveNotes,
        discrepancy_reason: discrepancyReason.trim()
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`received_${receiveModalTransfer.transfer_id}`, Date.now());
      localActionTransferIdsRef.current.set(`received_${receiveModalTransfer.id}`, Date.now());

      const statusRes = res.data?.status || (hasVariance ? 'Partially Received' : 'Fully Received');
      toast.success(`Transfer ${receiveModalTransfer.transfer_id} verified: Status is ${statusRes}!`);

      if (autoPrint) {
        const printPayload = {
          ...receiveModalTransfer,
          ...(res.data || {}),
          status: statusRes,
          received_at: res.data?.received_at || new Date().toISOString(),
          received_by_name: res.data?.received_by_name || user?.name || user?.username || 'Staff',
          items: res.data?.items || (receiveModalTransfer.items || []).map(it => {
            const isSelected = receiveSelectedItems[it.id] !== undefined ? receiveSelectedItems[it.id] : true;
            const recQ = isSelected ? parseFloat(receiveItemQuantities[it.id] || 0) : (it.received_qty || 0);
            return {
              ...it,
              received_qty: recQ,
              item_status: isSelected && recQ > 0 ? 'Received' : (it.item_status || 'Pending')
            };
          })
        };
        printTransferSlip(printPayload);
      }

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

  // Direct Receive & Accept from card without opening modal (accepting 100% dispatched quantities)
  const handleDirectReceive = async (t, autoPrint = false) => {
    if (!t || receiving || isReceivingRef.current) return;

    const itemsPayload = (t.items || []).map(item => {
      const sentQ = parseFloat(item.sent_qty !== null && item.sent_qty !== undefined ? item.sent_qty : (item.dispatched_qty ?? (item.confirmed_qty ?? item.requested_qty)));
      return {
        id: item.id,
        is_received: true,
        mark_pending: false,
        received_qty: sentQ > 0 ? sentQ : parseFloat(item.requested_qty || 0),
        remarks: ''
      };
    });

    const hasAnyReceived = itemsPayload.some(it => it.received_qty > 0);
    if (!hasAnyReceived) {
      return toast.error('No dispatched items available to receive.');
    }

    try {
      isReceivingRef.current = true;
      setReceiving(true);

      const res = await axios.put(`/api/internal-branch/transfers/${t.id}/receive`, {
        items: itemsPayload,
        notes: t.notes || '',
        discrepancy_reason: ''
      });

      localActionTransferIdsRef.current.set(`received_${t.transfer_id}`, Date.now());
      localActionTransferIdsRef.current.set(`received_${t.id}`, Date.now());

      const statusRes = res.data?.status || 'Fully Received';
      toast.success(`Transfer ${t.transfer_id} received: Status is ${statusRes}!`);

      if (autoPrint) {
        const printPayload = {
          ...t,
          ...(res.data || {}),
          status: statusRes,
          received_at: res.data?.received_at || new Date().toISOString(),
          received_by_name: res.data?.received_by_name || user?.name || user?.username || 'Staff',
          items: res.data?.items || (t.items || []).map(it => {
            const sentQ = parseFloat(it.sent_qty !== null && it.sent_qty !== undefined ? it.sent_qty : (it.dispatched_qty ?? (it.confirmed_qty ?? it.requested_qty)));
            return {
              ...it,
              received_qty: sentQ,
              item_status: 'Received'
            };
          })
        };
        printTransferSlip(printPayload);
      }

      if (receiveModalTransfer && receiveModalTransfer.id === t.id) {
        setReceiveModalTransfer(null);
      }
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error receiving transfer directly:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to receive transfer.';
      toast.error(msg);
    } finally {
      setReceiving(false);
      isReceivingRef.current = false;
    }
  };

  // 7. Mark as Completed Action
  const handleMarkCompleted = async (transferId, trfCode) => {
    try {
      await axios.put(`/api/internal-branch/transfers/${transferId}/complete`);
      toast.success(`Transfer ${trfCode} marked as Completed!`);
      fetchStats();
      fetchTransfers();
    } catch (err) {
      console.error('Error completing transfer:', err);
      toast.error(err.response?.data?.error || 'Failed to complete transfer');
    }
  };

  // 8. Open Detail Modal with Activity Logs
  const handleOpenDetailModal = async (t) => {
    setDetailModalTransfer(t);
    setDetailModalTab('summary');
    setActivityLogs([]);
    try {
      setLoadingActivityLogs(true);
      const res = await axios.get(`/api/internal-branch/transfers/${t.id}/activity-logs`);
      setActivityLogs(res.data || []);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setLoadingActivityLogs(false);
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

  // Modify Request Handlers (Requesting branch modifies request before dispatch)
  const handleOpenEditRequestModal = (transfer) => {
    setEditTransferModal(transfer);
    setEditPriority(transfer.priority || 'Normal');
    // Day Selection
    const day = transfer.delivery_day || 'Today';
    if (day === 'Today' || day === 'Tomorrow') {
      setEditDayOption(day);
      setEditCustomDayDate(new Date().toISOString().slice(0, 10));
    } else {
      setEditDayOption('Custom Date');
      setEditCustomDayDate(day);
    }
    setEditNotes(transfer.notes || '');
    setEditReason('');

    // Pre-populate dish rows from transfer.items, locking already accepted items
    if (transfer.items && Array.isArray(transfer.items) && transfer.items.length > 0) {
      const rows = transfer.items.map((it, idx) => {
        const matchedDish = (dishes || []).find(d => d.id === it.item_id || (d.name && d.name.toLowerCase() === it.dish_name?.toLowerCase()));
        const units = matchedDish ? getItemUnits(matchedDish) : (it.uom ? [it.uom] : ['Piece']);
        const isLocked = it.item_status === 'Accepted';
        return {
          id: it.id || (Date.now() + idx),
          dish_name: it.dish_name || '',
          item_id: it.item_id || null,
          sku: it.sku || (matchedDish ? (matchedDish.short_code || matchedDish.sku) : ''),
          barcode: it.barcode || (matchedDish ? matchedDish.barcode : ''),
          uom: it.uom || (units[0] || 'Piece'),
          available_units: units,
          requested_qty: it.requested_qty || 1,
          remarks: it.remarks || '',
          image_url: it.image_url || matchedDish?.image_url || null,
          price: it.price || matchedDish?.price || null,
          item_status: it.item_status || 'Pending',
          isLocked: isLocked,
          needed_by_time: it.needed_by_time || null,
          needed_by_date: it.needed_by_date || null
        };
      });
      setEditDishRows(rows);
    } else {
      setEditDishRows([
        { id: Date.now(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'], item_status: 'Pending', isLocked: false }
      ]);
    }
  };

  const handleEditDishRowChange = (id, field, value) => {
    setEditDishRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleSelectDishEdit = (rowId, dish) => {
    const units = getItemUnits(dish);
    const defaultUom = units[0] || 'Piece';
    const dishSku = dish.short_code || dish.sku || (dish.id ? `SKU-${dish.id}` : '');
    const dishBarcode = dish.barcode || '';

    setEditDishRows(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        dish_name: dish.name,
        item_id: dish.id,
        sku: dishSku,
        barcode: dishBarcode,
        uom: defaultUom,
        available_units: units,
        image_url: dish.image_url || null,
        price: dish.price || null
      };
    }));
  };

  const handleAddEditDishRow = () => {
    setEditDishRows(prev => [
      ...prev,
      { id: Date.now() + Math.random(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'Piece', requested_qty: '', remarks: '', image_url: null, price: null, available_units: ['Piece'], item_status: 'Pending', isLocked: false }
    ]);
  };

  const handleRemoveEditDishRow = (rowId) => {
    const rowToRemove = editDishRows.find(r => r.id === rowId);
    if (rowToRemove?.isLocked) {
      toast.error(`Cannot remove "${rowToRemove.dish_name}" because it has already been accepted by receiving branch.`);
      return;
    }
    if (editDishRows.length <= 1) {
      toast.error('At least one item is required in the request.');
      return;
    }
    setEditDishRows(prev => prev.filter(r => r.id !== rowId));
  };

  const handleSaveEditRequest = async (e) => {
    e.preventDefault();
    if (!editTransferModal) return;

    const validItems = editDishRows.filter(r => r.dish_name && r.dish_name.trim());
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item with dish name.');
      return;
    }

    for (const [idx, item] of validItems.entries()) {
      const q = parseFloat(item.requested_qty);
      if (isNaN(q) || q <= 0) {
        toast.error(`Please enter a valid positive quantity for item #${idx + 1} (${item.dish_name}).`);
        return;
      }
      if (!item.uom) {
        toast.error(`Please select a unit of measurement for item #${idx + 1} (${item.dish_name}).`);
        return;
      }
    }

    if (!editReason || !editReason.trim()) {
      toast.error('Please enter a brief reason for modifying the request (required for audit log).');
      return;
    }

    setSavingEditRequest(true);
    try {
      const finalDay = editDayOption === 'Custom Date' ? editCustomDayDate : editDayOption;

      const res = await axios.put(`/api/internal-branch/transfers/${editTransferModal.id}/edit-request`, {
        items: validItems,
        priority: editPriority,
        delivery_day: finalDay,
        notes: editNotes,
        reason: editReason.trim()
      });

      // Record local action to avoid duplicate socket toast
      localActionTransferIdsRef.current.set(`req_mod_${editTransferModal.id}`, Date.now());

      toast.success(`Transfer Request #${editTransferModal.transfer_id} updated successfully!`);
      setEditTransferModal(null);
      fetchTransfers();
      fetchStats();
      if (detailModalTransfer && detailModalTransfer.id === editTransferModal.id) {
        setDetailModalTransfer(res.data);
      }
    } catch (err) {
      console.error('Failed to update transfer request:', err);
      toast.error(err.response?.data?.error || 'Failed to update transfer request');
    } finally {
      setSavingEditRequest(false);
    }
  };

  // Accept and Done Detailed Modal Handlers: Open confirmation modal with independent item actions
  const handleOpenAcceptAndDoneModal = (transfer) => {
    const rawItems = transfer.items || [];
    const initialItems = rawItems.map(it => {
      const curStatus = it.item_status || 'Pending';
      const isAlreadyAccepted = curStatus === 'Accepted';
      const isAlreadyRejected = curStatus === 'Rejected';
      const defaultQty = it.accepted_qty !== null && it.accepted_qty !== undefined
        ? parseFloat(it.accepted_qty)
        : (itemAcceptedQtys[it.id] !== undefined ? parseFloat(itemAcceptedQtys[it.id]) : parseFloat(it.requested_qty || 0));

      return {
        id: it.id,
        item_id: it.item_id,
        dish_name: it.dish_name,
        uom: it.uom || 'Pices',
        requested_qty: parseFloat(it.requested_qty || 0),
        current_status: curStatus,
        // Default action: preserve existing status or default pending to Accept
        action: isAlreadyAccepted ? 'Accept' : (isAlreadyRejected ? 'Reject' : 'Accept'),
        accepted_qty: defaultQty,
        modification_reason: it.modification_reason || '',
        rejection_reason: it.rejection_reason || '',
        sku: it.sku || (it.item_id ? `SKU-${it.item_id}` : ''),
        image_url: it.image_url || ''
      };
    });

    setAcceptAndDoneModal({
      transfer,
      items: initialItems,
      saving: false
    });
  };

  const handleSaveAcceptAndDoneModal = async () => {
    if (!acceptAndDoneModal) return;
    const { transfer, items } = acceptAndDoneModal;

    // Validation
    for (const it of items) {
      if (it.action === 'Reject') {
        if (!it.rejection_reason || !it.rejection_reason.trim()) {
          return toast.error(`Please provide a rejection reason for "${it.dish_name}".`);
        }
      }
      if (it.action === 'Accept') {
        const accQ = parseFloat(it.accepted_qty);
        if (isNaN(accQ) || accQ < 0) {
          return toast.error(`Please enter a valid accepted quantity for "${it.dish_name}".`);
        }
        if (Math.abs(accQ - it.requested_qty) > 0.0001) {
          if (!it.modification_reason || !it.modification_reason.trim()) {
            return toast.error(`Please provide a reason for modifying quantity for "${it.dish_name}" (from ${it.requested_qty} to ${accQ} ${it.uom}).`);
          }
        }
      }
    }

    try {
      setAcceptAndDoneModal(prev => ({ ...prev, saving: true }));

      const payload = {
        decisions: items.map(it => ({
          item_id: it.id,
          action: it.action,
          accepted_qty: it.action === 'Accept' ? parseFloat(it.accepted_qty) : null,
          modification_reason: it.action === 'Accept' ? (it.modification_reason || '').trim() : null,
          rejection_reason: it.action === 'Reject' ? (it.rejection_reason || '').trim() : null
        }))
      };

      const res = await axios.put(`/api/internal-branch/transfers/${transfer.id}/batch-process-items`, payload);

      setTransfers(prev => prev.map(t => String(t.id) === String(transfer.id) ? { ...t, ...res.data } : t));
      toast.success(`Decisions saved successfully for Transfer #${transfer.transfer_id}!`);
      setAcceptAndDoneModal(null);
      fetchTransfers();
      fetchStats();
      if (detailModalTransfer && String(detailModalTransfer.id) === String(transfer.id)) {
        setDetailModalTransfer(res.data);
      }
    } catch (err) {
      console.error('Failed to save Accept and Done changes:', err);
      toast.error(err.response?.data?.error || 'Failed to save item changes');
      setAcceptAndDoneModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Item-Level Acceptance & Rejection Handlers (With Quantity Modification & Mandatory Reason Rules)
  const handleOpenAcceptItemModal = (transferId, item) => {
    setAcceptItemModal({
      transferId,
      item,
      acceptedQty: item.accepted_qty !== null && item.accepted_qty !== undefined ? item.accepted_qty : item.requested_qty,
      reason: item.modification_reason || '',
      saving: false
    });
  };

  const handleConfirmAcceptItem = async () => {
    if (!acceptItemModal) return;
    const { transferId, item, acceptedQty, reason } = acceptItemModal;
    const numQty = parseFloat(acceptedQty);
    if (isNaN(numQty) || numQty < 0) {
      return toast.error('Please enter a valid accepted quantity.');
    }

    const reqQty = parseFloat(item.requested_qty || 0);
    const isModified = Math.abs(numQty - reqQty) > 0.0001;
    if (isModified && (!reason || !reason.trim())) {
      return toast.error('A reason is mandatory when modifying the requested quantity.');
    }

    try {
      setAcceptItemModal(prev => ({ ...prev, saving: true }));
      const res = await axios.put(`/api/internal-branch/transfers/${transferId}/items/${item.id}/accept`, {
        accepted_qty: numQty,
        modification_reason: reason.trim()
      });

      // Update local transfers list immediately for real-time reactivity
      setTransfers(prev => prev.map(t => String(t.id) === String(transferId) ? { ...t, ...res.data } : t));
      toast.success(`Item "${item.dish_name}" accepted (${numQty} ${item.uom})`);
      setAcceptItemModal(null);
      fetchTransfers();
      fetchStats();
      if (detailModalTransfer && String(detailModalTransfer.id) === String(transferId)) {
        setDetailModalTransfer(res.data);
      }
    } catch (err) {
      console.error('Failed to accept item:', err);
      toast.error(err.response?.data?.error || 'Failed to accept item');
      setAcceptItemModal(prev => ({ ...prev, saving: false }));
    }
  };

  const handleOpenRejectItemModal = (transferId, item) => {
    setRejectItemModal({
      transferId,
      item,
      reason: '',
      saving: false
    });
  };

  const handleConfirmRejectItem = async () => {
    if (!rejectItemModal) return;
    const { transferId, item, reason } = rejectItemModal;
    if (!reason || !reason.trim()) {
      return toast.error('A rejection reason is mandatory before rejecting an item.');
    }

    try {
      setRejectItemModal(prev => ({ ...prev, saving: true }));
      const res = await axios.put(`/api/internal-branch/transfers/${transferId}/items/${item.id}/reject`, {
        rejection_reason: reason.trim()
      });

      // Update local transfers list immediately for real-time reactivity
      setTransfers(prev => prev.map(t => String(t.id) === String(transferId) ? { ...t, ...res.data } : t));
      toast.success(`Item "${item.dish_name}" rejected`);
      setRejectItemModal(null);
      fetchTransfers();
      fetchStats();
      if (detailModalTransfer && String(detailModalTransfer.id) === String(transferId)) {
        setDetailModalTransfer(res.data);
      }
    } catch (err) {
      console.error('Failed to reject item:', err);
      toast.error(err.response?.data?.error || 'Failed to reject item');
      setRejectItemModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Fast Accept Handler (No confirmation modal if quantity unchanged)
  const handleFastAcceptItem = async (transferId, item, acceptedQty) => {
    try {
      const res = await axios.put(`/api/internal-branch/transfers/${transferId}/items/${item.id}/accept`, {
        accepted_qty: acceptedQty,
        modification_reason: ''
      });
      setTransfers(prev => prev.map(t => String(t.id) === String(transferId) ? { ...t, ...res.data } : t));
      toast.success(`Item "${item.dish_name}" accepted (${acceptedQty} ${item.uom})`);
      fetchTransfers();
      fetchStats();
      if (detailModalTransfer && String(detailModalTransfer.id) === String(transferId)) {
        setDetailModalTransfer(res.data);
      }
    } catch (err) {
      console.error('Failed to fast accept item:', err);
      toast.error(err.response?.data?.error || 'Failed to accept item');
    }
  };

  // Bulk Accept All Click Handler
  const handleAcceptAllClick = async (transfer) => {
    const pendingItems = (transfer.items || []).filter(it => it.item_status === 'Pending' || !it.item_status);
    if (pendingItems.length === 0) {
      return toast.info('No pending items to accept in this transfer.');
    }

    const modifiedItems = [];
    pendingItems.forEach(it => {
      const customQty = itemAcceptedQtys[it.id] !== undefined ? parseFloat(itemAcceptedQtys[it.id]) : parseFloat(it.requested_qty);
      if (Math.abs(customQty - parseFloat(it.requested_qty)) > 0.0001) {
        modifiedItems.push({ ...it, customQty });
      }
    });

    if (modifiedItems.length === 0) {
      // Direct Fast Accept All with NO modal!
      try {
        const res = await axios.put(`/api/internal-branch/transfers/${transfer.id}/accept-all`);
        setTransfers(prev => prev.map(t => t.id === transfer.id ? { ...t, ...res.data } : t));
        toast.success(`All items in Transfer #${transfer.transfer_id} accepted!`);
        fetchTransfers();
        fetchStats();
      } catch (err) {
        console.error('Failed to accept all items:', err);
        toast.error(err.response?.data?.error || 'Failed to accept all items');
      }
    } else {
      // Open confirmation modal displaying modified items and mandatory reason
      setAcceptAllConfirmModal({
        transfer,
        modifiedItems,
        reason: '',
        saving: false
      });
    }
  };

  // Confirm Accept All with modifications
  const handleConfirmAcceptAllWithModifications = async () => {
    if (!acceptAllConfirmModal) return;
    const { transfer, modifiedItems, reason } = acceptAllConfirmModal;
    if (!reason || !reason.trim()) {
      return toast.error('A reason is mandatory when bulk accepting with modified quantities.');
    }

    try {
      setAcceptAllConfirmModal(prev => ({ ...prev, saving: true }));
      const itemsPayload = modifiedItems.map(it => ({
        id: it.id,
        accepted_qty: it.customQty,
        modification_reason: reason.trim()
      }));

      const res = await axios.put(`/api/internal-branch/transfers/${transfer.id}/accept-all`, {
        items: itemsPayload,
        modification_reason: reason.trim()
      });

      setTransfers(prev => prev.map(t => t.id === transfer.id ? { ...t, ...res.data } : t));
      toast.success(`All items accepted with modifications for Transfer #${transfer.transfer_id}!`);
      setAcceptAllConfirmModal(null);
      fetchTransfers();
      fetchStats();
    } catch (err) {
      console.error('Failed to accept all items with modifications:', err);
      toast.error(err.response?.data?.error || 'Failed to accept all items');
      setAcceptAllConfirmModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Confirm Reject All
  const handleConfirmRejectAll = async () => {
    if (!rejectAllModal) return;
    const { transfer, reason } = rejectAllModal;
    if (!reason || !reason.trim()) {
      return toast.error('A rejection reason is mandatory before rejecting all items.');
    }

    try {
      setRejectAllModal(prev => ({ ...prev, saving: true }));
      const res = await axios.put(`/api/internal-branch/transfers/${transfer.id}/reject-all`, {
        rejection_reason: reason.trim()
      });

      setTransfers(prev => prev.map(t => t.id === transfer.id ? { ...t, ...res.data } : t));
      toast.success(`All pending items rejected for Transfer #${transfer.transfer_id}`);
      setRejectAllModal(null);
      fetchTransfers();
      fetchStats();
    } catch (err) {
      console.error('Failed to reject all items:', err);
      toast.error(err.response?.data?.error || 'Failed to reject all items');
      setRejectAllModal(prev => ({ ...prev, saving: false }));
    }
  };

  // Confirm Clear All Active Transfers (Safety: only cancels active transfers, logs preserved)
  const handleConfirmClearAll = async () => {
    if (!clearAllReason || !clearAllReason.trim()) {
      return toast.error('A reason is mandatory before clearing all active transfer requests.');
    }

    try {
      setClearingAll(true);
      const res = await axios.put('/api/internal-branch/transfers/clear-all', {
        cancellation_reason: clearAllReason.trim()
      });

      toast.success(res.data?.message || 'All active transfers successfully cleared.');
      setClearAllModalOpen(false);
      setClearAllReason('');
      fetchTransfers();
      fetchStats();
    } catch (err) {
      console.error('Failed to clear active transfers:', err);
      toast.error(err.response?.data?.error || 'Failed to clear active transfers');
    } finally {
      setClearingAll(false);
    }
  };

  // Two-Level Row Layout: Row 1 = Common Transfer Summary, Row 2 = Dish Items Table
  const renderTransferCardRow = (t, isIncoming, isReceival = false) => {
    const hasUnacceptedItems = (t.items || []).some(it => it.item_status === 'Pending' || !it.item_status);
    const hasAcceptedItems = (t.items || []).some(it => it.item_status === 'Accepted');
    const hasReadyItems = (t.items || []).some(it => it.item_status === 'Ready to Process');
    const canModify = !isReceival && ['Pending', 'In Progress', 'Partially Accepted'].includes(t.status) && hasUnacceptedItems;
    const canAcceptReject = !isReceival && (isSuperUser || isIncoming || (user?.branch === t.to_branch));
    const items = t.items || [];

    return (
      <div
        key={`trf-row-${t.id}-${isReceival ? 'rec' : (isIncoming ? 'inc' : 'sent')}`}
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginBottom: 16,
          overflow: 'hidden'
        }}
      >
        {/* ROW 1: Common Transfer Summary Header */}
        <div style={{
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          {/* Left summary items */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{t.transfer_id}</span>
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                background: t.request_type === 'New Request' ? '#f0fdf4' : '#eff6ff',
                color: t.request_type === 'New Request' ? '#15803d' : '#1d4ed8',
                border: t.request_type === 'New Request' ? '1px solid #bbf7d0' : '1px solid #bfdbfe'
              }}>
                {t.request_type || 'Transfer Request'}
              </span>
              <PriorityBadge priority={t.priority} />
              <span style={{
                padding: '3px 10px',
                borderRadius: 12,
                fontSize: 11.5,
                fontWeight: 700,
                background: t.status === 'Pending' ? '#fef3c7' : (t.status === 'Partially Accepted' ? '#fef9c3' : (['In Progress', 'Dispatched', 'In-Transit', 'Partially Dispatched'].includes(t.status) ? '#dbeafe' : (t.status === 'Ready for Dispatch' ? '#f3e8ff' : '#dcfce7'))),
                color: t.status === 'Pending' ? '#92400e' : (t.status === 'Partially Accepted' ? '#854d0e' : (['In Progress', 'Dispatched', 'In-Transit', 'Partially Dispatched'].includes(t.status) ? '#1e40af' : (t.status === 'Ready for Dispatch' ? '#6b21a8' : '#166534'))),
                border: '1px solid ' + (t.status === 'Pending' ? '#fde68a' : (t.status === 'Partially Accepted' ? '#fde047' : (['In Progress', 'Dispatched', 'In-Transit', 'Partially Dispatched'].includes(t.status) ? '#bfdbfe' : (t.status === 'Ready for Dispatch' ? '#e9d5ff' : '#bbf7d0'))))
              }}>
                {t.status === 'Dispatched' ? 'In-Transit' : t.status}
              </span>
            </div>

            {/* Branches: From -> To */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>From:</span>
              <BranchBadge branch={t.from_branch} />
              <ArrowRight size={14} color="#94a3b8" />
              <span style={{ color: '#64748b', fontWeight: 600 }}>To:</span>
              <BranchBadge branch={t.to_branch} />
            </div>

            {/* Requested By */}
            <div style={{ fontSize: 12.5, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={13} color="#94a3b8" />
              <span>By: <strong>{t.requested_by_name || 'Staff'}</strong></span>
            </div>

            {/* Request Date & Time */}
            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} color="#94a3b8" />
              <span>{new Date(t.request_date).toLocaleString()}</span>
            </div>

            {/* Day */}
            <div style={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Day:</span>
              <span style={{
                background: '#f1f5f9',
                color: '#0f172a',
                padding: '2px 8px',
                borderRadius: 5,
                fontWeight: 700,
                fontSize: 11.5,
                border: '1px solid #cbd5e1'
              }}>
                {t.delivery_day || 'Today'}
              </span>
            </div>

            {/* Dispatched Time (if dispatched) */}
            {t.dispatched_at && (
              <div style={{ fontSize: 12, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                <Truck size={13} color="#2563eb" />
                <span>Dispatched: {new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
          </div>

          {/* Right Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {isReceival ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenDetailModal(t)}
                  style={{
                    padding: '6px 12px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="View full transfer details & timeline"
                >
                  <ClipboardList size={13} /> Details
                </button>
                <button
                  type="button"
                  onClick={() => printDispatchedItemsSlip(t)}
                  style={{
                    padding: '6px 10px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Print 80mm Dispatched Voucher"
                >
                  <Printer size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => openReceiveModal(t)}
                  style={{
                    padding: '6px 14px',
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.25)'
                  }}
                  title="Verify and confirm receiving goods"
                >
                  <PackageCheck size={14} /> Verify & Receive
                </button>
              </>
            ) : (
              <>
                {/* Bulk Actions for Incoming Requests */}
                {isIncoming && canAcceptReject && (['Pending', 'Partially Accepted', 'In Progress'].includes(t.status)) && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenAcceptAndDoneModal(t)}
                      style={{
                        padding: '6px 12px',
                        background: '#16a34a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Open detailed confirmation modal to review and process items"
                    >
                      <CheckCheck size={13} /> Accept and Done
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAcceptAllClick(t)}
                      style={{
                        padding: '6px 12px',
                        background: '#15803d',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Accept all pending items in this transfer request"
                    >
                      <CheckCircle2 size={13} /> Accept All
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectAllModal({ transfer: t, reason: '', saving: false })}
                      style={{
                        padding: '6px 12px',
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                      title="Reject all pending items in this transfer request (requires reason)"
                    >
                      <XCircle size={13} /> Reject All
                    </button>
                  </>
                )}

                {/* Modify Request */}
                {canModify ? (
                  <button
                    type="button"
                    onClick={() => handleOpenEditRequestModal(t)}
                    style={{
                      padding: '6px 12px',
                      background: '#fff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#2563eb',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                    title="Modify unaccepted requested dishes or quantities"
                  >
                    <Edit size={13} /> Modify
                  </button>
                ) : (!isIncoming && hasAcceptedItems && ['Pending', 'In Progress'].includes(t.status)) ? (
                  <span style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: '#dcfce7',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Lock size={12} /> Accepted - Locked
                  </span>
                ) : null}

                {/* Detail View */}
                <button
                  type="button"
                  onClick={() => handleOpenDetailModal(t)}
                  style={{
                    padding: '6px 12px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="View full transfer details & timeline"
                >
                  <ClipboardList size={13} /> Details
                </button>

                {/* Print Slip */}
                <button
                  type="button"
                  onClick={() => printTransferSlip(t)}
                  style={{
                    padding: '6px 10px',
                    background: '#fff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Print 80mm Transfer Voucher"
                >
                  <Printer size={13} />
                </button>

                {/* Cancel (for sent pending requests) */}
                {!isIncoming && canModify && (
                  <button
                    type="button"
                    onClick={() => handleCancelTransfer(t.id, t.transfer_id)}
                    style={{
                      padding: '6px 10px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#dc2626',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title="Cancel Transfer Request"
                  >
                    <Trash2 size={13} />
                  </button>
                )}

              </>
            )}
          </div>
        </div>

        {/* Extension Request Banner (If applicable) */}
        {t.extension_status === 'Pending' && (
          <div style={{
            background: '#fffbeb',
            borderBottom: '1px solid #fcd34d',
            padding: '8px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400e' }}>
              <Timer size={14} color="#d97706" />
              <strong>Time Extension Requested: +{t.pending_extension_minutes}m</strong>
              <span>— Reason: "{t.pending_extension_reason || 'Kitchen preparation delay'}"</span>
            </div>
            {canReviewExtension(t) && (
              <button
                type="button"
                onClick={() => handleOpenReviewExtensionModal(t)}
                style={{
                  padding: '4px 10px',
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 5,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Review Extension
              </button>
            )}
          </div>
        )}

        {/* ROW 2: Dish Items Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '8px 12px', width: 32, color: '#64748b', fontWeight: 700 }}>#</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 700 }}>Dish Name</th>
                <th style={{ padding: '8px 12px', width: 65, color: '#475569', fontWeight: 700, textAlign: 'center' }}>Unit</th>
                <th style={{ padding: '8px 10px', width: 75, color: '#475569', fontWeight: 700, textAlign: 'right' }}>Requested</th>
                <th style={{ padding: '8px 10px', width: 90, color: '#475569', fontWeight: 700, textAlign: 'right' }}>Accepted</th>
                <th style={{ padding: '8px 10px', width: 75, color: '#475569', fontWeight: 700, textAlign: 'right' }}>Dispatched</th>
                <th style={{ padding: '8px 10px', width: 75, color: '#475569', fontWeight: 700, textAlign: 'right' }}>Received</th>
                <th style={{ padding: '8px 10px', width: 75, color: '#475569', fontWeight: 700, textAlign: 'right' }}>Remaining</th>
                <th style={{ padding: '8px 10px', width: 105, color: '#475569', fontWeight: 700, textAlign: 'center' }}>Need By</th>
                <th style={{ padding: '8px 10px', width: 95, color: '#475569', fontWeight: 700, textAlign: 'center' }}>Status</th>
                <th style={{ padding: '8px 12px', color: '#475569', fontWeight: 700 }}>Reason / Remarks</th>
                <th style={{ padding: '8px 12px', width: 155, color: '#475569', fontWeight: 700, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>No dishes listed in this request.</td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  const itemStatus = it.item_status || 'Pending';
                  const isItemPending = itemStatus === 'Pending' || !it.item_status;
                  const isAccepted = itemStatus === 'Accepted';
                  const isReadyToProcess = itemStatus === 'Ready to Process';
                  const reqQty = parseFloat(it.requested_qty || 0);
                  const accQty = it.accepted_qty !== null && it.accepted_qty !== undefined ? parseFloat(it.accepted_qty) : (it.confirmed_qty !== null && it.confirmed_qty !== undefined ? parseFloat(it.confirmed_qty) : null);
                  const dispQty = it.sent_qty !== null && it.sent_qty !== undefined ? parseFloat(it.sent_qty) : (it.dispatched_qty !== null && it.dispatched_qty !== undefined ? parseFloat(it.dispatched_qty) : 0);
                  const recQty = it.received_qty !== null && it.received_qty !== undefined ? parseFloat(it.received_qty) : 0;
                  const remQty = isReceival ? (dispQty > 0 ? Math.max(0, dispQty - recQty) : 0) : Math.max(0, (accQty !== null ? accQty : reqQty) - recQty);
                  const isDispatched = itemStatus === 'Dispatched' || (dispQty > 0 && itemStatus !== 'Received' && itemStatus !== 'Fully Received');
                  const isReceived = itemStatus === 'Received' || itemStatus === 'Fully Received' || (recQty > 0 && recQty >= dispQty && dispQty > 0);
                  const isRejected = itemStatus === 'Rejected';
                  const isQtyModified = (accQty !== null && Math.abs(accQty - reqQty) > 0.0001) || (it.modification_reason && it.modification_reason.trim() !== '') || (it.quantity_change_reason && it.quantity_change_reason.trim() !== '');

                  return (
                    <tr
                      key={`item-${t.id}-${it.id || idx}`}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: isRejected ? '#fef2f2' : (isReadyToProcess ? '#f5f3ff' : (isAccepted ? '#f0fdf4' : (idx % 2 === 0 ? '#fff' : '#fafafa')))
                      }}
                    >
                      <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 4, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {it.image_url ? (
                              <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                            ) : (
                              <Utensils size={14} color="#94a3b8" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.dish_name}</div>
                            {it.sku && <span style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' }}>SKU: {it.sku}</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#334155' }}>
                        {it.uom || 'Pices'}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        {reqQty}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        {isIncoming && isItemPending && canAcceptReject ? (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={itemAcceptedQtys[it.id] !== undefined ? itemAcceptedQtys[it.id] : reqQty}
                            onChange={e => setItemAcceptedQtys({ ...itemAcceptedQtys, [it.id]: e.target.value })}
                            style={{ width: 68, padding: '4px 6px', textAlign: 'right', borderRadius: 4, border: '1.5px solid #cbd5e1', fontSize: 12, fontWeight: 700 }}
                            title="Edit accepted quantity before confirming"
                          />
                        ) : accQty !== null ? (
                          <div>
                            <span style={{ color: isQtyModified ? '#2563eb' : '#16a34a', fontWeight: 800 }}>
                              {accQty}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {dispQty > 0 ? <strong style={{ color: '#d97706' }}>{dispQty}</strong> : <span style={{ color: '#94a3b8' }}>0</span>}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {recQty > 0 ? <strong style={{ color: '#16a34a' }}>{recQty}</strong> : <span style={{ color: '#94a3b8' }}>0</span>}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700 }}>
                        {remQty > 0 ? <span style={{ color: '#dc2626' }}>{remQty}</span> : <span style={{ color: '#16a34a' }}>0</span>}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: 11.5, color: '#64748b' }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.needed_by_time || t.needed_by_time || 'ASAP'}</div>
                        {it.needed_by_date && <div style={{ fontSize: 10, color: '#64748b' }}>{it.needed_by_date}</div>}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        {isReceived && (
                          <span title="Received" style={{ background: '#ecfdf5', color: '#047857', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #a7f3d0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CheckCheck size={12} /> Rec
                          </span>
                        )}
                        {isDispatched && !isReceived && (
                          <span title="Dispatched" style={{ background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #bfdbfe', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Truck size={12} /> Disp
                          </span>
                        )}
                        {isReadyToProcess && (
                          <span title="Ready to Process" style={{ background: '#f5f3ff', color: '#6d28d9', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <Play size={12} /> Ready
                          </span>
                        )}
                        {isAccepted && !isReadyToProcess && !isDispatched && (
                          <span title="Accepted" style={{ background: '#dcfce7', color: '#166534', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle2 size={12} /> Acc
                          </span>
                        )}
                        {isRejected && (
                          <span title={it.rejection_reason ? `Rejected: ${it.rejection_reason}` : 'Rejected'} style={{ background: '#fee2e2', color: '#991b1b', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <XCircle size={12} /> Rej
                          </span>
                        )}
                        {isItemPending && (
                          <span title="Pending" style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700, padding: '3px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #fde68a' }}>
                            Pen
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 11.5, color: '#475569', minWidth: 140 }}>
                        {isRejected ? (
                          <div>
                            {it.rejection_reason ? (
                              <div style={{ color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={11} /> Rej: "{it.rejection_reason}"
                              </div>
                            ) : (
                              <div style={{ color: '#b91c1c', fontWeight: 600 }}>Item Rejected</div>
                            )}
                            {it.rejected_by_name && (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                By {it.rejected_by_name} {it.rejected_at ? `(${new Date(it.rejected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                              </div>
                            )}
                          </div>
                        ) : isQtyModified || (it.modification_reason && it.modification_reason.trim()) || (it.quantity_change_reason && it.quantity_change_reason.trim()) ? (
                          <div>
                            <div style={{ color: '#1d4ed8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Edit3 size={11} /> Mod: "{it.modification_reason || it.quantity_change_reason || 'Qty Modified'}"
                            </div>
                            {it.accepted_by_name && (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                By {it.accepted_by_name} {it.accepted_at ? `(${new Date(it.accepted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                              </div>
                            )}
                          </div>
                        ) : it.remarks ? (
                          <div>
                            <div style={{ color: '#334155', fontWeight: 500 }}>{it.remarks}</div>
                            {it.accepted_by_name && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                Acc by {it.accepted_by_name} {it.accepted_at ? `(${new Date(it.accepted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                              </div>
                            )}
                          </div>
                        ) : it.accepted_by_name ? (
                          <div style={{ fontSize: 10.5, color: '#64748b' }}>
                            Acc by <strong>{it.accepted_by_name}</strong> {it.accepted_at ? `(${new Date(it.accepted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}
                          </div>
                        ) : (
                          <span style={{ color: '#cbd5e1' }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {isReceival ? (
                          // RECEIVALS VIEW: Show item receiving status / Receive button
                          dispQty > 0 ? (
                            recQty >= dispQty ? (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <CheckCheck size={12} /> Received
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openReceiveModal(t)}
                                style={{
                                  background: '#16a34a',
                                  color: '#fff',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '4px 10px',
                                  borderRadius: 5,
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                                title="Open Receiving modal to inspect and receive this item"
                              >
                                <PackageCheck size={12} /> Receive
                              </button>
                            )
                          ) : (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>Not Dispatched</span>
                          )
                        ) : !isIncoming ? (
                          // SENDING BRANCH VIEW (Transfer Requests):
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {isReceived ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#ecfdf5',
                                color: '#047857',
                                border: '1px solid #a7f3d0',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <CheckCheck size={11} /> Received
                              </span>
                            ) : isDispatched ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <Truck size={11} /> Dispatched
                              </span>
                            ) : isReadyToProcess ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#f5f3ff',
                                color: '#6d28d9',
                                border: '1px solid #ddd6fe',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <Play size={11} /> Ready to Process
                              </span>
                            ) : isAccepted ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#dcfce7',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}>
                                <Lock size={11} /> Acc - Locked
                              </span>
                            ) : isRejected ? (
                              <span style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 4,
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fca5a5'
                              }}>
                                Rej
                              </span>
                            ) : (
                              <>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a'
                                }}>
                                  Pen
                                </span>
                                {canModify && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditRequestModal(t)}
                                    style={{
                                      background: '#fff',
                                      color: '#2563eb',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: 4,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      padding: '2px 7px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}
                                    title="Modify pending item"
                                  >
                                    <Edit3 size={11} /> Modify
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        ) : (
                          // INCOMING REQUEST: Accept & Reject / Ready to Process buttons for supplying branch!
                          isItemPending ? (
                            canAcceptReject ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const chosenQty = parseFloat(itemAcceptedQtys[it.id] !== undefined ? itemAcceptedQtys[it.id] : reqQty);
                                    if (Math.abs(chosenQty - reqQty) < 0.0001) {
                                      // Fast Accept (No modal!)
                                      handleFastAcceptItem(t.id, it, chosenQty);
                                    } else {
                                      // Modified Quantity confirmation modal
                                      setAcceptItemModal({
                                        transferId: t.id,
                                        item: it,
                                        acceptedQty: chosenQty,
                                        reason: '',
                                        saving: false
                                      });
                                    }
                                  }}
                                  style={{
                                    background: '#16a34a',
                                    color: '#fff',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: 5,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="Accept item (Fast accept if unchanged, modal if modified)"
                                >
                                  <CheckCircle2 size={13} /> Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRejectItemModal(t.id, it)}
                                  style={{
                                    background: '#dc2626',
                                    color: '#fff',
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    padding: '4px 10px',
                                    borderRadius: 5,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}
                                  title="Reject item (requires mandatory reason)"
                                >
                                  <XCircle size={13} /> Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>Awaiting Supply Branch</span>
                            )
                          ) : isAccepted ? (
                            // STAGE 2 ACTION: Mark individual accepted item as Ready to Process!
                            canAcceptReject ? (
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => handleItemReadyToProcess(t.id, it)}
                                  style={{
                                    background: '#7c3aed',
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '4px 9px',
                                    borderRadius: 5,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    boxShadow: '0 1px 2px rgba(124, 58, 237, 0.2)'
                                  }}
                                  title="Mark this accepted item as Ready to Process"
                                >
                                  <Play size={12} /> Ready to Process
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>Accepted</span>
                            )
                          ) : isReadyToProcess ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <CheckCircle2 size={12} /> Ready for Dispatch
                            </span>
                          ) : isDispatched ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <Truck size={12} /> Dispatched
                            </span>
                          ) : isReceived ? (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <CheckCheck size={12} /> Received
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <XCircle size={12} /> Item Rejected
                            </span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ROW 3: Bottom Action Bar */}
        {isReceival ? (
          <div style={{
            padding: '12px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#475569', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#334155' }}>Dispatched Shipment:</span>
              <span>{t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</span>
              <span>·</span>
              <span>Supplied By: <strong>{t.to_branch}</strong></span>
              <span>·</span>
              <span>Dispatched By: <strong>{t.dispatched_by_name || 'Kitchen Staff'}</strong></span>
              {t.handover_to_name && (
                <>
                  <span>·</span>
                  <span>Driver / Rep: <strong>{t.handover_to_name}</strong></span>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => printDispatchedItemsSlip(t)}
                style={{
                  padding: '7px 12px',
                  background: '#fff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Print dispatched shipment slip"
              >
                <Printer size={14} /> Print Slip
              </button>

              <button
                type="button"
                onClick={() => handleDirectReceive(t, false)}
                disabled={receiving}
                style={{
                  padding: '7px 14px',
                  background: receiving ? '#94a3b8' : '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: receiving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 1px 3px rgba(22, 163, 74, 0.25)',
                  opacity: receiving ? 0.7 : 1
                }}
                title="Receive and accept all dispatched goods without printing"
              >
                <CheckCircle2 size={14} /> Receive & Accept
              </button>

              <button
                type="button"
                onClick={() => handleDirectReceive(t, true)}
                disabled={receiving}
                style={{
                  padding: '7px 14px',
                  background: receiving ? '#94a3b8' : '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: receiving ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)',
                  opacity: receiving ? 0.7 : 1
                }}
                title="Receive and accept all dispatched goods, then automatically print receiving slip"
              >
                <Printer size={14} /> Receive & Print
              </button>

              <button
                type="button"
                onClick={() => openReceiveModal(t)}
                style={{
                  padding: '7px 12px',
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Verify and adjust quantities item-by-item"
              >
                <PackageCheck size={14} /> Verify / Custom Qty
              </button>
            </div>
          </div>
        ) : isIncoming && canAcceptReject ? (
          <div style={{
            padding: '12px 18px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              {(() => {
                const totalItems = items.length;
                const acceptedCount = items.filter(it => it.item_status === 'Accepted').length;
                const readyCount = items.filter(it => it.item_status === 'Ready to Process').length;
                const rejectedCount = items.filter(it => it.item_status === 'Rejected').length;
                const pendingCount = items.filter(it => it.item_status === 'Pending' || !it.item_status).length;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#334155' }}>Review Summary:</span>
                    {acceptedCount > 0 && (
                      <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {acceptedCount} Accepted
                      </span>
                    )}
                    {readyCount > 0 && (
                      <span style={{ background: '#f5f3ff', color: '#6d28d9', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {readyCount} Ready to Process
                      </span>
                    )}
                    {rejectedCount > 0 && (
                      <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {rejectedCount} Rejected
                      </span>
                    )}
                    {pendingCount > 0 ? (
                      <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        ⚠️ {pendingCount} Pending
                      </span>
                    ) : (
                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        ✅ All Items Processed
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Print Accepted Slip */}
              <button
                type="button"
                onClick={() => printAcceptedItemsSlip(t)}
                style={{
                  padding: '7px 12px',
                  background: '#fff',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
                title="Print slip of accepted items with modification details"
              >
                <Printer size={14} /> Print Accepted Slip
              </button>

              {/* Accept and Done (visible while unaccepted items exist) */}
              {items.some(it => it.item_status === 'Pending' || !it.item_status) && (
                <button
                  type="button"
                  onClick={() => handleOpenAcceptAndDoneModal(t)}
                  style={{
                    padding: '7px 14px',
                    background: '#16a34a',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: '0 1px 2px rgba(22, 163, 74, 0.2)'
                  }}
                  title="Open detailed confirmation modal to review and accept all pending items"
                >
                  <CheckCheck size={14} /> Accept and Done
                </button>
              )}

              {/* Ready to Process (Stage 2: Bulk Action) */}
              {(hasAcceptedItems || hasReadyItems) && (
                <button
                  type="button"
                  onClick={() => handleBulkReadyToProcess(t)}
                  disabled={!hasAcceptedItems}
                  style={{
                    padding: '7px 15px',
                    background: hasAcceptedItems ? '#7c3aed' : '#cbd5e1',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: hasAcceptedItems ? 'pointer' : 'not-allowed',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: hasAcceptedItems ? '0 1px 3px rgba(124, 58, 237, 0.25)' : 'none'
                  }}
                  title={hasAcceptedItems ? "Mark all accepted items as Ready to Process" : "All eligible items are already Ready to Process"}
                >
                  <Play size={14} /> Ready to Process
                </button>
              )}

              {/* Dispatch Order (Stage 3: Dispatch only Ready to Process items) */}
              {(hasAcceptedItems || hasReadyItems) && (
                <button
                  type="button"
                  onClick={() => {
                    if (!hasReadyItems) {
                      return toast.error("Please click 'Ready to Process' before dispatching.");
                    }
                    openDispatchModal(t);
                  }}
                  disabled={dispatching || !hasReadyItems}
                  style={{
                    padding: '7px 15px',
                    background: hasReadyItems ? '#16a34a' : '#94a3b8',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: (dispatching || !hasReadyItems) ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    boxShadow: hasReadyItems ? '0 1px 3px rgba(22, 163, 74, 0.25)' : 'none'
                  }}
                  title={hasReadyItems ? "Open dispatch details modal and handover order" : "Mark items as 'Ready to Process' before dispatching"}
                >
                  <Truck size={14} /> Dispatch Order
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
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
              'Request Type': t.request_type || 'Transfer Request',
              'Priority': t.priority || 'Normal',
              'Request Date': reqDateStr,
              'From Branch': t.from_branch,
              'To Branch': t.to_branch,
              'Requested By': t.requested_by_name || 'N/A',
              'Received By': t.received_by_name || 'N/A',
              'SKU / Barcode': it.sku || it.barcode || '-',
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
            'Request Type': t.request_type || 'Transfer Request',
            'Priority': t.priority || 'Normal',
            'Request Date': reqDateStr,
            'From Branch': t.from_branch,
            'To Branch': t.to_branch,
            'Requested By': t.requested_by_name || 'N/A',
            'Received By': t.received_by_name || 'N/A',
            'SKU / Barcode': '-',
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
        const dishesSummary = (t.items || []).map(it => `${it.dish_name}${it.sku ? ` [${it.sku}]` : ''} (${it.requested_qty} ${it.uom})`).join(', ');

        tableData.push([
          t.transfer_id,
          t.request_type || 'Transfer',
          t.priority || 'Normal',
          reqDateStr,
          t.from_branch,
          t.to_branch,
          dishesSummary || 'None',
          t.needed_by_time || 'ASAP',
          t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
          t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
          delayStr,
          t.status
        ]);
      });

      doc.autoTable({
        startY: 26,
        head: [[
          'Transfer ID', 'Type', 'Priority', 'Req Date', 'From', 'To', 'Dishes (SKU / Qty)', 
          'Needed By', 'Dispatched', 'Received', 'Delay', 'Status'
        ]],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [227, 24, 55], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
          6: { cellWidth: 50 }
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
    <div className="internal-branch-page" style={{ padding: '8px 20px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Integrated Compact Filter Toolbar: Branch Pills (Left) + Request Type & Status Dropdowns + Audio Alerts & Refresh (Right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        padding: '6px 12px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8
      }}>
        {/* Branch Pills: All Branches, B1, B2, B3, Kitchen, Other */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Store size={14} /> Branch:
          </span>
          {[
            { id: 'All', label: 'All' },
            { id: 'Branch 1', label: 'B1' },
            { id: 'Branch 2', label: 'B2' },
            { id: 'Branch 3', label: 'B3' },
          ].map(b => {
            const isSelected = adminSelectedBranch === b.id;
            return (
              <button
                key={`bar-branch-${b.id}`}
                type="button"
                onClick={() => {
                  setAdminSelectedBranch(b.id);
                  if (b.id === 'All') setAdminDirection('all');
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: isSelected ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                  background: isSelected ? '#2563eb' : '#fff',
                  color: isSelected ? '#fff' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* Request Type, Request Status, Audio Alerts, Refresh, and Optional Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {isFromOrderTaking && (
            <button
              type="button"
              onClick={() => navigate('/pos')}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: '1.5px solid #2563eb',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s ease'
              }}
              title="Return to Order Taking page"
            >
              <ArrowLeft size={14} /> Back to Order Taking
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Type:</span>
            <select
              value={filterRequestType}
              onChange={e => setFilterRequestType(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12,
                fontWeight: 600,
                background: '#fff',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Types</option>
              <option value="Kitchen Request">Kitchen Request</option>
              <option value="Other Request">Other Request</option>
              <option value="Branch Transfer">Branch Transfer</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Status:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 12,
                fontWeight: 600,
                background: '#fff',
                color: '#334155',
                cursor: 'pointer'
              }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Accepted">Accepted</option>
              <option value="Preparing">Preparing</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Partially Received">Partially Received</option>
              <option value="Received">Received</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (!audioEnabled) playIncomingTransferAlert();
              toast.success(audioEnabled ? 'Audio alerts muted' : 'Audio alerts activated');
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: audioEnabled ? '#f0fdf4' : '#fff',
              color: audioEnabled ? '#16a34a' : '#64748b',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <Volume2 size={14} />
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
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
            title="Refresh Data"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

            {/* Navigation Tabs with Badges in exact order: 1. New Request, 2. Transfer Request, 3. Incoming Requests, 4. Pending Receive, 5. Transfer Logs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '2px solid #e2e8f0', marginBottom: 20, overflowX: 'auto', paddingBottom: 2 }}>
        
        {/* Tab 1: New Request */}
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            padding: '10px 16px',
            fontSize: 13.5,
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
          <PlusCircle size={17} />
          New Request
        </button>

        {/* Tab 2: Transfer Request */}
        <button
          type="button"
          onClick={() => setActiveTab('transfer_request')}
          style={{
            padding: '10px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: activeTab === 'transfer_request' ? 'var(--primary)' : '#64748b',
            borderBottom: activeTab === 'transfer_request' ? '3px solid var(--primary)' : '3px solid transparent',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            whiteSpace: 'nowrap'
          }}
        >
          <ArrowLeftRight size={17} />
          Transfer Request
          {stats.sent_active_count > 0 && (
            <span style={{
              background: '#2563eb',
              color: '#fff',
              fontSize: 11,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 12
            }}>
              {stats.sent_active_count}
            </span>
          )}
        </button>

        {/* Tab 3: Incoming Requests */}
        <button
          type="button"
          onClick={() => setActiveTab('incoming')}
          style={{
            padding: '10px 16px',
            fontSize: 13.5,
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
          <Truck size={17} />
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

        {/* Tab 4: Pending Receive */}
        <button
          type="button"
          onClick={() => setActiveTab('receivals')}
          style={{
            padding: '10px 16px',
            fontSize: 13.5,
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
          <PackageCheck size={17} />
          Pending Receive
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

        {/* Tab 5: Transfer Logs */}
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '10px 16px',
            fontSize: 13.5,
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
          <ClipboardList size={17} />
          Transfer Logs
        </button>

      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: DEDICATED NEW TRANSFER REQUEST FORM PAGE
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'new' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #2563eb', padding: '16px 20px', boxShadow: '0 2px 8px rgba(37,99,235,0.06)', marginBottom: 16 }}>
          
          {/* Header Title (Priority removed from here and moved into main Row 1) */}
          <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 10, marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <PlusCircle size={18} color="var(--primary)" />
              Create Inter-Branch Transfer Request
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b' }}>
              Submit branch-to-branch transfer request. Destination branch processes it directly in Incoming Requests.
            </p>
          </div>

          <form onSubmit={handleSubmitTrfRequest}>
            
            {/* ── ROW 1: Request Information (Origin, Destination, Purpose, Delivery Window, Priority) ── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 12,
              marginBottom: 12,
              alignItems: 'start'
            }}>
              
              {/* 1. Origin Branch (Request From) - Shown only for Admin and Developer; automatically set and hidden for Cashier */}
              {isSuperUser && (
                <div>
                  <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                    Origin Branch (From) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    value={trfFromBranch}
                    onChange={e => setTrfFromBranch(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: 12.5, fontWeight: 600, background: '#fff', height: 38 }}
                  >
                    {branches.map(b => (
                      <option key={`trf-from-${b}`} value={b}>{b}</option>
                    ))}
                  </select>
                  {trfFromBranch === 'Other' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter manual origin branch..."
                      value={trfCustomFromBranch}
                      onChange={e => setTrfCustomFromBranch(e.target.value)}
                      style={{ width: '100%', marginTop: 5, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #f59e0b', fontSize: 12, background: '#fffbeb' }}
                    />
                  )}
                  <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                    Origin sending branch
                  </span>
                </div>
              )}

              {/* 2. Destination Branch (Transfer To) - Compact */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                  Destination Branch (To) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  required
                  value={trfToBranch}
                  onChange={e => setTrfToBranch(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: 12.5, fontWeight: 600, background: '#fff', height: 38 }}
                >
                  <option value="">Select Destination...</option>
                  {branches.filter(b => b !== trfFromBranch).map(b => (
                    <option key={`trf-to-${b}`} value={b}>{b}</option>
                  ))}
                </select>
                {trfToBranch === 'Other' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter manual destination branch..."
                    value={trfCustomToBranch}
                    onChange={e => setTrfCustomToBranch(e.target.value)}
                    style={{ width: '100%', marginTop: 5, padding: '6px 8px', borderRadius: 6, border: '1.5px solid #f59e0b', fontSize: 12, background: '#fffbeb' }}
                  />
                )}
                <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                  Receiving branch
                </span>
              </div>

              {/* 3. Transfer Purpose / Reason */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                  Transfer Purpose / Reason
                </label>
                <select
                  value={trfPurpose}
                  onChange={e => setTrfPurpose(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12.5, fontWeight: 600, background: '#fff', height: 38 }}
                >
                  <option value="Stock Replenishment">Stock Replenishment</option>
                  <option value="Urgent Customer Demand">Urgent Customer Demand</option>
                  <option value="Preparation Shortage">Preparation Shortage</option>
                  <option value="Central Kitchen Stocking">Central Kitchen Stocking</option>
                  <option value="Raw Materials / Ingredients">Raw Materials / Ingredients</option>
                  <option value="Other">Other (Specify)</option>
                </select>
                {trfPurpose === 'Other' && (
                  <input
                    type="text"
                    required
                    placeholder="Specify purpose..."
                    value={trfCustomPurpose}
                    onChange={e => setTrfCustomPurpose(e.target.value)}
                    style={{ width: '100%', marginTop: 5, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                  />
                )}
                <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                  Dispatch rationale
                </span>
              </div>

              {/* 4. Required Day Selection (Today, Tomorrow, Custom Date) */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                  Day <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  value={trfDayOption}
                  onChange={e => setTrfDayOption(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #cbd5e1', fontSize: 12.5, fontWeight: 700, background: '#fff', height: 38 }}
                >
                  <option value="Today">Today</option>
                  <option value="Tomorrow">Tomorrow</option>
                  <option value="Custom Date">Custom Date (Pick Date)</option>
                </select>
                {trfDayOption === 'Custom Date' && (
                  <div style={{ marginTop: 6 }}>
                    <input
                      type="date"
                      required
                      value={trfCustomDayDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setTrfCustomDayDate(e.target.value)}
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1.5px solid #3b82f6', fontSize: 12, background: '#fff', height: 34 }}
                    />
                  </div>
                )}
                <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                  Target delivery day
                </span>
              </div>

              {/* 5. Transfer Priority Dropdown (Normal, High, Urgent) */}
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#0f172a', marginBottom: 5 }}>
                  Transfer Priority
                </label>
                <select
                  value={trfPriority}
                  onChange={e => setTrfPriority(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 7,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 12.5,
                    fontWeight: 700,
                    background: '#fff',
                    height: 38,
                    color: trfPriority === 'Urgent' ? '#dc2626' : (trfPriority === 'High' ? '#d97706' : '#0f172a')
                  }}
                >
                  <option value="Normal">Normal</option>
                  <option value="High">⚡ High Priority</option>
                  <option value="Urgent">🚨 Urgent Rush</option>
                </select>
                <span style={{ fontSize: 10.5, color: '#64748b', marginTop: 3, display: 'block' }}>
                  Request urgency level
                </span>
              </div>

            </div>

            {/* ── ROW 2: Item Entry Section (Heading & Description Removed) ── */}
            <div style={{
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              marginBottom: 14,
              background: '#fafbfc',
              overflow: 'visible',
              position: 'relative'
            }}>
              
              {/* Items List Rows - Unclipped overflow to guarantee dropdown foreground layering */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'visible', position: 'relative' }}>
                {trfDishRows.map((row, idx) => {
                  const rowUnits = row.available_units && row.available_units.length > 0 
                    ? row.available_units 
                    : ['KG', 'Pieces', 'Plate', 'Lunch', 'Half KG'];

                  return (
                    <div
                      key={row.id}
                      style={{
                        background: '#ffffff',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: '1px solid #e2e8f0',
                        position: 'relative',
                        zIndex: openDropdownRowId === row.id ? 999999 : (100 - idx),
                        overflow: 'visible',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6
                      }}
                    >
                      {/* Item Row Header: Item number & SKU badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#475569' }}>
                          Transfer Item #{idx + 1}
                        </span>
                        {(row.sku || row.barcode) && (
                          <span style={{ fontSize: 10, background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                            SKU: {row.sku || row.barcode}
                          </span>
                        )}
                      </div>

                      {/* Responsive Grid Row:
                          1. Dish Search + Open Menu Items (prominent)
                          2. Unit (exact order: ['KG', 'Pices', 'Liters', 'Pantry', 'Parcel', 'Packet', 'Box'])
                          3. Quantity (numeric input)
                          4. Need By Date & Time
                          5. Priority (Normal, High, Urgent)
                          6. Remarks
                          7. Delete Button
                      */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(200px, 2.2fr) minmax(90px, 0.8fr) minmax(75px, 0.7fr) minmax(185px, 1.6fr) minmax(100px, 0.9fr) minmax(120px, 1fr) 36px',
                          gap: 10,
                          alignItems: 'end',
                          position: 'relative',
                          overflow: 'visible'
                        }}
                      >
                        {/* 1. Dish Search + Open Menu Items */}
                        <div style={{ position: 'relative', overflow: 'visible' }}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Dish Item <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ flex: 1, position: 'relative', overflow: 'visible' }}>
                              <DishSearchDropdown
                                value={row.dish_name}
                                imageUrl={row.image_url}
                                dishes={Array.isArray(dishes) && dishes.length > 0 ? dishes : (Array.isArray(posItems) ? posItems : [])}
                                popularityMap={popularityMap}
                                onSelect={(dish) => handleSelectDishTrf(row.id, dish)}
                                onOpenChange={(open) => setOpenDropdownRowId(open ? row.id : null)}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setShowMenuBrowser(true);
                                if (!dishes || dishes.length === 0) fetchDishes();
                              }}
                              style={{
                                background: '#eff6ff',
                                border: '1.5px solid #3b82f6',
                                borderRadius: 6,
                                padding: '8px 10px',
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#1d4ed8',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap',
                                height: 38
                              }}
                              title="Open menu catalog to select dishes"
                            >
                              <BookOpen size={14} /> Open Menu
                            </button>
                          </div>
                        </div>

                        {/* 2. Unit (UOM) - Exact required order: ['KG', 'Pices', 'Liters', 'Pantry', 'Parcel', 'Packet', 'Box'] */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Unit <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <select
                            value={row.uom || STANDARD_TOP_UNITS[0]}
                            onChange={e => handleDishRowChangeTrf(row.id, 'uom', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600, background: '#fff', height: 38 }}
                          >
                            {STANDARD_TOP_UNITS.map((u) => (
                              <option key={`trf-uom-${row.id}-${u}`} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>

                        {/* 3. Transfer Qty */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Quantity <span style={{ color: '#dc2626' }}>*</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0.1"
                            placeholder="Qty"
                            required
                            value={row.requested_qty}
                            onChange={e => handleDishRowChangeTrf(row.id, 'requested_qty', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700, textAlign: 'center', height: 38 }}
                          />
                        </div>

                        {/* 4. Need By Date & Time */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Need By (Date & Time)
                          </label>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <input
                              type="date"
                              value={row.needed_by_date || ''}
                              onChange={e => handleDishRowChangeTrf(row.id, 'needed_by_date', e.target.value)}
                              onClick={e => { try { e.target.showPicker && e.target.showPicker(); } catch (err) {} }}
                              style={{ width: '56%', padding: '7px 4px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, height: 38, cursor: 'pointer' }}
                              title="Click to select date"
                            />
                            <input
                              type="time"
                              value={row.needed_by_time || ''}
                              onChange={e => handleDishRowChangeTrf(row.id, 'needed_by_time', e.target.value)}
                              onClick={e => { try { e.target.showPicker && e.target.showPicker(); } catch (err) {} }}
                              style={{ width: '44%', padding: '7px 4px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 11, height: 38, cursor: 'pointer' }}
                              title="Click to select time"
                            />
                          </div>
                        </div>

                        {/* 5. Priority */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Priority
                          </label>
                          <select
                            value={row.priority || 'Normal'}
                            onChange={e => handleDishRowChangeTrf(row.id, 'priority', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, fontWeight: 600, background: '#fff', height: 38 }}
                          >
                            <option value="Normal">Normal</option>
                            <option value="High">⚡ High</option>
                            <option value="Urgent">🚨 Urgent</option>
                          </select>
                        </div>

                        {/* 6. Remarks */}
                        <div>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            Remarks
                          </label>
                          <input
                            type="text"
                            placeholder="Item remarks..."
                            value={row.remarks || ''}
                            onChange={e => handleDishRowChangeTrf(row.id, 'remarks', e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, height: 38 }}
                          />
                        </div>

                        {/* 7. Delete Row Button */}
                        <div>
                          <button
                            type="button"
                            onClick={() => handleRemoveDishRowTrf(row.id)}
                            disabled={trfDishRows.length <= 1}
                            style={{
                              width: 36,
                              height: 38,
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                              background: trfDishRows.length > 1 ? '#fee2e2' : '#f8fafc',
                              color: trfDishRows.length > 1 ? '#dc2626' : '#cbd5e1',
                              cursor: trfDishRows.length > 1 ? 'pointer' : 'default',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0
                            }}
                            title="Remove this item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* ── ROW 3: Form Actions: Add Another Item on the LEFT, Remarks & Submit on the RIGHT ── */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 14,
              marginTop: 14,
              flexWrap: 'wrap'
            }}>
              {/* LEFT: Add Another Item Button */}
              <div>
                <button
                  type="button"
                  onClick={handleAddDishRowTrf}
                  style={{
                    padding: '9px 18px',
                    borderRadius: 7,
                    border: '1.5px solid #2563eb',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 3px rgba(37,99,235,0.1)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
                >
                  <PlusCircle size={16} /> + Add Another Item
                </button>
              </div>

              {/* RIGHT: Transfer Remarks Input + Submit Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 360px', justifyContent: 'flex-end' }}>
                <input
                  type="text"
                  placeholder="Transfer Remarks / Dispatch Instructions (e.g. driver details)..."
                  value={trfNotes}
                  onChange={e => setTrfNotes(e.target.value)}
                  style={{ minWidth: 240, flex: 1, padding: '9px 12px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setTrfDishRows([{ id: Date.now(), dish_name: '', item_id: null, sku: '', barcode: '', uom: 'KG', requested_qty: '', needed_by_time: '', priority: 'Normal', remarks: '', image_url: null, price: null, available_units: [...STANDARD_TOP_UNITS] }]);
                    setTrfNotes('');
                    setTrfPriority('Normal');
                    setTrfCustomToBranch('');
                    setTrfDeliveryOption('1');
                    setTrfCustomDate(new Date().toISOString().slice(0, 10));
                    setTrfCustomTime('');
                  }}
                  disabled={submittingTrfRequest}
                  style={{ padding: '9px 14px', fontSize: 12.5, fontWeight: 600, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 7, cursor: 'pointer', color: '#64748b' }}
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={submittingTrfRequest}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 7,
                    border: 'none',
                    background: submittingTrfRequest ? '#94a3b8' : '#2563eb',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: submittingTrfRequest ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 6px rgba(37,99,235,0.25)'
                  }}
                >
                  {submittingTrfRequest ? <RefreshCw size={15} className="spin" /> : <Send size={15} />}
                  {submittingTrfRequest ? 'Submitting...' : 'Submit Transfer Request'}
                </button>
              </div>
            </div>

          </form>
        </div>
      )}

            {/* ─────────────────────────────────────────────────────────────
          TAB 1: DEDICATED TRANSFER REQUESTS (SENT REQUESTS - LATEST FIRST)
      ───────────────────────────────────────────────────────────── */}
      {activeTab === 'transfer_request' && (
        <div>
          {/* Header Bar with Title, Counter, New Request CTA and Refresh */}
          <div style={{
            background: '#fff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            padding: '10px 16px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: '#eff6ff',
                color: '#2563eb',
                padding: '5px 8px',
                borderRadius: 7,
                display: 'inline-flex',
                alignItems: 'center'
              }}>
                <ArrowLeftRight size={18} />
              </span>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Transfer Requests
              </h2>
              <span style={{
                fontSize: 11.5,
                fontWeight: 800,
                padding: '2px 9px',
                borderRadius: 12,
                background: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe'
              }}>
                {filteredSentTransfers.length} Active in Progress
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isSuperUser && (
                <button
                  type="button"
                  onClick={() => { setClearAllReason(''); setClearAllModalOpen(true); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    background: '#fef2f2',
                    border: '1.5px solid #fca5a5',
                    color: '#b91c1c',
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Clear/cancel all active transfer requests across branches (Transfer logs are safely preserved)"
                >
                  <Trash2 size={14} /> Clear All Active
                </button>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('new')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 1px 4px rgba(37,99,235,0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                <PlusCircle size={15} /> + New Request
              </button>

              <button
                type="button"
                onClick={() => fetchTransfers()}
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <RefreshCw size={14} className={loadingTransfers ? 'spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Quick Filters / Search Bar for Transfer Requests */}
          <div style={{
            background: '#fff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: '1 1 240px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search transfer ID, dish, or purpose..."
                value={sentSearchQuery}
                onChange={e => setSentSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 12.5
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Destination:</span>
              <select
                value={sentFilterBranch}
                onChange={e => setSentFilterBranch(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, fontWeight: 600 }}
              >
                <option value="All">All Branches</option>
                {branches.map(b => (
                  <option key={'filter-dest-' + b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Priority:</span>
              <select
                value={sentFilterPriority}
                onChange={e => setSentFilterPriority(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, fontWeight: 600 }}
              >
                <option value="All">All Priorities</option>
                <option value="Normal">Normal</option>
                <option value="High">⚡ High Priority</option>
                <option value="Urgent">🚨 Urgent Rush</option>
              </select>
            </div>

            {(sentSearchQuery || sentFilterBranch !== 'All' || sentFilterPriority !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSentSearchQuery('');
                  setSentFilterBranch('All');
                  setSentFilterPriority('All');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dc2626',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Transfer Requests List (Strictly Latest First) */}
          {loadingTransfers ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#64748b', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', display: 'block', color: '#2563eb' }} />
              Loading sent transfer requests...
            </div>
          ) : filteredSentTransfers.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, border: '1px dashed #cbd5e1', padding: 44, textAlign: 'center', color: '#64748b' }}>
              <CheckCircle2 size={40} color="#10b981" style={{ margin: '0 auto 10px' }} />
              <h3 style={{ margin: '0 0 6px', fontSize: 16, color: '#0f172a' }}>No Active Sent Requests</h3>
              <p style={{ margin: 0, fontSize: 13 }}>
                All your previously submitted transfer requests have been completed or cancelled.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('new')}
                className="btn btn-primary"
                style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <PlusCircle size={16} /> Create New Transfer Request
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredSentTransfers.map(t => renderTransferCardRow(t, false))}
            </div>
          )}
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
              {transfers.filter(t => ['Pending', 'Partially Accepted', 'Accepted'].includes(t.status)).length} Pending Dispatch
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {transfers.map(t => renderTransferCardRow(t, true))}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {transfers.map(t => renderTransferCardRow(t, false, true))}
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

            {/* Request Type */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Request Type</label>
              <select
                value={filterRequestType}
                onChange={e => setFilterRequestType(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="All">All Types</option>
                <option value="Transfer Request">Transfer Request</option>
                <option value="New Request">New Request</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Priority</label>
              <select
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
              >
                <option value="All">All Priorities</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
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
                <option value="In Progress">In Progress</option>
                <option value="Ready for Dispatch">Ready for Dispatch</option>
                <option value="Dispatched">Dispatched / In-Transit</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Fully Received">Fully Received</option>
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
                    <th style={{ padding: '10px 12px' }}>Type & Priority</th>
                    <th style={{ padding: '10px 12px' }}>From → To</th>
                    <th style={{ padding: '10px 12px' }}>Dishes & Quantities</th>
                    <th style={{ padding: '10px 12px' }}>Needed By & Timer</th>
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
                    const totalSent = (t.items || []).reduce((sum, it) => sum + parseFloat(it.sent_qty !== null ? it.sent_qty : (it.confirmed_qty ?? it.requested_qty)), 0);
                    const totalRec = (t.items || []).reduce((sum, it) => sum + (it.received_qty !== null ? parseFloat(it.received_qty) : 0), 0);
                    const varianceVal = ['Partially Received', 'Fully Received', 'Completed'].includes(t.status) ? (totalRec - totalSent) : 0;

                    let statusBg = '#f1f5f9';
                    let statusColor = '#475569';
                    if (t.status === 'Pending') { statusBg = '#fef3c7'; statusColor = '#92400e'; }
                    else if (t.status === 'In Progress') { statusBg = '#dbeafe'; statusColor = '#1e40af'; }
                    else if (t.status === 'Ready for Dispatch') { statusBg = '#f3e8ff'; statusColor = '#6b21a8'; }
                    else if (['Dispatched', 'In-Transit'].includes(t.status)) { statusBg = '#e0f2fe'; statusColor = '#0369a1'; }
                    else if (t.status === 'Partially Received') { statusBg = '#ffedd5'; statusColor = '#c2410c'; }
                    else if (t.status === 'Fully Received') { statusBg = '#ecfdf5'; statusColor = '#047857'; }
                    else if (t.status === 'Completed') { statusBg = '#dcfce7'; statusColor = '#166534'; }
                    else if (t.status === 'Cancelled') { statusBg = '#fee2e2'; statusColor = '#991b1b'; }

                    return (
                      <tr
                        key={t.id}
                        onClick={() => handleOpenDetailModal(t)}
                        title="Click to view complete details & history"
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                          {t.transfer_id}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(t.request_date).toLocaleDateString()}
                          <span style={{ fontSize: 10.5, display: 'block', color: '#94a3b8' }}>
                            {new Date(t.request_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-block',
                            background: t.request_type === 'New Request' ? '#ede9fe' : '#e0f2fe',
                            color: t.request_type === 'New Request' ? '#6d28d9' : '#0369a1',
                            padding: '2px 7px',
                            borderRadius: 10,
                            fontSize: 10.5,
                            fontWeight: 700,
                            marginBottom: 3
                          }}>
                            {t.request_type || 'Transfer Request'}
                          </span>
                          <span style={{
                            display: 'block',
                            fontSize: 10,
                            fontWeight: 700,
                            color: t.priority === 'Urgent' ? '#dc2626' : (t.priority === 'High' ? '#d97706' : '#64748b')
                          }}>
                            {t.priority === 'Urgent' ? '🔥 Urgent' : (t.priority === 'High' ? '⚡ High' : 'Normal')}
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
                              <span style={{ fontWeight: 600 }}>{it.dish_name}</span>
                              {it.sku && <span style={{ fontSize: 10, color: '#64748b' }}>[{it.sku}]</span>}
                              : {it.requested_qty} {it.uom}
                              {it.confirmed_qty !== null && it.confirmed_qty !== undefined && it.confirmed_qty !== it.requested_qty && (
                                <span style={{ color: '#d97706', marginLeft: 3, fontSize: 11 }}>(Conf: {it.confirmed_qty})</span>
                              )}
                              {it.sent_qty !== null && <span style={{ color: '#2563eb', marginLeft: 4 }}>(Sent: {it.sent_qty})</span>}
                              {it.received_qty !== null && <span style={{ color: '#16a34a', marginLeft: 4 }}>(Rec: {it.received_qty})</span>}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', minWidth: 120 }}>
                          <span style={{ fontWeight: 700, color: '#dc2626', display: 'block' }}>
                            {t.needed_by_time || 'ASAP'}
                          </span>
                          {(t.total_extended_minutes || 0) > 0 && (
                            <span style={{ fontSize: 10, color: '#d97706', display: 'block', fontWeight: 700 }}>
                              +{t.total_extended_minutes}m extended
                            </span>
                          )}
                          <div style={{ marginTop: 2 }}>
                            <DeliveryTimerBadge expectedDeliveryAt={t.expected_delivery_at} status={t.status} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {t.dispatched_at ? new Date(t.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                          {t.handover_to_name && (
                            <span style={{ fontSize: 10, color: '#64748b', display: 'block' }}>To: {t.handover_to_name}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                          {t.received_at ? new Date(t.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: delay.includes('late') ? '#dc2626' : (delay === 'On Time' ? '#16a34a' : '#64748b'), whiteSpace: 'nowrap' }}>
                          {delay}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: varianceVal < 0 ? '#dc2626' : (varianceVal > 0 ? '#2563eb' : '#64748b'), whiteSpace: 'nowrap' }}>
                          {['Partially Received', 'Fully Received', 'Completed'].includes(t.status) ? (
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
                            onClick={e => { e.stopPropagation(); handleOpenDetailModal(t); }}
                            style={{
                              background: t.extension_status === 'Pending' ? '#fffbeb' : '#f1f5f9',
                              border: t.extension_status === 'Pending' ? '1px solid #fcd34d' : 'none',
                              padding: '5px 9px',
                              borderRadius: 4,
                              fontSize: 11.5,
                              fontWeight: 700,
                              cursor: 'pointer',
                              color: t.extension_status === 'Pending' ? '#b45309' : '#334155'
                            }}
                          >
                            Details {t.extension_status === 'Pending' ? '⚠️ Ext' : ''}
                          </button>

                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); printTransferSlip(t); }}
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
                              onClick={e => { e.stopPropagation(); handleStartProcessing(t.id, t.transfer_id); }}
                              style={{
                                background: '#2563eb',
                                border: 'none',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginLeft: 4
                              }}
                            >
                              Start
                            </button>
                          )}

                          {t.status === 'In Progress' && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleMarkReady(t.id, t.transfer_id); }}
                              style={{
                                background: '#7c3aed',
                                border: 'none',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginLeft: 4
                              }}
                            >
                              Ready
                            </button>
                          )}

                          {t.status === 'Ready for Dispatch' && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); openDispatchModal(t); }}
                              style={{
                                background: '#f59e0b',
                                border: 'none',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginLeft: 4
                              }}
                            >
                              Handover
                            </button>
                          )}

                          {['Dispatched', 'In-Transit'].includes(t.status) && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); openReceiveModal(t); }}
                              style={{
                                background: '#16a34a',
                                border: 'none',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginLeft: 4
                              }}
                            >
                              Receive
                            </button>
                          )}

                          {['Partially Received', 'Fully Received'].includes(t.status) && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleMarkCompleted(t.id, t.transfer_id); }}
                              style={{
                                background: '#047857',
                                border: 'none',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                marginLeft: 4
                              }}
                            >
                              Complete
                            </button>
                          )}

                          {t.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); handleCancelTransfer(t.id, t.transfer_id); }}
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
          1. DISPATCH & HANDOVER MODAL (SUPPLYING BRANCH)
      ───────────────────────────────────────────────────────────── */}
      {dispatchModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setDispatchModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 680, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header (Fixed) */}
            <div style={{ flexShrink: 0, background: '#f59e0b', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  🚚 Handover & Dispatch — {dispatchModalTransfer.transfer_id}
                </h3>
                <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>To:</span> <BranchBadge branch={dispatchModalTransfer.from_branch} /> · <span>Needed By: {dispatchModalTransfer.needed_by_time || 'ASAP'}</span>
                </span>
              </div>
              <button onClick={() => setDispatchModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              
              {/* Handover Information Block */}
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, color: '#92400e', fontWeight: 800 }}>
                  Custody Handover Details
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>
                      Handover By (Kitchen Staff)
                    </label>
                    <input
                      type="text"
                      value={handoverByName}
                      onChange={e => setHandoverByName(e.target.value)}
                      placeholder="e.g. Chef Tariq"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #fcd34d', fontSize: 12.5, fontWeight: 600 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>
                      Handover To (Driver / Branch Rep) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={handoverToName}
                      onChange={e => setHandoverToName(e.target.value)}
                      placeholder="Driver / Staff name (e.g. Imran Khan)"
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #f59e0b', fontSize: 12.5, fontWeight: 700 }}
                    />
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                Review requested items and confirm the <strong>actual dispatched quantity</strong>:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(() => {
                  const readyItems = (dispatchModalTransfer.items || []).filter(it => it.item_status === 'Ready to Process');
                  if (readyItems.length === 0) {
                    return (
                      <div style={{ padding: 20, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                        No items currently marked as 'Ready to Process'. Please mark accepted items as Ready to Process first.
                      </div>
                    );
                  }
                  return readyItems.map((it) => {
                    const isChecked = dispatchSelectedItems[it.id] !== undefined ? dispatchSelectedItems[it.id] : true;
                    return (
                      <div
                        key={it.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 2fr 1fr 1fr',
                          gap: 10,
                          alignItems: 'center',
                          background: isChecked ? '#f8fafc' : '#f1f5f9',
                          opacity: isChecked ? 1 : 0.6,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isChecked ? '1px solid #e2e8f0' : '1px dashed #cbd5e1'
                        }}
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => setDispatchSelectedItems({ ...dispatchSelectedItems, [it.id]: e.target.checked })}
                            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#d97706' }}
                            title={isChecked ? 'Uncheck to leave pending' : 'Check to dispatch'}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {it.image_url ? (
                              <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                            ) : (
                              <Utensils size={16} color="#94a3b8" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{it.dish_name}</strong>
                              {!isChecked && (
                                <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                                  Will stay Pending
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11.5, color: '#64748b' }}>
                              Req: <strong>{it.requested_qty} {it.uom}</strong>
                              {it.accepted_qty !== null && it.accepted_qty !== undefined && it.accepted_qty !== it.requested_qty && (
                                <span style={{ color: '#d97706', marginLeft: 4 }}>(Acc: {it.accepted_qty})</span>
                              )}
                            </span>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Sent Qty</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={!isChecked}
                            value={dispatchItemQuantities[it.id] ?? (it.accepted_qty ?? (it.confirmed_qty ?? it.requested_qty))}
                            onChange={e => setDispatchItemQuantities({ ...dispatchItemQuantities, [it.id]: e.target.value })}
                            style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700, background: isChecked ? '#fff' : '#e2e8f0' }}
                          />
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Item Remarks</span>
                          <input
                            type="text"
                            placeholder="e.g. 2 thermal crates"
                            disabled={!isChecked}
                            value={dispatchItemRemarks[it.id] ?? ''}
                            onChange={e => setDispatchItemRemarks({ ...dispatchItemRemarks, [it.id]: e.target.value })}
                            style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: isChecked ? '#fff' : '#e2e8f0' }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* General Dispatch Notes */}
              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Dispatch Notes / Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Vehicle plate 4921, fragile dessert boxes placed on top"
                  value={dispatchNotes}
                  onChange={e => setDispatchNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>

            </div>

            {/* Sticky Footer */}
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
                      <RefreshCw size={16} className="animate-spin" /> Dispatching...
                    </>
                  ) : (
                    <>
                      <Truck size={16} /> Confirm Handover & Dispatch
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. EXTEND DELIVERY TIME MODAL (REQUEST APPROVAL WORKFLOW)
      ───────────────────────────────────────────────────────────── */}
      {extendTimeTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setExtendTimeTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 520, width: '95%', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#d97706', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>⏱ Request Delivery Time Extension</h3>
                <span style={{ fontSize: 12, opacity: 0.9 }}>Transfer: {extendTimeTransfer.transfer_id}</span>
              </div>
              <button onClick={() => setExtendTimeTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Detailed Time Statistics */}
              {(() => {
                const origMins = extendTimeTransfer.original_delivery_minutes || extendTimeTransfer.delivery_minutes || 30;
                const prevExtMins = extendTimeTransfer.total_extended_minutes || 0;
                const currAllowed = extendTimeTransfer.delivery_minutes || 30;
                const requestedAdd = isCustomMinutes ? (parseInt(customMinutesInput, 10) || 0) : (parseInt(extendMinutes, 10) || 15);
                const updatedTotal = currAllowed + requestedAdd;
                const targetMs = extendTimeTransfer.expected_delivery_at ? new Date(extendTimeTransfer.expected_delivery_at).getTime() : 0;
                const diffMs = targetMs ? (targetMs - Date.now()) : 0;
                const isOverdue = diffMs <= 0;
                const absMin = Math.floor(Math.abs(diffMs) / 60000);
                const remainingText = targetMs ? (isOverdue ? `Expired (${absMin}m ago)` : `${absMin}m left`) : 'N/A';

                return (
                  <div style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '12px 14px',
                    marginBottom: 16,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 10,
                    fontSize: 12
                  }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Original Allocated Time:</span>
                      <strong style={{ color: '#0f172a', fontSize: 13 }}>{origMins} mins</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Previously Extended:</span>
                      <strong style={{ color: prevExtMins > 0 ? '#d97706' : '#64748b', fontSize: 13 }}>
                        {prevExtMins > 0 ? `+${prevExtMins} mins` : 'None (0m)'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Newly Requested:</span>
                      <strong style={{ color: '#2563eb', fontSize: 13 }}>
                        {requestedAdd > 0 ? `+${requestedAdd} mins` : '—'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block' }}>Updated Total Allowed:</span>
                      <strong style={{ color: '#16a34a', fontSize: 13 }}>
                        {updatedTotal} mins (If Approved)
                      </strong>
                    </div>
                    <div style={{ gridColumn: 'span 2', borderTop: '1px dashed #cbd5e1', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b' }}>Current Timer:</span>
                      <strong style={{ color: isOverdue ? '#dc2626' : '#059669', fontSize: 12.5 }}>
                        {remainingText}
                      </strong>
                    </div>
                  </div>
                );
              })()}

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                Select Extension Minutes:
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[10, 15, 30, 60].map(m => (
                  <button
                    key={`ext-${m}`}
                    type="button"
                    onClick={() => {
                      setIsCustomMinutes(false);
                      setExtendMinutes(m);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: (!isCustomMinutes && extendMinutes === m) ? '2px solid #d97706' : '1px solid #cbd5e1',
                      background: (!isCustomMinutes && extendMinutes === m) ? '#fef3c7' : '#fff',
                      color: (!isCustomMinutes && extendMinutes === m) ? '#92400e' : '#475569'
                    }}
                  >
                    +{m}m
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomMinutes(true);
                    if (!customMinutesInput) setCustomMinutesInput('20');
                  }}
                  style={{
                    flex: 1.2,
                    padding: '8px 10px',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: isCustomMinutes ? '2px solid #d97706' : '1px solid #cbd5e1',
                    background: isCustomMinutes ? '#fef3c7' : '#fff',
                    color: isCustomMinutes ? '#92400e' : '#475569'
                  }}
                >
                  Custom
                </button>
              </div>

              {isCustomMinutes && (
                <div style={{ marginBottom: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 10 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                    Enter Custom Extension Minutes:
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      max={360}
                      value={customMinutesInput}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomMinutesInput(val);
                        const parsed = parseInt(val, 10);
                        if (!isNaN(parsed) && parsed > 0) {
                          setExtendMinutes(parsed);
                        }
                      }}
                      placeholder="e.g. 25"
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1.5px solid #d97706',
                        fontSize: 13,
                        fontWeight: 700
                      }}
                      autoFocus
                    />
                    <span style={{ fontSize: 13, color: '#92400e', fontWeight: 700 }}>minutes</span>
                  </div>
                </div>
              )}

              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Mandatory Reason for Extension <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <textarea
                rows={3}
                required
                value={extendReason}
                onChange={e => setExtendReason(e.target.value)}
                placeholder="e.g. Sudden high dine-in rush in central kitchen, fresh batch marination needed"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13 }}
              />
              <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                ℹ️ The extension will NOT be applied automatically. A pending request will be sent to the requesting branch ({extendTimeTransfer.from_branch}) for authorization.
              </span>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setExtendTimeTransfer(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExtendTime}
                disabled={extendingTime}
                style={{
                  padding: '9px 18px',
                  background: '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: extendingTime ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {extendingTime ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                {extendingTime ? 'Sending Request...' : 'Send Extension Request for Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2b. REVIEW & APPROVE/MODIFY/REJECT EXTENSION MODAL
      ───────────────────────────────────────────────────────────── */}
      {reviewExtensionTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setReviewExtensionTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 540, width: '95%', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#d97706', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>⏳ Review Delivery Extension Request</h3>
                <span style={{ fontSize: 12, opacity: 0.9 }}>Transfer: {reviewExtensionTransfer.transfer_id}</span>
              </div>
              <button onClick={() => setReviewExtensionTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>Supplying Branch:</span>
                  <strong style={{ fontSize: 12.5, color: '#78350f' }}>{reviewExtensionTransfer.to_branch}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>Requested Additional Time:</span>
                  <strong style={{ fontSize: 14, color: '#b45309' }}>+{reviewExtensionTransfer.pending_extension_minutes} mins</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#92400e' }}>Requested By:</span>
                  <strong style={{ fontSize: 12.5, color: '#78350f' }}>{reviewExtensionTransfer.pending_extension_requested_by_name || 'Kitchen Staff'}</strong>
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #fcd34d' }}>
                  <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, display: 'block', marginBottom: 2 }}>Reason Provided:</span>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#78350f', fontStyle: 'italic' }}>
                    "{reviewExtensionTransfer.pending_extension_reason || 'Operational delay'}"
                  </p>
                </div>
              </div>

              {/* Action Selector: Accept vs Modify vs Reject */}
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                Select Review Action:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => setReviewAction('accept')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: reviewAction === 'accept' ? '2px solid #16a34a' : '1px solid #cbd5e1',
                    background: reviewAction === 'accept' ? '#f0fdf4' : '#fff',
                    color: reviewAction === 'accept' ? '#166534' : '#475569'
                  }}
                >
                  ✓ Accept (+{reviewExtensionTransfer.pending_extension_minutes}m)
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction('modify')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: reviewAction === 'modify' ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                    background: reviewAction === 'modify' ? '#f5f3ff' : '#fff',
                    color: reviewAction === 'modify' ? '#6d28d9' : '#475569'
                  }}
                >
                  ✏️ Modify Duration
                </button>
                <button
                  type="button"
                  onClick={() => setReviewAction('reject')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: reviewAction === 'reject' ? '2px solid #dc2626' : '1px solid #cbd5e1',
                    background: reviewAction === 'reject' ? '#fef2f2' : '#fff',
                    color: reviewAction === 'reject' ? '#991b1b' : '#475569'
                  }}
                >
                  ✕ Reject
                </button>
              </div>

              {/* Modify Panel */}
              {reviewAction === 'modify' && (
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Approve with Modified Duration (Minutes) <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={modifiedExtensionMinutes}
                    onChange={e => setModifiedExtensionMinutes(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #7c3aed', fontSize: 13, fontWeight: 700, marginBottom: 8 }}
                  />
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                    Modification Reason / Note (Optional):
                  </label>
                  <input
                    type="text"
                    value={modificationReason}
                    onChange={e => setModificationReason(e.target.value)}
                    placeholder="e.g. Can only grant 15 extra minutes due to peak customer rush"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                  />
                </div>
              )}

              {/* Reject Panel */}
              {reviewAction === 'reject' && (
                <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                    Mandatory Rejection Reason <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder="e.g. Cannot extend; guests are already waiting at tables"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #dc2626', fontSize: 12.5 }}
                  />
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setReviewExtensionTransfer(null)}>
                Cancel
              </button>
              {reviewAction === 'accept' && (
                <button
                  type="button"
                  onClick={() => handleAcceptExtension()}
                  disabled={reviewingExtension}
                  style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {reviewingExtension ? 'Accepting...' : `Confirm & Accept (+${reviewExtensionTransfer.pending_extension_minutes}m)`}
                </button>
              )}
              {reviewAction === 'modify' && (
                <button
                  type="button"
                  onClick={handleModifyExtension}
                  disabled={reviewingExtension}
                  style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {reviewingExtension ? 'Updating...' : `Approve Modified (+${modifiedExtensionMinutes}m)`}
                </button>
              )}
              {reviewAction === 'reject' && (
                <button
                  type="button"
                  onClick={handleRejectExtension}
                  disabled={reviewingExtension}
                  style={{ padding: '8px 16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {reviewingExtension ? 'Rejecting...' : 'Reject Extension'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. MODIFY QUANTITIES MODAL
      ───────────────────────────────────────────────────────────── */}
      {modifyQtyTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setModifyQtyTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 660, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#2563eb', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>✏ Confirm / Modify Fulfillable Quantities</h3>
                <span style={{ fontSize: 12, opacity: 0.9 }}>Transfer: {modifyQtyTransfer.transfer_id}</span>
              </div>
              <button onClick={() => setModifyQtyTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Adjust quantities that kitchen can supply. Original requested quantity is preserved for record.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(modifyQtyTransfer.items || []).map((it) => (
                  <div key={it.id} style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{it.dish_name}</strong>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Requested: <strong>{it.requested_qty} {it.uom}</strong></span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Confirmed Qty</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={modifiedItemQuantities[it.id] ?? (it.confirmed_qty ?? it.requested_qty)}
                          onChange={e => setModifiedItemQuantities({ ...modifiedItemQuantities, [it.id]: e.target.value })}
                          style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700 }}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Reason (if modified)</span>
                        <input
                          type="text"
                          placeholder="e.g. Limited stock available"
                          value={modifiedItemReasons[it.id] ?? ''}
                          onChange={e => setModifiedItemReasons({ ...modifiedItemReasons, [it.id]: e.target.value })}
                          style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  General Reason / Kitchen Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Evening prep batch still in oven, partial batch dispatched"
                  value={modifyGeneralReason}
                  onChange={e => setModifyGeneralReason(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModifyQtyTransfer(null)}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmModifyQty}
                disabled={modifyingQty}
                style={{
                  padding: '9px 18px',
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: modifyingQty ? 'not-allowed' : 'pointer'
                }}
              >
                {modifyingQty ? 'Updating...' : 'Save & Confirm Quantities'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. RECEIVING & VERIFICATION MODAL (REQUESTING BRANCH)
      ───────────────────────────────────────────────────────────── */}
      {receiveModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setReceiveModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 740, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header (Fixed) */}
            <div style={{ flexShrink: 0, background: '#16a34a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                  📦 Goods Verification & Receiving — {receiveModalTransfer.transfer_id}
                </h3>
                <span style={{ fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span>Supplied by:</span> <BranchBadge branch={receiveModalTransfer.to_branch} isExternal={receiveModalTransfer.is_external} /> · <span>Dispatched: {receiveModalTransfer.dispatched_at ? new Date(receiveModalTransfer.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</span>
                </span>
              </div>
              <button onClick={() => setReceiveModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                Verify received items. The system automatically computes <strong>Sent vs Received</strong> variances:
              </p>

              {receiveModalTransfer.handover_to_name && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: 6, marginBottom: 14, fontSize: 12 }}>
                  <strong>Handover Representative:</strong> {receiveModalTransfer.handover_to_name} (Dispatched by: {receiveModalTransfer.handover_by_name || receiveModalTransfer.dispatched_by_name || 'Kitchen'})
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                {(() => {
                  const dispatchedItems = (receiveModalTransfer.items || []).filter(it => {
                    const sentQ = it.sent_qty !== null && it.sent_qty !== undefined ? parseFloat(it.sent_qty) : (it.dispatched_qty !== null && it.dispatched_qty !== undefined ? parseFloat(it.dispatched_qty) : 0);
                    return sentQ > 0;
                  });

                  if (dispatchedItems.length === 0) {
                    return (
                      <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 8 }}>
                        No dispatched items found in this transfer to receive.
                      </div>
                    );
                  }

                  return dispatchedItems.map((it) => {
                    const isChecked = receiveSelectedItems[it.id] !== undefined ? receiveSelectedItems[it.id] : true;
                    const sentQ = it.sent_qty !== null ? parseFloat(it.sent_qty) : parseFloat(it.confirmed_qty ?? it.requested_qty);
                    const recQ = parseFloat(receiveItemQuantities[it.id] !== undefined ? receiveItemQuantities[it.id] : sentQ) || 0;
                    const variance = recQ - sentQ;

                    return (
                      <div
                        key={it.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 2fr 1fr 1.2fr 1.2fr',
                          gap: 10,
                          alignItems: 'center',
                          background: isChecked ? '#f8fafc' : '#f1f5f9',
                          opacity: isChecked ? 1 : 0.6,
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isChecked ? '1px solid #e2e8f0' : '1px dashed #cbd5e1'
                        }}
                      >
                        <div>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => setReceiveSelectedItems({ ...receiveSelectedItems, [it.id]: e.target.checked })}
                            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#16a34a' }}
                            title={isChecked ? 'Uncheck to receive later' : 'Check to receive'}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 6, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {it.image_url ? (
                              <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                            ) : (
                              <Utensils size={16} color="#94a3b8" />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <strong style={{ fontSize: 13.5, color: '#0f172a' }}>{it.dish_name}</strong>
                              {!isChecked && (
                                <span style={{ fontSize: 10, background: '#e2e8f0', color: '#64748b', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>
                                  Will receive later
                                </span>
                              )}
                            </div>
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
                            disabled={!isChecked}
                            value={receiveItemQuantities[it.id] ?? sentQ}
                            onChange={e => setReceiveItemQuantities({ ...receiveItemQuantities, [it.id]: e.target.value })}
                            style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 13, fontWeight: 700, background: isChecked ? '#fff' : '#e2e8f0' }}
                          />
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Variance</span>
                          <div style={{ fontSize: 12.5, fontWeight: 800, color: variance < 0 ? '#dc2626' : (variance > 0 ? '#2563eb' : '#16a34a') }}>
                            {variance === 0 ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#16a34a' }}>
                                <CheckCircle2 size={13} /> Matched
                              </span>
                            ) : variance < 0 ? (
                              <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: 4 }}>
                                Short: {variance.toFixed(2)} {it.uom}
                              </span>
                            ) : (
                              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: 4 }}>
                                Excess: +{variance.toFixed(2)} {it.uom}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 2 }}>Item Remarks</span>
                          <input
                            type="text"
                            placeholder="Condition / damage"
                            disabled={!isChecked}
                            value={receiveItemRemarks[it.id] ?? ''}
                            onChange={e => setReceiveItemRemarks({ ...receiveItemRemarks, [it.id]: e.target.value })}
                            style={{ width: '100%', padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: isChecked ? '#fff' : '#e2e8f0' }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Mandatory Discrepancy Reason if variance detected */}
              {(() => {
                const anyVar = (receiveModalTransfer.items || []).some(it => {
                  const sentQ = parseFloat(it.sent_qty !== null ? it.sent_qty : (it.confirmed_qty ?? it.requested_qty));
                  const recQ = parseFloat(receiveItemQuantities[it.id] ?? sentQ);
                  return Math.abs(recQ - sentQ) > 0.001;
                });

                if (!anyVar) return null;

                return (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #f87171', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: '#991b1b', marginBottom: 6 }}>
                      ⚠️ Discrepancy Reason (Mandatory) <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2 boxes damaged during transit, missing 1 plate"
                      value={discrepancyReason}
                      onChange={e => setDiscrepancyReason(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #dc2626', fontSize: 13, fontWeight: 600 }}
                    />
                    <span style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, display: 'block' }}>
                      Status will be marked as <strong>Partially Received</strong> and supplying branch will be notified.
                    </span>
                  </div>
                );
              })()}

              {/* Overall Receiving Remarks */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Overall Delivery Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Delivered on time, driver handed over receipt"
                  value={receiveNotes}
                  onChange={e => setReceiveNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}
                />
              </div>
            </div>

            {/* Sticky Footer */}
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

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  onClick={() => handleConfirmReceive(false)}
                  disabled={receiving}
                  style={{
                    padding: '9px 18px',
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
                    pointerEvents: receiving ? 'none' : 'auto',
                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.25)'
                  }}
                  title="Save receiving confirmation without printing"
                >
                  {receiving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Receive & Accept
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmReceive(true)}
                  disabled={receiving}
                  style={{
                    padding: '9px 18px',
                    background: receiving ? '#94a3b8' : '#0284c7',
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
                    pointerEvents: receiving ? 'none' : 'auto',
                    boxShadow: '0 1px 3px rgba(2, 132, 199, 0.25)'
                  }}
                  title="Save receiving confirmation and automatically print receiving slip"
                >
                  {receiving ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Saving & Printing...
                    </>
                  ) : (
                    <>
                      <Printer size={16} /> Receive & Print
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          5. DETAIL & AUDIT ACTIVITY HISTORY MODAL
      ───────────────────────────────────────────────────────────── */}
      {detailModalTransfer && (
        <div className="modal-overlay" onClick={e => { if (e.target.classList.contains('modal-overlay')) setDetailModalTransfer(null); }} style={{ zIndex: 9999 }}>
          <div className="modal" style={{ maxWidth: 840, width: '95%', maxHeight: '90vh', background: '#fff', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header */}
            <div style={{ flexShrink: 0, background: '#0f172a', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Transfer Ref: {detailModalTransfer.transfer_id}</h3>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: detailModalTransfer.request_type === 'New Request' ? '#166534' : '#1e40af',
                    color: '#fff'
                  }}>
                    {detailModalTransfer.request_type || 'Transfer Request'}
                  </span>
                  {detailModalTransfer.priority && detailModalTransfer.priority !== 'Normal' && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: detailModalTransfer.priority === 'Urgent' ? '#dc2626' : '#d97706',
                      color: '#fff'
                    }}>
                      {detailModalTransfer.priority === 'Urgent' ? '🚨 URGENT' : '⚡ HIGH'}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginTop: 3 }}>
                  Recorded on {new Date(detailModalTransfer.request_date).toLocaleString()}
                </span>
              </div>
              <button onClick={() => setDetailModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>

            {/* Modal Tabs: Summary vs Activity Log */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
              <button
                type="button"
                onClick={() => setDetailModalTab('summary')}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  color: detailModalTab === 'summary' ? '#2563eb' : '#64748b',
                  borderBottom: detailModalTab === 'summary' ? '2.5px solid #2563eb' : '2.5px solid transparent'
                }}
              >
                Transfer Record Details
              </button>
              <button
                type="button"
                onClick={() => setDetailModalTab('activity')}
                style={{
                  padding: '10px 16px',
                  border: 'none',
                  background: 'transparent',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: detailModalTab === 'activity' ? '#2563eb' : '#64748b',
                  borderBottom: detailModalTab === 'activity' ? '2.5px solid #2563eb' : '2.5px solid transparent'
                }}
              >
                <History size={14} /> Audit & Chronological Activity ({activityLogs.length})
              </button>
            </div>

            {/* Scrollable Body */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 20 }}>
              {detailModalTab === 'summary' ? (
                <div>
                  {/* Extension Alert Banner if Pending */}
                  {detailModalTransfer.extension_status === 'Pending' && (
                    <div style={{
                      background: '#fffbeb',
                      border: '1.5px solid #fcd34d',
                      borderRadius: 8,
                      padding: '12px 14px',
                      marginBottom: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 13, color: '#92400e' }}>
                          <Timer size={16} color="#d97706" /> Delivery Time Extension Requested: +{detailModalTransfer.pending_extension_minutes}m
                        </div>
                        <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #fde68a' }}>
                          Awaiting Approval
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#78350f' }}>
                        <strong>Reason:</strong> "{detailModalTransfer.pending_extension_reason || 'Kitchen preparation delay'}"
                        {detailModalTransfer.pending_extension_requested_by_name && (
                          <span style={{ color: '#92400e', marginLeft: 6 }}>— By {detailModalTransfer.pending_extension_requested_by_name}</span>
                        )}
                      </div>
                      {canReviewExtension(detailModalTransfer) && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => handleAcceptExtension(detailModalTransfer)}
                            disabled={reviewingExtension}
                            style={{ padding: '6px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ✓ Accept (+{detailModalTransfer.pending_extension_minutes}m)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenReviewExtensionModal(detailModalTransfer)}
                            style={{ padding: '6px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                          >
                            ✏️ Modify / Reject...
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 16-Point Comprehensive Record Metadata Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 12,
                    marginBottom: 18,
                    background: '#f8fafc',
                    padding: 14,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    fontSize: 12.5
                  }}>
                    {/* 1. Transfer ID / Ref */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>1. Reference Number:</span>
                      <strong style={{ color: '#0f172a', fontSize: 13 }}>{detailModalTransfer.transfer_id}</strong>
                    </div>

                    {/* 2. Sending Branch */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>2. Sending Branch (Origin):</span>
                      <BranchBadge branch={detailModalTransfer.from_branch} />
                    </div>

                    {/* 3. Receiving Branch */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>3. Receiving Branch (Destination):</span>
                      <BranchBadge branch={detailModalTransfer.to_branch} isExternal={detailModalTransfer.is_external} />
                    </div>

                    {/* 4. Requested By */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>4. Requested By:</span>
                      <strong style={{ color: '#334155' }}>{detailModalTransfer.requested_by_name || 'Staff'}</strong>
                      {detailModalTransfer.requested_by_user_id && (
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>(User #{detailModalTransfer.requested_by_user_id})</span>
                      )}
                    </div>

                    {/* 5. Received By */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>5. Received By:</span>
                      <strong style={{ color: detailModalTransfer.received_by_name ? '#15803d' : '#94a3b8' }}>
                        {detailModalTransfer.received_by_name || 'Pending Receiving Confirmation'}
                      </strong>
                      {detailModalTransfer.received_by_user_id && (
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>(User #{detailModalTransfer.received_by_user_id})</span>
                      )}
                    </div>

                    {/* 6. Request Date & Time */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>6. Request Date & Time:</span>
                      <strong>{new Date(detailModalTransfer.request_date).toLocaleString()}</strong>
                    </div>

                    {/* 7a. Dispatched Date & Time */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>7a. Dispatched Date & Time:</span>
                      <strong style={{ color: detailModalTransfer.dispatched_at ? '#2563eb' : '#64748b' }}>
                        {detailModalTransfer.dispatched_at ? new Date(detailModalTransfer.dispatched_at).toLocaleString() : 'Not dispatched yet'}
                      </strong>
                      {detailModalTransfer.dispatched_by_name && (
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>By {detailModalTransfer.dispatched_by_name} {detailModalTransfer.handover_to_name ? `→ ${detailModalTransfer.handover_to_name}` : ''}</span>
                      )}
                    </div>

                    {/* 7b. Actual Received Date & Time */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>7b. Actual Received Date & Time:</span>
                      <strong style={{ color: detailModalTransfer.received_at ? '#15803d' : '#64748b' }}>
                        {detailModalTransfer.received_at ? new Date(detailModalTransfer.received_at).toLocaleString() : 'Not received yet'}
                      </strong>
                    </div>

                    {/* 8. Transfer Status */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>8. Transfer Status:</span>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 12,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background: detailModalTransfer.status === 'Pending' ? '#fef3c7' : (detailModalTransfer.status === 'In Progress' ? '#dbeafe' : (detailModalTransfer.status === 'Ready for Dispatch' ? '#f3e8ff' : (['Dispatched', 'In-Transit'].includes(detailModalTransfer.status) ? '#e0f2fe' : (detailModalTransfer.status === 'Partially Received' ? '#ffedd5' : (detailModalTransfer.status === 'Fully Received' || detailModalTransfer.status === 'Completed' ? '#ecfdf5' : '#fee2e2'))))),
                        color: detailModalTransfer.status === 'Pending' ? '#92400e' : (detailModalTransfer.status === 'In Progress' ? '#1e40af' : (detailModalTransfer.status === 'Ready for Dispatch' ? '#6b21a8' : (['Dispatched', 'In-Transit'].includes(detailModalTransfer.status) ? '#0369a1' : (detailModalTransfer.status === 'Partially Received' ? '#c2410c' : (detailModalTransfer.status === 'Fully Received' || detailModalTransfer.status === 'Completed' ? '#047857' : '#991b1b')))))
                      }}>
                        {detailModalTransfer.status}
                      </span>
                    </div>

                    {/* Day & Needed By */}
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Delivery Target Day:</span>
                      <strong style={{ color: '#0f172a', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}>
                        {detailModalTransfer.delivery_day || 'Today'}
                      </strong>
                    </div>

                    {/* Discrepancy Reason if any */}
                    {detailModalTransfer.discrepancy_reason && (
                      <div style={{ gridColumn: 'span 2', background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 10px', borderRadius: 6 }}>
                        <span style={{ color: '#dc2626', fontWeight: 800, display: 'block', fontSize: 11 }}>15. Discrepancy Reason:</span>
                        <span style={{ color: '#991b1b', fontWeight: 600 }}>{detailModalTransfer.discrepancy_reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Formatted Transferred Items Table (Points 9, 10, 11, 12, 13, 14, 15) */}
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                        9-14. Transferred Items & Quantity Breakdown:
                      </h4>
                      <span style={{ fontSize: 11.5, color: '#64748b' }}>
                        {(detailModalTransfer.items || []).length} item row(s)
                      </span>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', color: '#475569', fontWeight: 700 }}>
                          <tr>
                            <th style={{ padding: '9px 10px', width: 35 }}>#</th>
                            <th style={{ padding: '9px 10px' }}>Product / Dish Name</th>
                            <th style={{ padding: '9px 10px' }}>SKU / Barcode</th>
                            <th style={{ padding: '9px 10px' }}>Unit</th>
                            <th style={{ padding: '9px 10px', textAlign: 'center' }}>Requested</th>
                            <th style={{ padding: '9px 10px', textAlign: 'center' }}>Confirmed</th>
                            <th style={{ padding: '9px 10px', textAlign: 'center' }}>Dispatched</th>
                            <th style={{ padding: '9px 10px', textAlign: 'center' }}>Received</th>
                            <th style={{ padding: '9px 10px', textAlign: 'center' }}>Pending / Var</th>
                            <th style={{ padding: '9px 10px' }}>Item Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(detailModalTransfer.items || []).map((it, idx) => {
                            const reqQ = parseFloat(it.requested_qty || 0);
                            const confQ = it.confirmed_qty !== null && it.confirmed_qty !== undefined ? parseFloat(it.confirmed_qty) : reqQ;
                            const sentQ = it.sent_qty !== null && it.sent_qty !== undefined ? parseFloat(it.sent_qty) : null;
                            const recQ = it.received_qty !== null && it.received_qty !== undefined ? parseFloat(it.received_qty) : null;
                            const varQ = it.variance_qty !== null && it.variance_qty !== undefined 
                              ? parseFloat(it.variance_qty) 
                              : (recQ !== null && sentQ !== null ? (recQ - sentQ) : null);
                            const pendingQ = sentQ !== null ? Math.max(0, sentQ - (recQ || 0)) : (confQ - (recQ || 0));

                            return (
                              <tr key={it.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ padding: '8px 10px', color: '#94a3b8' }}>{idx + 1}</td>
                                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 24, height: 24, borderRadius: 4, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                      {it.image_url ? (
                                        <img src={it.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                                      ) : (
                                        <Utensils size={12} color="#94a3b8" />
                                      )}
                                    </div>
                                    <span>{it.dish_name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11 }}>
                                  <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                                    {it.sku || it.barcode || it.short_code || '-'}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#475569', fontWeight: 600 }}>{it.uom}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{reqQ}</td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: confQ !== reqQ ? '#d97706' : '#475569', fontWeight: confQ !== reqQ ? 700 : 400 }}>
                                  {confQ}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#2563eb', fontWeight: 700 }}>
                                  {sentQ !== null ? sentQ : '-'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: '#16a34a', fontWeight: 700 }}>
                                  {recQ !== null ? recQ : '-'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: varQ !== null && varQ < 0 ? '#dc2626' : (varQ !== null && varQ > 0 ? '#2563eb' : '#64748b') }}>
                                  {varQ !== null ? (varQ === 0 ? '0 (Exact)' : `${varQ > 0 ? '+' : ''}${varQ}`) : (pendingQ > 0 ? `${pendingQ} Pending` : '-')}
                                </td>
                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11.5 }}>
                                  {it.remarks || it.quantity_change_reason || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* 15. General Notes / Instructions */}
                  {detailModalTransfer.notes && (
                    <div style={{ marginTop: 14, background: '#fef3c7', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#92400e', border: '1px solid #fde68a' }}>
                      <strong style={{ display: 'block', marginBottom: 2 }}>General Notes & Dispatch Instructions:</strong>
                      {detailModalTransfer.notes}
                    </div>
                  )}
                </div>
              ) : (
                /* Activity History Timeline */
                <div>
                  {/* Delivery & Extension Statistics Header */}
                  {detailModalTransfer && (
                    <div style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      padding: '12px 14px',
                      marginBottom: 16,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      fontSize: 12
                    }}>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Original Time:</span>
                        <strong style={{ color: '#0f172a' }}>{detailModalTransfer.original_delivery_minutes || detailModalTransfer.delivery_minutes || 30}m</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Extended Time:</span>
                        <strong style={{ color: (detailModalTransfer.total_extended_minutes || 0) > 0 ? '#d97706' : '#64748b' }}>
                          +{(detailModalTransfer.total_extended_minutes || 0)}m
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Total Allowed:</span>
                        <strong style={{ color: '#2563eb' }}>{detailModalTransfer.delivery_minutes || 30}m</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: 11 }}>Extension Status:</span>
                        <span style={{
                          fontWeight: 700,
                          fontSize: 11,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: detailModalTransfer.extension_status === 'Pending' ? '#fef3c7' : (detailModalTransfer.extension_status === 'Accepted' || detailModalTransfer.extension_status === 'Modified & Approved' ? '#dcfce7' : '#f1f5f9'),
                          color: detailModalTransfer.extension_status === 'Pending' ? '#b45309' : (detailModalTransfer.extension_status === 'Accepted' || detailModalTransfer.extension_status === 'Modified & Approved' ? '#15803d' : '#64748b')
                        }}>
                          {detailModalTransfer.extension_status || 'None'}
                        </span>
                      </div>
                    </div>
                  )}

                  {loadingActivityLogs ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading activity logs...</div>
                  ) : activityLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>No activity history recorded yet.</div>
                  ) : (
                    <div style={{ position: 'relative', paddingLeft: 20, borderLeft: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {activityLogs.map((log) => {
                        const actionRaw = log.action || log.action_type || 'ACTIVITY';
                        const actionFormatted = String(actionRaw).replace(/_/g, ' ');
                        const desc = log.details || log.description || '';
                        const actor = log.performed_by_name || log.user_name || 'Staff';
                        const role = log.user_role || 'Staff';

                        let badgeBg = '#f1f5f9';
                        let badgeColor = '#475569';
                        let dotColor = '#94a3b8';
                        if (actionRaw.includes('REQUEST_CREATED')) { badgeBg = '#eff6ff'; badgeColor = '#1d4ed8'; dotColor = '#2563eb'; }
                        else if (actionRaw.includes('EXTENSION_REQUESTED')) { badgeBg = '#fffbeb'; badgeColor = '#b45309'; dotColor = '#d97706'; }
                        else if (actionRaw.includes('EXTENSION_ACCEPTED') || actionRaw.includes('EXTENSION_MODIFIED')) { badgeBg = '#f0fdf4'; badgeColor = '#166534'; dotColor = '#16a34a'; }
                        else if (actionRaw.includes('EXTENSION_REJECTED')) { badgeBg = '#fef2f2'; badgeColor = '#991b1b'; dotColor = '#dc2626'; }
                        else if (actionRaw.includes('PROCESSING_STARTED')) { badgeBg = '#f5f3ff'; badgeColor = '#6d28d9'; dotColor = '#7c3aed'; }
                        else if (actionRaw.includes('QUANTITY_MODIFIED')) { badgeBg = '#fff7ed'; badgeColor = '#c2410c'; dotColor = '#ea580c'; }
                        else if (actionRaw.includes('READY_FOR_DISPATCH')) { badgeBg = '#f0fdfa'; badgeColor = '#0f766e'; dotColor = '#14b8a6'; }
                        else if (actionRaw.includes('DISPATCH')) { badgeBg = '#f0f9ff'; badgeColor = '#0369a1'; dotColor = '#0284c7'; }
                        else if (actionRaw.includes('RECEIVE')) { badgeBg = '#ecfdf5'; badgeColor = '#047857'; dotColor = '#059669'; }
                        else if (actionRaw.includes('COMPLETED')) { badgeBg = '#ecfdf5'; badgeColor = '#065f46'; dotColor = '#10b981'; }
                        else if (actionRaw.includes('CANCEL')) { badgeBg = '#fff1f2'; badgeColor = '#be123c'; dotColor = '#e11d48'; }

                        return (
                          <div key={log.id} style={{ position: 'relative' }}>
                            <div style={{
                              position: 'absolute',
                              left: -27,
                              top: 4,
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: dotColor,
                              border: '2px solid #fff'
                            }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <span style={{
                                background: badgeBg,
                                color: badgeColor,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11.5,
                                fontWeight: 800,
                                textTransform: 'uppercase'
                              }}>
                                {actionFormatted}
                              </span>
                              <span style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(log.created_at).toLocaleString()}</span>
                            </div>

                            <p style={{ margin: '4px 0', fontSize: 12.5, color: '#334155', lineHeight: 1.4 }}>{desc}</p>

                            {(log.previous_value || log.new_value) && (
                              <div style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 6,
                                padding: '4px 8px',
                                fontSize: 11.5,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                margin: '4px 0'
                              }}>
                                {log.previous_value && <span style={{ color: '#64748b' }}>Prev: <strong style={{ color: '#dc2626' }}>{log.previous_value}</strong></span>}
                                {log.previous_value && log.new_value && <span style={{ color: '#94a3b8' }}>➔</span>}
                                {log.new_value && <span style={{ color: '#64748b' }}>New: <strong style={{ color: '#16a34a' }}>{log.new_value}</strong></span>}
                              </div>
                            )}

                            {log.reason && (
                              <div style={{ fontSize: 11.5, color: '#78350f', background: '#fffbeb', padding: '3px 8px', borderRadius: 4, margin: '2px 0 4px', borderLeft: '2px solid #f59e0b' }}>
                                <strong>Reason:</strong> {log.reason}
                              </div>
                            )}

                            <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 }}>
                              By: <strong>{actor}</strong> ({role})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {['Pending', 'In Progress'].includes(detailModalTransfer.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = detailModalTransfer;
                      setDetailModalTransfer(null);
                      handleOpenEditRequestModal(t);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: 'none',
                      background: '#2563eb',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: '#fff'
                    }}
                  >
                    <Edit size={14} /> Modify Request
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => setDetailModalTransfer(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: MODIFY TRANSFER REQUEST (Before Dispatch)
      ───────────────────────────────────────────────────────────── */}
      {editTransferModal && (
        <div
          className="modal-overlay"
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setEditTransferModal(null); }}
          style={{ zIndex: 9999 }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 780,
              width: '95%',
              maxHeight: '92vh',
              background: '#fff',
              borderRadius: 12,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div style={{ flexShrink: 0, background: '#1e40af', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Edit size={18} />
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                    Modify Transfer Request #{editTransferModal.transfer_id}
                  </h3>
                </div>
                <span style={{ fontSize: 12, opacity: 0.9, marginTop: 2, display: 'block' }}>
                  Origin: <strong>{editTransferModal.from_branch}</strong> ➔ Destination: <strong>{editTransferModal.to_branch}</strong> | Status: <strong>{editTransferModal.status}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditTransferModal(null)}
                style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditRequest} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                
                {/* Notice Banner */}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12.5, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                  <span>
                    You can modify dishes, quantities, delivery window, and remarks before the destination branch dispatches this order. An audit log entry will be recorded and destination branch notified.
                  </span>
                </div>

                {/* Priority & Delivery Window Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
                  {/* Priority */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      Transfer Priority
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { id: 'Normal', label: 'Normal', bg: '#f1f5f9', activeBg: '#0f172a' },
                        { id: 'High', label: 'High', bg: '#fffbeb', activeBg: '#d97706' },
                        { id: 'Urgent', label: '🚨 Urgent', bg: '#fef2f2', activeBg: '#dc2626' }
                      ].map(p => (
                        <button
                          key={`edit-prio-${p.id}`}
                          type="button"
                          onClick={() => setEditPriority(p.id)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: editPriority === p.id ? `1.5px solid ${p.activeBg}` : '1px solid #cbd5e1',
                            background: editPriority === p.id ? p.activeBg : p.bg,
                            color: editPriority === p.id ? '#fff' : '#475569'
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day Selection */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                      Day Selection <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['Today', 'Tomorrow', 'Custom Date'].map(dOpt => (
                        <button
                          key={`edit-day-${dOpt}`}
                          type="button"
                          onClick={() => setEditDayOption(dOpt)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: editDayOption === dOpt ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                            background: editDayOption === dOpt ? '#2563eb' : '#fff',
                            color: editDayOption === dOpt ? '#fff' : '#475569'
                          }}
                        >
                          {dOpt}
                        </button>
                      ))}
                    </div>
                    {editDayOption === 'Custom Date' && (
                      <div style={{ marginTop: 8 }}>
                        <input
                          type="date"
                          value={editCustomDayDate}
                          min={new Date().toISOString().slice(0, 10)}
                          onChange={e => setEditCustomDayDate(e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: 6, border: '1.5px solid #3b82f6', fontSize: 12 }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Items Section Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      Requested Dishes & Items ({editDishRows.length})
                    </h4>
                    <span style={{ fontSize: 11.5, color: '#64748b' }}>
                      Adjust dishes, quantities or UOM.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenuBrowser(true);
                      if (!dishes || dishes.length === 0) fetchDishes();
                    }}
                    style={{
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      borderRadius: 6,
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1d4ed8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <BookOpen size={14} /> Open Menu Items
                  </button>
                </div>

                {/* Edit Dish Rows List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'visible', position: 'relative', marginBottom: 14 }}>
                  {editDishRows.map((row, idx) => {
                    const rowUnits = row.available_units && row.available_units.length > 0
                      ? row.available_units
                      : ['Piece', 'Half', 'Full', 'Regular', 'Large', 'Kg'];

                    return (
                      <div
                        key={row.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'minmax(260px, 3.2fr) minmax(110px, 1.2fr) minmax(90px, 1fr) minmax(130px, 1.4fr) 36px',
                          gap: 10,
                          alignItems: 'center',
                          background: '#f8fafc',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid #e2e8f0',
                          position: 'relative',
                          zIndex: 100 - idx
                        }}
                      >
                        {/* Dish Search Dropdown */}
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span>Item #{idx + 1}</span>
                            {row.isLocked && (
                              <span style={{ background: '#dcfce7', color: '#166534', fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Lock size={10} /> Accepted - Locked
                              </span>
                            )}
                          </span>
                          {row.isLocked ? (
                            <div style={{ padding: '8px 10px', background: '#f1f5f9', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                              {row.dish_name}
                            </div>
                          ) : (
                            <DishSearchDropdown
                              value={row.dish_name}
                              imageUrl={row.image_url}
                              dishes={Array.isArray(dishes) && dishes.length > 0 ? dishes : (Array.isArray(posItems) ? posItems : [])}
                              onSelect={(dish) => handleSelectDishEdit(row.id, dish)}
                            />
                          )}
                        </div>

                        {/* Dynamic UOM */}
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                            Unit (UOM)
                          </span>
                          <select
                            disabled={row.isLocked}
                            value={row.uom || rowUnits[0]}
                            onChange={e => handleEditDishRowChange(row.id, 'uom', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5, fontWeight: 600, background: row.isLocked ? '#f1f5f9' : '#fff' }}
                          >
                            {rowUnits.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </div>

                        {/* Requested Qty */}
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                            Qty *
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0.1"
                            placeholder="Qty"
                            disabled={row.isLocked}
                            value={row.requested_qty}
                            onChange={e => handleEditDishRowChange(row.id, 'requested_qty', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, fontWeight: 700, textAlign: 'center', background: row.isLocked ? '#f1f5f9' : '#fff' }}
                          />
                        </div>

                        {/* Remarks */}
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>
                            Remarks
                          </span>
                          <input
                            type="text"
                            placeholder="e.g. Crate / fresh"
                            disabled={row.isLocked}
                            value={row.remarks || ''}
                            onChange={e => handleEditDishRowChange(row.id, 'remarks', e.target.value)}
                            style={{ width: '100%', padding: '8px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: row.isLocked ? '#f1f5f9' : '#fff' }}
                          />
                        </div>

                        {/* Delete row */}
                        <div style={{ paddingTop: 16 }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveEditDishRow(row.id)}
                            disabled={row.isLocked || editDishRows.length <= 1}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 6,
                              border: '1px solid #fee2e2',
                              background: (row.isLocked || editDishRows.length <= 1) ? '#f8fafc' : '#fef2f2',
                              color: (row.isLocked || editDishRows.length <= 1) ? '#cbd5e1' : '#dc2626',
                              cursor: (row.isLocked || editDishRows.length <= 1) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            title={row.isLocked ? "Accepted items cannot be removed" : "Remove item"}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* + Add Another Item button */}
                <div style={{ marginBottom: 18 }}>
                  <button
                    type="button"
                    onClick={handleAddEditDishRow}
                    style={{
                      width: '100%',
                      padding: '9px 14px',
                      borderRadius: 8,
                      border: '1.5px dashed #2563eb',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <PlusCircle size={15} /> + Add Another Item
                  </button>
                </div>

                {/* Transfer Notes */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    General Transfer Notes / Dispatch Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Updated dispatch instructions..."
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12.5 }}
                  />
                </div>

                {/* Mandatory Modification Reason */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                    Reason for Modifying Request <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Guest headcount increased, need extra 5 plates"
                    value={editReason}
                    onChange={e => setEditReason(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 6, border: '1.5px solid #2563eb', fontSize: 13, background: '#fff' }}
                  />
                  <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Required for the audit log and destination branch notification.
                  </span>
                </div>

              </div>

              {/* Modal Footer */}
              <div style={{ flexShrink: 0, borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditTransferModal(null)}
                  disabled={savingEditRequest}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingEditRequest}
                  style={{
                    padding: '9px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  {savingEditRequest ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Saving Changes...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Save & Update Request
                    </>
                  )}
                </button>
              </div>
            </form>
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
                <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <strong>Loading menu items from restaurant catalog...</strong>
                </div>
              ) : filteredBrowserDishes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 50, color: '#64748b' }}>
                  <Utensils size={40} color="#cbd5e1" style={{ margin: '0 auto 10px' }} />
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#334155' }}>No dishes found</p>
                  <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 14 }}>
                    Try adjusting your search query, or click reload to refresh from menu
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchDishes()}
                    style={{
                      background: '#eff6ff',
                      border: '1.5px solid #2563eb',
                      borderRadius: 6,
                      padding: '7px 16px',
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: '#2563eb',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Reload Menu Items
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: 14
                }}>
                  {filteredBrowserDishes.map(d => {
                    const targetRows = editTransferModal ? editDishRows : (activeTab === 'transfer_request' ? trfDishRows : newDishRows);
                    const existingRow = targetRows.find(r => r.item_id === d.id || (r.dish_name && r.dish_name.toLowerCase() === d.name.toLowerCase()));
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
                <strong>{(editTransferModal ? editDishRows : (activeTab === 'transfer_request' ? trfDishRows : newDishRows)).filter(r => r.dish_name && r.dish_name.trim()).length}</strong> dishes currently in transfer request
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

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ACCEPT TRANSFER ITEM (With Quantity Modification & Mandatory Reason)
      ───────────────────────────────────────────────────────────── */}
      {acceptItemModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setAcceptItemModal(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 480,
              width: '95%',
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#f8fafc', padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Accept Transfer Item</h3>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>Transfer #{acceptItemModal.transferId}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAcceptItemModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20 }}>
              {/* Item Info Box */}
              <div style={{ background: '#f1f5f9', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{acceptItemModal.item.dish_name}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Unit: <strong>{acceptItemModal.item.uom || 'Pices'}</strong>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Requested Quantity</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#2563eb' }}>
                    {acceptItemModal.item.requested_qty} {acceptItemModal.item.uom || 'Pices'}
                  </div>
                </div>
              </div>

              {/* Accepted Quantity Input */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Accepted Quantity ({acceptItemModal.item.uom || 'Pices'}):
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={acceptItemModal.acceptedQty}
                  onChange={e => setAcceptItemModal(prev => ({ ...prev, acceptedQty: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 14,
                    fontWeight: 700
                  }}
                />
              </div>

              {/* Status Banner based on Quantity Diff */}
              {(() => {
                const req = parseFloat(acceptItemModal.item.requested_qty || 0);
                const acc = parseFloat(acceptItemModal.acceptedQty);
                if (isNaN(acc)) return null;
                const isDiff = Math.abs(acc - req) > 0.0001;

                if (!isDiff) {
                  return (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} /> Full requested quantity accepted. No modification reason required.
                    </div>
                  );
                }
                if (acc < req) {
                  return (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} /> Reduced quantity accepted ({acc} of {req} {acceptItemModal.item.uom}). <strong>Reason is mandatory.</strong>
                    </div>
                  );
                }
                return (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} /> Increased quantity accepted ({acc} vs {req} {acceptItemModal.item.uom}). <strong>Reason is mandatory.</strong>
                  </div>
                );
              })()}

              {/* Modification Reason Input */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Reason / Remarks {Math.abs(parseFloat(acceptItemModal.acceptedQty || 0) - parseFloat(acceptItemModal.item.requested_qty || 0)) > 0.0001 && <span style={{ color: '#dc2626' }}>* (Mandatory)</span>}:
                </label>
                <textarea
                  rows={3}
                  value={acceptItemModal.reason}
                  onChange={e => setAcceptItemModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={Math.abs(parseFloat(acceptItemModal.acceptedQty || 0) - parseFloat(acceptItemModal.item.requested_qty || 0)) > 0.0001 ? "Please specify why the accepted quantity was changed..." : "Optional remarks for kitchen..."}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12.5,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setAcceptItemModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAcceptItem}
                disabled={acceptItemModal.saving || (Math.abs(parseFloat(acceptItemModal.acceptedQty || 0) - parseFloat(acceptItemModal.item.requested_qty || 0)) > 0.0001 && !acceptItemModal.reason.trim())}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: (Math.abs(parseFloat(acceptItemModal.acceptedQty || 0) - parseFloat(acceptItemModal.item.requested_qty || 0)) > 0.0001 && !acceptItemModal.reason.trim()) ? '#94a3b8' : '#16a34a',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: (Math.abs(parseFloat(acceptItemModal.acceptedQty || 0) - parseFloat(acceptItemModal.item.requested_qty || 0)) > 0.0001 && !acceptItemModal.reason.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={15} />
                {acceptItemModal.saving ? 'Accepting...' : 'Confirm & Accept Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: REJECT TRANSFER ITEM (Mandatory Rejection Reason)
      ───────────────────────────────────────────────────────────── */}
      {rejectItemModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setRejectItemModal(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 480,
              width: '95%',
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            {/* Modal Header */}
            <div style={{ background: '#fef2f2', padding: '16px 20px', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                  <XCircle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>Reject Transfer Item</h3>
                  <div style={{ fontSize: 11.5, color: '#b91c1c' }}>Transfer #{rejectItemModal.transferId}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectItemModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 20 }}>
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{rejectItemModal.item.dish_name}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Requested Quantity: <strong>{rejectItemModal.item.requested_qty} {rejectItemModal.item.uom || 'Pices'}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                  Rejection Reason * (Mandatory):
                </label>
                <textarea
                  rows={3}
                  value={rejectItemModal.reason}
                  onChange={e => setRejectItemModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Dish out of stock / raw ingredients unavailable / kitchen cannot prepare at this time..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #fca5a5',
                    fontSize: 12.5,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setRejectItemModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectItem}
                disabled={rejectItemModal.saving || !rejectItemModal.reason.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: !rejectItemModal.reason.trim() ? '#94a3b8' : '#dc2626',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: !rejectItemModal.reason.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <XCircle size={15} />
                {rejectItemModal.saving ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ACCEPT ALL WITH MODIFICATIONS (Mandatory Reason)
      ───────────────────────────────────────────────────────────── */}
      {acceptAllConfirmModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setAcceptAllConfirmModal(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 540,
              width: '95%',
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div style={{ background: '#f0fdf4', padding: '16px 20px', borderBottom: '1px solid #dcfce7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#166534' }}>Accept All Items (Modifications Detected)</h3>
                  <div style={{ fontSize: 11.5, color: '#15803d' }}>Transfer #{acceptAllConfirmModal.transfer.transfer_id}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAcceptAllConfirmModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#475569' }}>
                The following items have modified quantities from the original request. A reason is mandatory:
              </p>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b' }}>Dish Name</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>Original Qty</th>
                      <th style={{ padding: '6px 10px', textAlign: 'right', color: '#16a34a' }}>Accepted Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptAllConfirmModal.modifiedItems.map(it => (
                      <tr key={`mod-summary-${it.id}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>{it.dish_name}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>{it.requested_qty} {it.uom}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>{it.customQty} {it.uom}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Reason for Quantity Adjustments * (Mandatory):
                </label>
                <textarea
                  rows={3}
                  value={acceptAllConfirmModal.reason}
                  onChange={e => setAcceptAllConfirmModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Partial dough batch available / supplying remaining from central batch later..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 12.5,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setAcceptAllConfirmModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAcceptAllWithModifications}
                disabled={acceptAllConfirmModal.saving || !acceptAllConfirmModal.reason.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: !acceptAllConfirmModal.reason.trim() ? '#94a3b8' : '#16a34a',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: !acceptAllConfirmModal.reason.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <CheckCircle2 size={15} />
                {acceptAllConfirmModal.saving ? 'Accepting...' : 'Confirm & Accept All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: REJECT ALL PENDING ITEMS (Mandatory Rejection Reason)
      ───────────────────────────────────────────────────────────── */}
      {rejectAllModal && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setRejectAllModal(null); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 480,
              width: '95%',
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div style={{ background: '#fef2f2', padding: '16px 20px', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                  <XCircle size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>Reject All Pending Items</h3>
                  <div style={{ fontSize: 11.5, color: '#b91c1c' }}>Transfer #{rejectAllModal.transfer.transfer_id}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectAllModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#475569' }}>
                Are you sure you want to reject all pending items for this transfer? A mandatory reason is required:
              </p>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                  Rejection Reason * (Mandatory):
                </label>
                <textarea
                  rows={3}
                  value={rejectAllModal.reason}
                  onChange={e => setRejectAllModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g., Supplying branch currently out of capacity / raw materials unavailable..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #fca5a5',
                    fontSize: 12.5,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setRejectAllModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRejectAll}
                disabled={rejectAllModal.saving || !rejectAllModal.reason.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: !rejectAllModal.reason.trim() ? '#94a3b8' : '#dc2626',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: !rejectAllModal.reason.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <XCircle size={15} />
                {rejectAllModal.saving ? 'Rejecting...' : 'Confirm Reject All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CLEAR ALL ACTIVE TRANSFERS (Admin / Developer)
      ───────────────────────────────────────────────────────────── */}
      {clearAllModalOpen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(3px)' }}
          onClick={e => { if (e.target.classList.contains('modal-overlay')) setClearAllModalOpen(false); }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 500,
              width: '95%',
              background: '#fff',
              borderRadius: 12,
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
          >
            <div style={{ background: '#fef2f2', padding: '16px 20px', borderBottom: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#991b1b' }}>Clear All Active Transfers</h3>
                  <div style={{ fontSize: 11.5, color: '#b91c1c' }}>Administrative Action Across All Branches</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClearAllModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: '#92400e' }}>
                <strong>Critical Safety Notice:</strong> This action will cancel all active, pending, or in-progress transfer requests across branches. <strong>Transfer Logs, completed transfer records, and inventory history are completely preserved.</strong>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                  Reason for Clearing Active Transfers * (Mandatory):
                </label>
                <textarea
                  rows={3}
                  value={clearAllReason}
                  onChange={e => setClearAllReason(e.target.value)}
                  placeholder="e.g., End-of-day kitchen clean reset / routine operational flush..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #fca5a5',
                    fontSize: 12.5,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setClearAllModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                disabled={clearingAll || !clearAllReason.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  background: !clearAllReason.trim() ? '#94a3b8' : '#dc2626',
                  color: '#fff',
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: !clearAllReason.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Trash2 size={15} />
                {clearingAll ? 'Clearing...' : 'Confirm Clear All Active'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ACCEPT AND DONE – BATCH ITEM-LEVEL DECISION MODAL
      ───────────────────────────────────────────────────────────── */}
      {acceptAndDoneModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16
          }}
          onClick={e => {
            if (e.target.classList.contains('modal-overlay') && !acceptAndDoneModal.saving) {
              setAcceptAndDoneModal(null);
            }
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: 940,
              width: '100%',
              maxHeight: '90vh',
              background: '#fff',
              borderRadius: 14,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
              padding: '16px 22px',
              color: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <CheckCheck size={20} color="#fff" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#fff' }}>
                    Accept and Done – Transfer #{acceptAndDoneModal.transfer.transfer_id}
                  </h3>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    From: <strong>{acceptAndDoneModal.transfer.from_branch}</strong> → To: <strong>{acceptAndDoneModal.transfer.to_branch}</strong> · Day: <strong>{acceptAndDoneModal.transfer.delivery_day || 'Today'}</strong> · {acceptAndDoneModal.items.length} Dishes
                  </div>
                </div>
              </div>
              <button
                type="button"
                disabled={acceptAndDoneModal.saving}
                onClick={() => setAcceptAndDoneModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', opacity: 0.8 }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Instructions & Quick Action Toolbar */}
            <div style={{
              padding: '12px 22px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              flexShrink: 0
            }}>
              <div style={{ fontSize: 12.5, color: '#475569' }}>
                Select an independent action for every item. Only items with <strong>Accept</strong> or <strong>Reject</strong> will be processed when you click <strong>Save Changes</strong>.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setAcceptAndDoneModal(prev => ({
                      ...prev,
                      items: prev.items.map(it => ({
                        ...it,
                        action: it.current_status === 'Accepted' ? 'Accept' : (it.current_status === 'Rejected' ? 'Reject' : 'Accept')
                      }))
                    }));
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    background: '#dcfce7',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  ✓ Set All Pending to Accept
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAcceptAndDoneModal(prev => ({
                      ...prev,
                      items: prev.items.map(it => ({
                        ...it,
                        action: it.current_status === 'Accepted' ? 'Accept' : (it.current_status === 'Rejected' ? 'Reject' : 'Pending')
                      }))
                    }));
                  }}
                  style={{
                    padding: '4px 10px',
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Scrollable Items Table */}
            <div style={{ padding: '16px 22px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: 36, color: '#64748b' }}>#</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Dish Name</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: 60, color: '#475569', fontWeight: 700 }}>Unit</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', width: 80, color: '#475569', fontWeight: 700 }}>Requested</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', width: 230, color: '#475569', fontWeight: 700 }}>Action</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Accepted Qty & Reason</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', width: 150, color: '#475569', fontWeight: 700 }}>Final Status</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptAndDoneModal.items.map((it, idx) => {
                    const isAccepted = it.action === 'Accept';
                    const isRejected = it.action === 'Reject';
                    const isPending = it.action === 'Pending';
                    const isQtyMod = isAccepted && Math.abs(parseFloat(it.accepted_qty || 0) - it.requested_qty) > 0.0001;

                    return (
                      <tr
                        key={`done-item-${it.id}`}
                        style={{
                          borderBottom: '1px solid #e2e8f0',
                          background: isRejected ? '#fef2f2' : (isAccepted ? '#f0fdf4' : (idx % 2 === 0 ? '#fff' : '#f8fafc'))
                        }}
                      >
                        <td style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.dish_name}</div>
                          {it.sku && <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'monospace' }}>SKU: {it.sku}</div>}
                          {it.current_status !== 'Pending' && (
                            <div style={{ fontSize: 10, color: it.current_status === 'Accepted' ? '#166534' : '#991b1b', marginTop: 2 }}>
                              Current status: <strong>{it.current_status}</strong>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                          {it.uom}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                          {it.requested_qty}
                        </td>

                        {/* Action Selector: 3 Toggle Pills */}
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: 8, padding: 2, gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setAcceptAndDoneModal(prev => ({
                                  ...prev,
                                  items: prev.items.map(x => x.id === it.id ? { ...x, action: 'Accept' } : x)
                                }));
                              }}
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                background: isAccepted ? '#16a34a' : 'transparent',
                                color: isAccepted ? '#fff' : '#475569',
                                boxShadow: isAccepted ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              ✓ Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAcceptAndDoneModal(prev => ({
                                  ...prev,
                                  items: prev.items.map(x => x.id === it.id ? { ...x, action: 'Reject' } : x)
                                }));
                              }}
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                background: isRejected ? '#dc2626' : 'transparent',
                                color: isRejected ? '#fff' : '#475569',
                                boxShadow: isRejected ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              ✕ Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAcceptAndDoneModal(prev => ({
                                  ...prev,
                                  items: prev.items.map(x => x.id === it.id ? { ...x, action: 'Pending' } : x)
                                }));
                              }}
                              style={{
                                padding: '4px 10px',
                                fontSize: 11.5,
                                fontWeight: 700,
                                borderRadius: 6,
                                border: 'none',
                                cursor: 'pointer',
                                background: isPending ? '#f59e0b' : 'transparent',
                                color: isPending ? '#fff' : '#475569',
                                boxShadow: isPending ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                              }}
                            >
                              ⏳ Pending
                            </button>
                          </div>
                        </td>

                        {/* Quantity & Reason Details */}
                        <td style={{ padding: '10px 12px' }}>
                          {isAccepted && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11.5, color: '#64748b' }}>Qty:</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={it.accepted_qty}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setAcceptAndDoneModal(prev => ({
                                      ...prev,
                                      items: prev.items.map(x => x.id === it.id ? { ...x, accepted_qty: val } : x)
                                    }));
                                  }}
                                  style={{
                                    width: 75,
                                    padding: '4px 6px',
                                    textAlign: 'right',
                                    borderRadius: 5,
                                    border: isQtyMod ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                                    fontSize: 12,
                                    fontWeight: 700
                                  }}
                                />
                                <span style={{ fontSize: 11.5, color: '#64748b' }}>{it.uom}</span>
                                {isQtyMod && (
                                  <span style={{ fontSize: 10.5, color: '#2563eb', fontWeight: 700, background: '#eff6ff', padding: '2px 6px', borderRadius: 4, border: '1px solid #bfdbfe' }}>
                                    Orig: {it.requested_qty} → Mod: {it.accepted_qty}
                                  </span>
                                )}
                              </div>
                              {isQtyMod && (
                                <input
                                  type="text"
                                  placeholder="Reason for modifying quantity * (Mandatory)"
                                  value={it.modification_reason}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setAcceptAndDoneModal(prev => ({
                                      ...prev,
                                      items: prev.items.map(x => x.id === it.id ? { ...x, modification_reason: val } : x)
                                    }));
                                  }}
                                  style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    borderRadius: 5,
                                    border: !it.modification_reason.trim() ? '1.5px solid #dc2626' : '1px solid #2563eb',
                                    fontSize: 11.5
                                  }}
                                />
                              )}
                            </div>
                          )}

                          {isRejected && (
                            <input
                              type="text"
                              placeholder="Reason for rejecting this item * (Mandatory)"
                              value={it.rejection_reason}
                              onChange={e => {
                                const val = e.target.value;
                                setAcceptAndDoneModal(prev => ({
                                  ...prev,
                                  items: prev.items.map(x => x.id === it.id ? { ...x, rejection_reason: val } : x)
                                }));
                              }}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                borderRadius: 5,
                                border: !it.rejection_reason.trim() ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                                fontSize: 11.5
                              }}
                            />
                          )}

                          {isPending && (
                            <span style={{ fontSize: 11.5, color: '#94a3b8', fontStyle: 'italic' }}>
                              No action will be applied to this item (remains Pending).
                            </span>
                          )}
                        </td>

                        {/* Result Status Live Badge */}
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          {isAccepted && (
                            <span style={{
                              background: '#dcfce7',
                              color: '#166534',
                              fontWeight: 700,
                              padding: '4px 9px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              border: '1px solid #bbf7d0',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <CheckCircle2 size={12} /> Acc ({it.accepted_qty} {it.uom})
                            </span>
                          )}
                          {isRejected && (
                            <span style={{
                              background: '#fee2e2',
                              color: '#991b1b',
                              fontWeight: 700,
                              padding: '4px 9px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              border: '1px solid #fca5a5',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <XCircle size={12} /> Rej
                            </span>
                          )}
                          {isPending && (
                            <span style={{
                              background: '#fef3c7',
                              color: '#92400e',
                              fontWeight: 700,
                              padding: '4px 9px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              border: '1px solid #fde68a',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              ⏳ Pen
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 22px',
              background: '#f8fafc',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              flexShrink: 0
            }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
                Decisions Summary: <strong style={{ color: '#16a34a' }}>{acceptAndDoneModal.items.filter(x => x.action === 'Accept').length} to Accept</strong>, <strong style={{ color: '#dc2626' }}>{acceptAndDoneModal.items.filter(x => x.action === 'Reject').length} to Reject</strong>, <strong style={{ color: '#d97706' }}>{acceptAndDoneModal.items.filter(x => x.action === 'Pending').length} Pending</strong>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  disabled={acceptAndDoneModal.saving}
                  onClick={() => setAcceptAndDoneModal(null)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={acceptAndDoneModal.saving}
                  onClick={handleSaveAcceptAndDoneModal}
                  style={{
                    padding: '8px 22px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#16a34a',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    cursor: acceptAndDoneModal.saving ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)'
                  }}
                >
                  {acceptAndDoneModal.saving ? (
                    <>Saving Changes...</>
                  ) : (
                    <><Save size={15} /> Save Changes</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

