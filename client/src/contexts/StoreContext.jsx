import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../api';
import { useAuth } from './AuthContext';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(() => localStorage.getItem('store_selected_branch') || 'All');
  const [locations, setLocations] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState(() => localStorage.getItem('store_selected_store_id') || '');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const userBranch = user?.branch || 'All';
  const role = (user?.role || '').toLowerCase();
  const isBranchLocked = userBranch !== 'All' && role !== 'developer' && role !== 'admin';

  // Fetch branches dynamically
  const fetchBranches = useCallback(async () => {
    try {
      const res = await axios.get('/api/store/locations/branches');
      const bList = res.data || [];
      setBranches(bList);
      if (isBranchLocked) {
        setSelectedBranch(userBranch);
      } else if (bList.length > 0 && selectedBranch === 'All' && !localStorage.getItem('store_selected_branch')) {
        setSelectedBranch(bList[0]);
      }
    } catch (err) {
      console.error('Error fetching branches in StoreContext:', err);
    }
  }, [isBranchLocked, userBranch, selectedBranch]);

  // Fetch store locations
  const fetchLocations = useCallback(async () => {
    setLoadingLocations(true);
    try {
      const params = {};
      if (selectedBranch && selectedBranch !== 'All') {
        params.branch = selectedBranch;
      }
      const res = await axios.get('/api/store/locations/locations', { params });
      const locs = res.data || [];
      setLocations(locs);

      if (locs.length > 0) {
        if (selectedStoreId === 'All') {
          // Keep 'All' if selected
        } else {
          const match = locs.find(l => String(l.id) === String(selectedStoreId));
          if (!match) {
            setSelectedStoreId('All');
            localStorage.setItem('store_selected_store_id', 'All');
          }
        }
      } else {
        setSelectedStoreId('All');
        localStorage.setItem('store_selected_store_id', 'All');
      }
    } catch (err) {
      console.error('Error fetching locations in StoreContext:', err);
    } finally {
      setLoadingLocations(false);
    }
  }, [selectedBranch, selectedStoreId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    fetchLocations();
  }, [selectedBranch, refreshTrigger]);

  const handleSetSelectedBranch = (b) => {
    setSelectedBranch(b);
    localStorage.setItem('store_selected_branch', b);
  };

  const handleSetSelectedStoreId = (id) => {
    setSelectedStoreId(id);
    localStorage.setItem('store_selected_store_id', String(id));
  };

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const selectedStore = locations.find(l => String(l.id) === String(selectedStoreId)) || 
    (selectedStoreId === 'All' ? { id: 'All', name: 'All Stores' } : null);

  return (
    <StoreContext.Provider value={{
      branches,
      selectedBranch,
      setSelectedBranch: handleSetSelectedBranch,
      locations,
      selectedStoreId,
      setSelectedStoreId: handleSetSelectedStoreId,
      selectedStore,
      loadingLocations,
      refreshLocations: triggerRefresh,
      isBranchLocked
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) {
    return {
      branches: [],
      selectedBranch: 'All',
      setSelectedBranch: () => {},
      locations: [],
      selectedStoreId: '',
      setSelectedStoreId: () => {},
      selectedStore: null,
      loadingLocations: false,
      refreshLocations: () => {},
      isBranchLocked: false
    };
  }
  return context;
}
