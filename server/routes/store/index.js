const express = require('express');
const router = express.Router();
const { ensureStoreManagementSchema } = require('./schema');
const { authenticateToken, blockSalaryPayOperator } = require('../../middleware/auth');
const { requireStoreRoles } = require('../../middleware/storeAuth');

const ALL_STORE_ROLES = ['developer', 'admin', 'management', 'management store', 'store man', 'data entry'];

// Block Salary Pay Operator from Store Management
router.use(blockSalaryPayOperator);

// Require authenticated user with a valid Store Management role
router.use(authenticateToken, requireStoreRoles(ALL_STORE_ROLES));

// Auto-verify and ensure independent schema tables exist
ensureStoreManagementSchema();
router.use(async (req, res, next) => {
  await ensureStoreManagementSchema();
  next();
});

// Mount Sub-routers
router.use('/dashboard', require('./dashboard'));
router.use('/locations', require('./locations'));
router.use('/items', require('./items'));
router.use('/inventory', require('./inventory'));
router.use('/entries', require('./stockEntries'));
router.use('/purchases', require('./purchases'));
router.use('/vendors', require('./vendors'));
router.use('/requests', require('./requests'));
router.use('/reports', require('./reports'));

module.exports = router;
