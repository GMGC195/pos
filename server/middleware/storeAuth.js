const pool = require('../db');

const CANONICAL_BRANCHES = ['Branch 1', 'Branch 2', 'Branch 3'];

/**
 * Normalize any branch label (e.g. 'B1', 'Restaurant 1', 'Branch 1') to canonical 'Branch 1' | 'Branch 2' | 'Branch 3'
 */
function normalizeBranch(raw) {
  if (!raw || raw === 'All') return raw || 'All';
  const str = String(raw).trim();
  if (/^(branch\s*1|restaurant\s*1|b1|1)$/i.test(str)) return 'Branch 1';
  if (/^(branch\s*2|restaurant\s*2|b2|2)$/i.test(str)) return 'Branch 2';
  if (/^(branch\s*3|restaurant\s*3|b3|3)$/i.test(str)) return 'Branch 3';
  return str;
}

/**
 * Return normalized role string in lowercase
 */
function getRole(req) {
  return (req.user?.role || '').trim().toLowerCase();
}

function isFullAccessRole(role) {
  return role === 'developer' || role === 'admin';
}

function isReadOnlyManagementRole(role) {
  return role === 'management' || role === 'management store';
}

function isOperationalStoreRole(role) {
  return role === 'store man' || role === 'data entry';
}

/**
 * Resolve the list of branches a user is allowed to access in Store Management.
 * Returns null if unrestricted (Admin, Developer, Management, Management Store).
 * Returns string[] for Store Man (1 branch) and Data Entry (1..3 branches).
 */
function getUserAllowedBranches(user) {
  const role = (user?.role || '').trim().toLowerCase();
  if (isFullAccessRole(role) || isReadOnlyManagementRole(role)) {
    return null; // Unrestricted across all branches
  }

  if (role === 'store man') {
    const single = normalizeBranch(user?.branch);
    if (CANONICAL_BRANCHES.includes(single)) return [single];
    if (Array.isArray(user?.assigned_branches) && user.assigned_branches.length > 0) {
      const norm = normalizeBranch(user.assigned_branches[0]);
      if (CANONICAL_BRANCHES.includes(norm)) return [norm];
    }
    return [];
  }

  if (role === 'data entry') {
    const rawList = Array.isArray(user?.assigned_branches) && user.assigned_branches.length > 0
      ? user.assigned_branches
      : (typeof user?.branch === 'string' && user.branch.trim() && user.branch !== 'All'
          ? user.branch.split(',').map(s => s.trim())
          : []);
    const normalized = rawList.map(normalizeBranch).filter(b => CANONICAL_BRANCHES.includes(b));
    return Array.from(new Set(normalized));
  }

  // Fallback for any legacy branch-locked user
  if (user?.branch && user.branch !== 'All') {
    const b = normalizeBranch(user.branch);
    return CANONICAL_BRANCHES.includes(b) ? [b] : [user.branch];
  }
  return null;
}

/**
 * Middleware: require one of the allowed roles (Developer always passes).
 */
function requireStoreRoles(allowedRoles = []) {
  const allowedLower = allowedRoles.map(r => r.toLowerCase());
  return (req, res, next) => {
    const role = getRole(req);
    if (role === 'developer' || allowedLower.includes(role)) {
      return next();
    }
    return res.status(403).json({
      error: 'Access denied: your role does not have permission for this Store Management action'
    });
  };
}

/**
 * Validate that the requested branch / store_id is within the user's allowed branches.
 * Attaches `req.allowedBranches` (null if unrestricted, or string[]) and `req.resolvedStoreBranch` if store_id was checked.
 */
async function enforceBranchAccess(req, res, { branch, store_id } = {}) {
  const allowed = getUserAllowedBranches(req.user);
  req.allowedBranches = allowed;

  if (allowed === null) {
    return { ok: true, allowedBranches: null };
  }

  if (allowed.length === 0) {
    res.status(403).json({ error: 'Access denied: no branch is assigned to your account' });
    return { ok: false };
  }

  if (branch && branch !== 'All') {
    const normBranch = normalizeBranch(branch);
    if (!allowed.includes(normBranch)) {
      res.status(403).json({ error: `Access denied: you do not have access to ${normBranch}` });
      return { ok: false };
    }
  }

  if (store_id && store_id !== 'All' && store_id !== 'undefined') {
    const parsedId = parseInt(store_id, 10);
    if (!isNaN(parsedId)) {
      const locRes = await pool.query('SELECT id, branch, name FROM store_locations WHERE id = $1', [parsedId]);
      if (locRes.rows.length === 0) {
        res.status(404).json({ error: 'Store location not found' });
        return { ok: false };
      }
      const locBranch = normalizeBranch(locRes.rows[0].branch);
      if (!allowed.includes(locBranch)) {
        res.status(403).json({ error: `Access denied: store '${locRes.rows[0].name}' belongs to ${locBranch}, which is outside your assigned branches` });
        return { ok: false };
      }
      req.resolvedStore = locRes.rows[0];
    }
  }

  return { ok: true, allowedBranches: allowed };
}

/**
 * Get today and yesterday YYYY-MM-DD in Asia/Riyadh timezone.
 */
function getSaudiTodayAndYesterday() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const today = fmt.format(now);
  const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterday = fmt.format(yesterdayDate);
  return { today, yesterday };
}

/**
 * Check if an entry_date (string YYYY-MM-DD or Date) is today or yesterday (Saudi time).
 */
function isTodayOrYesterday(entryDate) {
  if (!entryDate) return false;
  const dateStr = entryDate instanceof Date
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(entryDate)
    : String(entryDate).slice(0, 10);
  const { today, yesterday } = getSaudiTodayAndYesterday();
  return dateStr === today || dateStr === yesterday;
}

async function resolveBranchStoreId(db, branch) {
  const norm = normalizeBranch(branch);
  if (!CANONICAL_BRANCHES.includes(norm)) return null;
  const res = await db.query(
    `SELECT id FROM store_locations WHERE branch = $1 ORDER BY is_active DESC, id ASC LIMIT 1`,
    [norm]
  );
  if (res.rows.length > 0) return res.rows[0].id;
  const code = `BR-${norm.replace(/\s+/g, '').toUpperCase()}`;
  const ins = await db.query(
    `INSERT INTO store_locations (name, branch, code, store_type, is_active)
     VALUES ($1, $1, $2, 'Branch Store', true)
     ON CONFLICT (code) DO UPDATE SET branch = EXCLUDED.branch
     RETURNING id`,
    [norm, code]
  );
  return ins.rows[0].id;
}

module.exports = {
  CANONICAL_BRANCHES,
  normalizeBranch,
  resolveBranchStoreId,
  getRole,
  isFullAccessRole,
  isReadOnlyManagementRole,
  isOperationalStoreRole,
  getUserAllowedBranches,
  requireStoreRoles,
  enforceBranchAccess,
  getSaudiTodayAndYesterday,
  isTodayOrYesterday
};
