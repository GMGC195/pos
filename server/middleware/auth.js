const jwt = require('jsonwebtoken');

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const isAdmin = (req, res, next) => {
  const role = req.user?.role?.trim().toLowerCase();
  if (role === 'admin' || role === 'developer') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
};

const isAdminOrManagement = (req, res, next) => {
  const role = req.user?.role?.trim().toLowerCase();
  if (role === 'admin' || role === 'developer' || role === 'management') {
    next();
  } else {
    res.status(403).json({ error: 'Admin or Management access required' });
  }
};

const isAdminOrCashier = (req, res, next) => {
  const role = req.user?.role?.trim().toLowerCase();
  if (role === 'admin' || role === 'developer' || role === 'cashier') {
    next();
  } else {
    res.status(403).json({ error: 'Admin or Cashier access required' });
  }
};

const blockSalaryPayOperator = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (decoded?.role?.trim().toLowerCase() === 'salary pay operator') {
        return res.status(403).json({ error: 'Access denied: Salary Pay Operator cannot access this module' });
      }
    } catch (e) {}
  }
  if (req.user?.role?.trim().toLowerCase() === 'salary pay operator') {
    return res.status(403).json({ error: 'Access denied: Salary Pay Operator cannot access this module' });
  }
  next();
};

module.exports = { authenticateToken, isAdmin, isAdminOrManagement, isAdminOrCashier, blockSalaryPayOperator };
