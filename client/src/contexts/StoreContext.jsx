import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../api';
import { useAuth } from './AuthContext';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState(['Branch 1', 'Branch 2', 'Branch 3']);
  const [selectedBranch, setSelectedBranch] = useState(() => localStorage.getItem('store_selected_branch') || 'All');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const userBranch = user?.branch || 'All';
  const role = (user?.role || '').trim().toLowerCase();
  const isUnrestrictedRole = ['developer', 'admin', 'management', 'management store'].includes(role);
  const allowedBranches = (() => {
    if (isUnrestrictedRole) return null;
    if (role === 'store man') {
      return user?.branch ? [user.branch] : (Array.isArray(user?.assigned_branches) ? user.assigned_branches.slice(0, 1) : []);
    }
    if (role === 'data entry') {
      if (Array.isArray(user?.assigned_branches) && user.assigned_branches.length > 0) return user.assigned_branches;
      if (user?.branch && user.branch !== 'All') return user.branch.split(',').map(s => s.trim()).filter(Boolean);
      return [];
    }
    return userBranch !== 'All' ? [userBranch] : null;
  })();
  const isBranchLocked = allowedBranches !== null && allowedBranches.length <= 1;

  const fetchBranches = useCallback(async () => {
    try {
      const res = await axios.get('/api/store/locations/branches');
      const bList = res.data || ['Branch 1', 'Branch 2', 'Branch 3'];
      setBranches(bList);
      if (allowedBranches && allowedBranches.length > 0) {
        if (!allowedBranches.includes(selectedBranch)) {
          setSelectedBranch(allowedBranches[0]);
          localStorage.setItem('store_selected_branch', allowedBranches[0]);
        }
      } else if (bList.length > 0 && selectedBranch === 'All' && !localStorage.getItem('store_selected_branch')) {
        setSelectedBranch(bList[0]);
      }
    } catch (err) {
      console.error('Error fetching branches in StoreContext:', err);
    }
  }, [isBranchLocked, userBranch, selectedBranch, role]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches, refreshTrigger]);

  const handleSetSelectedBranch = (b) => {
    setSelectedBranch(b);
    localStorage.setItem('store_selected_branch', b);
  };

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <StoreContext.Provider value={{
      branches,
      selectedBranch,
      setSelectedBranch: handleSetSelectedBranch,
      refreshLocations: triggerRefresh,
      isBranchLocked,
      allowedBranches
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    return {
      branches: ['Branch 1', 'Branch 2', 'Branch 3'],
      selectedBranch: 'All',
      setSelectedBranch: () => {},
      refreshLocations: () => {},
      isBranchLocked: false,
      allowedBranches: null
    };
  }
  return context;
}
