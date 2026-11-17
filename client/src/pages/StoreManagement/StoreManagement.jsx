import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import './storeManagement.css';
import { 
  LayoutDashboard, 
  ClipboardCheck, 
  History, 
  ShoppingBag, 
  Truck, 
  Package, 
  GitPullRequest, 
  BarChart3, 
  TrendingUp, 
  Settings, 
  RefreshCw
} from 'lucide-react';

// Sub-components
import StoreDashboard from './StoreDashboard';
import StockEntry from './StockEntry';
import StockHistory from './StockHistory';
import PurchaseManagement from './PurchaseManagement';
import VendorManagement from './VendorManagement';
import InventoryItems from './InventoryItems';
import ItemRequests from './ItemRequests';
import ConsumptionReports from './ConsumptionReports';
import PriceComparison from './PriceComparison';
import StoreSettings from './StoreSettings';

export default function StoreManagement({ user: propUser }) {
  const { user: authUser } = useAuth();
  const user = propUser || authUser;

  // Store context for branch and location
  const {
    selectedBranch,
    selectedStoreId,
    selectedStore,
    locations,
    refreshLocations
  } = useStore();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Tab definitions
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'entry', label: 'Stock Entry', icon: ClipboardCheck },
    { id: 'history', label: 'Stock History', icon: History },
    { id: 'purchases', label: 'Purchases', icon: ShoppingBag },
    { id: 'vendors', label: 'Suppliers', icon: Truck },
    { id: 'items', label: 'Store Items', icon: Package },
    { id: 'requests', label: 'Requisitions', icon: GitPullRequest },
    { id: 'reports', label: 'Consumption', icon: BarChart3 },
    { id: 'price-comparison', label: 'Price Trends', icon: TrendingUp },
    { id: 'settings', label: 'Store Settings', icon: Settings }
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (typeof refreshLocations === 'function') {
        refreshLocations();
      }
      setDataRefreshKey(prev => prev + 1);
      toast.success('Store data refreshed');
    } catch (err) {
      console.error('Failed to refresh store data:', err);
      toast.error('Failed to refresh data');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 32 }}>
      {/* Navigation Tabs Bar in clean horizontal row with Refresh button at far right */}
      <div 
        className="card store-nav-tabs-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '6px 12px',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}
      >
        {/* Scrollable Tab Buttons */}
        <div 
          className="store-tabs-container"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            overflowX: 'auto',
            padding: '2px 0',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease-in-out',
                  whiteSpace: 'nowrap',
                  background: isActive ? 'var(--primary)' : 'transparent',
                  color: isActive ? '#000000' : 'var(--text-muted)'
                }}
                onMouseOver={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--surface-2)';
                    e.currentTarget.style.color = 'var(--text)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Far Right Refresh Button (Icon Only) */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Store Data"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              padding: 0,
              borderRadius: 8,
              border: '1px solid var(--border)',
              cursor: isRefreshing ? 'wait' : 'pointer',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              transition: 'all 0.15s ease-in-out',
              flexShrink: 0
            }}
            onMouseOver={(e) => {
              if (!isRefreshing) e.currentTarget.style.background = 'var(--surface-3, rgba(255,255,255,0.08))';
            }}
            onMouseOut={(e) => {
              if (!isRefreshing) e.currentTarget.style.background = 'var(--surface-2)';
            }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Tab View Rendering */}
      <div>
        {activeTab === 'dashboard' && (
          <StoreDashboard
            key={`dashboard-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            selectedStore={selectedStore}
            locations={locations}
            onNavigateTab={setActiveTab}
            onRefresh={handleRefresh}
          />
        )}

        {activeTab === 'entry' && (
          <StockEntry
            key={`entry-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            locations={locations}
            user={user}
            onEntrySubmitted={() => {
              setDataRefreshKey(prev => prev + 1);
            }}
          />
        )}

        {activeTab === 'history' && (
          <StockHistory
            key={`history-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            locations={locations}
            user={user}
          />
        )}

        {activeTab === 'purchases' && (
          <PurchaseManagement
            key={`purchases-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            locations={locations}
            user={user}
          />
        )}

        {activeTab === 'vendors' && (
          <VendorManagement
            key={`vendors-${dataRefreshKey}`}
            user={user}
          />
        )}

        {activeTab === 'items' && (
          <InventoryItems
            key={`items-${dataRefreshKey}`}
            user={user}
          />
        )}

        {activeTab === 'requests' && (
          <ItemRequests
            key={`requests-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            locations={locations}
            user={user}
          />
        )}

        {activeTab === 'reports' && (
          <ConsumptionReports
            key={`reports-${selectedStoreId}-${dataRefreshKey}`}
            selectedBranch={selectedBranch}
            selectedStoreId={selectedStoreId}
            locations={locations}
          />
        )}

        {activeTab === 'price-comparison' && (
          <PriceComparison 
            key={`price-${dataRefreshKey}`}
          />
        )}

        {activeTab === 'settings' && (
          <StoreSettings
            key={`settings-${dataRefreshKey}`}
            user={user}
            onLocationsChanged={refreshLocations}
          />
        )}
      </div>
    </div>
  );
}
