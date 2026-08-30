const fs = require('fs');
const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Update `expandedSections` initial state to be false on mobile
const oldExpanded = `  const [expandedSections, setExpandedSections] = useState({
    'Dine-In': true,
    'Takeaway': true,
    'Delivery': true
  })`;

const newExpanded = `  const [expandedSections, setExpandedSections] = useState({
    'Dine-In': window.innerWidth > 900,
    'Takeaway': window.innerWidth > 900,
    'Delivery': window.innerWidth > 900
  })
  
  // Track mobile view state for the sliding panel: 'none', 'cart', 'orders'
  const [mobilePane, setMobilePane] = useState('none')`;

if (posContent.includes(oldExpanded)) {
  posContent = posContent.replace(oldExpanded, newExpanded);
}

// 2. Add Mobile header row (Dropdown + Search + Dots)
// First, find the exact strings to replace.
const oldCategoryHeader = `          {/* Category Tabs */}
          <div className="category-tabs">
            <button
              className={\`cat-tab\${activeCategory === 'All' ? ' active' : ''}\`}
              onClick={() => setActiveCategory('All')}
            >All</button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={\`cat-tab\${activeCategory === cat.name ? ' active' : ''}\`}
                onClick={() => setActiveCategory(cat.name)}
              >{cat.name}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex' }}>
              <button
                className="cat-tab"
                onClick={() => setShowAddCategory(true)}
                style={{ color: 'var(--red)', background: 'rgba(239, 68, 68, 0.05)', fontWeight: 'bold' }}
              >+ New Type</button>
              <button
                className="cat-tab"
                onClick={() => setShowManageCategories(true)}
                style={{ color: 'var(--text-primary)', padding: '10px 12px', display: 'flex', alignItems: 'center' }}
                title="Manage Categories"
              ><MoreVertical size={16} /></button>
            </div>
          </div>

          {/* Search */}
          <div className="pos-search">
            <Search className="si" size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search menu items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>`;

const newMobileHeader = `          {/* POS Compact Header (Dropdown + Search + Dots) */}
          <div className="pos-mobile-header">
            <select 
              className="pos-mobile-dropdown" 
              value={activeCategory} 
              onChange={(e) => setActiveCategory(e.target.value)}
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
            
            <div className="pos-mobile-search">
              <Search className="si" size={14} />
              <input
                type="text"
                placeholder="Search menu items..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <div 
              className="pos-mobile-dots" 
              onClick={() => {
                const el = document.getElementById('pos-mobile-dots-menu');
                el.style.display = el.style.display === 'none' ? 'block' : 'none';
              }}
            >
              <MoreVertical size={18} />
              <div id="pos-mobile-dots-menu" className="pos-mobile-dots-menu" style={{ display: 'none' }}>
                <button onClick={(e) => { e.stopPropagation(); setShowAddCategory(true); document.getElementById('pos-mobile-dots-menu').style.display = 'none'; }}>+ New Type</button>
                <button onClick={(e) => { e.stopPropagation(); setShowManageCategories(true); document.getElementById('pos-mobile-dots-menu').style.display = 'none'; }}>Manage Categories</button>
              </div>
            </div>
          </div>`;

if (posContent.includes(oldCategoryHeader)) {
  posContent = posContent.replace(oldCategoryHeader, newMobileHeader);
}

// 3. Update pos-right wrapper logic and remove old toggle button
const oldPosRightStart = `        {/* Right Panel: Cart OR Active Orders */}
        <div className={\`pos-right \${showCart ? 'has-cart-open' : ''}\`} style={{ position: 'relative' }}>
          
          <button 
            className="btn btn-primary" 
            style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
            onClick={() => setShowCart(!showCart)}
          >
            <ShoppingCart size={20} />
            {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot" style={{ top: -4, right: -4 }}>{cart.reduce((s, c) => s + c.qty, 0)}</span>}
          </button>

          <div className="active-orders-panel">`;

