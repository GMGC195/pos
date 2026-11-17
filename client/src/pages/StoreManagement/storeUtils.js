/**
 * Utility functions and formatting helpers for Store Management module
 */

/**
 * Standardize branch display labels to All, B1, B2, B3.
 * Maps 'Restaurant 1' -> 'B1', 'Restaurant 3' -> 'B3', etc.
 */
export const CANONICAL_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

export function formatBranchLabel(b) {
  if (!b || b === 'All') return 'All';
  const str = String(b).trim();
  if (/branch\s*1\b/i.test(str) || /restaurant\s*1\b/i.test(str) || str === '1' || str === 'B1') return 'B1';
  if (/branch\s*2\b/i.test(str) || /restaurant\s*2\b/i.test(str) || str === '2' || str === 'B2') return 'B2';
  if (/branch\s*3\b/i.test(str) || /restaurant\s*3\b/i.test(str) || str === '3' || str === 'B3') return 'B3';
  return str.replace(/branch\s*/i, 'B');
}

export function mapToCanonicalBranch(b) {
  if (!b || b === 'All') return 'All';
  const str = String(b).trim();
  if (/branch\s*1\b/i.test(str) || /restaurant\s*1\b/i.test(str) || str === '1' || str === 'B1') return 'Branch 1';
  if (/branch\s*2\b/i.test(str) || /restaurant\s*2\b/i.test(str) || str === '2' || str === 'B2') return 'Branch 2';
  if (/branch\s*3\b/i.test(str) || /restaurant\s*3\b/i.test(str) || str === '3' || str === 'B3') return 'Branch 3';
  return b;
}

/**
 * Common standard shift options
 */
export const SHIFT_OPTIONS = [
  { id: 'All', label: 'All Shifts' },
  { id: 'Day', label: '☀️ Day' },
  { id: 'Night', label: '🌙 Night' }
];