const newPosRightStart = `        {/* Mobile FAB Container */}
        <div className="mobile-fab-container">
          <button className="mobile-fab orders" onClick={() => setMobilePane(mobilePane === 'orders' ? 'none' : 'orders')}>
            <ClipboardList size={24} />
            {activeOrders.length > 0 && <span className="cart-badge-dot">{activeOrders.length}</span>}
          </button>
          <button className="mobile-fab cart" onClick={() => setMobilePane(mobilePane === 'cart' ? 'none' : 'cart')}>
            <ShoppingCart size={24} />
            {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot">{cart.reduce((s, c) => s + c.qty, 0)}</span>}
          </button>
        </div>

        {/* Right Panel: Cart OR Active Orders */}
        <div className={\`pos-right \${mobilePane !== 'none' ? 'mobile-open' : ''}\`}>
          
          <div className="active-orders-panel">
            {/* Mobile Header for Active Orders */}
            <div style={{ display: window.innerWidth <= 900 && mobilePane === 'orders' ? 'flex' : 'none', padding: '12px 16px', background: 'white', borderBottom: '1px solid var(--surface-2)', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Active Orders</h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setMobilePane('none')} style={{ padding: '6px 12px' }}>Close</button>
            </div>`;

if (posContent.includes(oldPosRightStart)) {
  posContent = posContent.replace(oldPosRightStart, newPosRightStart);
}

// 4. Fix cart inner overlay logic to work with mobilePane instead of showCart
const oldCartInnerOpen = `          <div className={\`pos-right-inner \${showCart ? 'cart-open' : 'cart-closed'}\`}>
          <div className="cart-header" style={{ paddingRight: 60 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShoppingCart size={20} />
              {editingOrderId ? <span style={{ color: 'var(--red)' }}>Editing Order #{editingOrderId}</span> : 'Cart'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {editingOrderId && (`;

const newCartInnerOpen = `          <div className={\`pos-right-inner \${(window.innerWidth > 900 ? showCart : mobilePane === 'cart') ? 'cart-open' : 'cart-closed'}\`}>
          <div className="cart-header" style={{ paddingRight: window.innerWidth > 900 ? 60 : 16 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {window.innerWidth <= 900 && <button className="btn btn-secondary btn-sm" onClick={() => setMobilePane('none')} style={{ padding: '4px 8px', marginRight: 4 }}>✕</button>}
              <ShoppingCart size={20} />
              {editingOrderId ? <span style={{ color: 'var(--red)' }}>Editing Order #{editingOrderId}</span> : 'Cart'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {editingOrderId && (`;

if (posContent.includes(oldCartInnerOpen)) {
  posContent = posContent.replace(oldCartInnerOpen, newCartInnerOpen);
}

// 5. Remove 'flex: 1' from cart-items to allow shrink-to-fit
const oldCartItemsStyle = `          <div className="cart-items">
            {cart.length === 0`;

const newCartItemsStyle = `          <div className="cart-items" style={{ flex: 'none', maxHeight: '50vh' }}>
            {cart.length === 0`;

if (posContent.includes(oldCartItemsStyle)) {
  posContent = posContent.replace(oldCartItemsStyle, newCartItemsStyle);
}

// 6. We also need to keep the desktop cart toggle button, because we removed it!
// Let's re-add it for desktop only by injecting it right above active-orders-panel
const desktopCartToggle = `
          {window.innerWidth > 900 && (
            <button 
              className="btn btn-primary" 
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 100, borderRadius: '50%', width: 44, height: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
              onClick={() => setShowCart(!showCart)}
            >
              <ShoppingCart size={20} />
              {cart.reduce((s, c) => s + c.qty, 0) > 0 && <span className="cart-badge-dot" style={{ top: -4, right: -4 }}>{cart.reduce((s, c) => s + c.qty, 0)}</span>}
            </button>
          )}`;
          
posContent = posContent.replace(`<div className="active-orders-panel">`, desktopCartToggle + `\n          <div className="active-orders-panel">`);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('POS.jsx updated successfully for mobile UI overrides.');
