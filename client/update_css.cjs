const fs = require('fs');

const cssPath = 'd:/pos/pizza-shop/client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

// 1. Add Mobile POS Header Styles and Cart Float button
const newStyles = `
/* ===== POS MOBILE COMPACT HEADER ===== */
.pos-mobile-header {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  width: 100%;
  background: white;
  border-bottom: 1px solid var(--surface-2);
}

.pos-mobile-dropdown {
  flex: 1.2;
  min-width: 90px;
  padding: 8px 8px;
  border-radius: 8px;
  border: 1px solid var(--surface-2);
  background: white;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.pos-mobile-search {
  flex: 2;
  position: relative;
  display: flex;
  align-items: center;
}

.pos-mobile-search input {
  width: 100%;
  padding: 8px 10px 8px 30px;
  border-radius: 8px;
  border: 1px solid var(--surface-2);
  font-size: 12px;
  outline: none;
}

.pos-mobile-search .si {
  position: absolute;
  left: 8px;
  color: var(--text-muted);
}

.pos-mobile-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: white;
  border: 1px solid var(--surface-2);
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
}

.pos-mobile-dots-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  padding: 6px;
  z-index: 50;
  width: 140px;
  border: 1px solid var(--surface-2);
}

.pos-mobile-dots-menu button {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  color: var(--text-primary);
  font-weight: 500;
}
.pos-mobile-dots-menu button:hover {
  background: #f1f5f9;
}

/* Mobile Floating Action Buttons (FAB) */
.mobile-fab-container {
  display: none;
}
`;

if (!cssContent.includes('.pos-mobile-header')) {
  cssContent += newStyles;
}


// 2. Adjust .product-grid on max-width: 480px to be 3 columns
const oldGridMobile = `  .product-grid {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 10px;
  }`;

const newGridMobile = `  .product-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
  }`;

if (cssContent.includes(oldGridMobile)) {
  cssContent = cssContent.replace(oldGridMobile, newGridMobile);
}

// 3. Adjust product card on mobile
const oldCardMobile = `  .product-card img {
    height: 90px;
  }

  .product-card-info {
    padding: 8px;
  }

  .product-card-info h4 {
    font-size: 12px;
  }

  .product-price {
    font-size: 12px;
  }

  .add-btn {
    width: 24px;
    height: 24px;
    font-size: 14px;
  }`;

const newCardMobile = `  .product-card img {
    height: 70px;
  }

  .product-card-info {
    padding: 6px;
  }

  .product-card-info h4 {
    font-size: 11px;
    margin-bottom: 2px;
    line-height: 1.2;
  }

  .product-price {
    font-size: 11px;
  }

  .add-btn {
    width: 22px;
    height: 22px;
    font-size: 13px;
  }
  
  .product-card-info span {
    font-size: 9px !important;
    padding: 2px 4px !important;
  }`;

if (cssContent.includes(oldCardMobile)) {
  cssContent = cssContent.replace(oldCardMobile, newCardMobile);
}


// 4. Update pos-layout, pos-left, pos-right for 900px
const oldMobilePosLayout = `  .pos-layout {
    display: flex;
    flex-direction: column;
    height: auto;
    gap: 16px;
  }

  .pos-left {
    min-height: 400px;
    height: 55vh;
  }

  .pos-right {
    height: auto;
  }`;

const newMobilePosLayout = `  .pos-layout {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--topbar-height) - 10px);
    gap: 0;
  }

  .pos-left {
    flex: 1;
    height: 100%;
    min-height: 0;
  }

  .pos-right {
    position: fixed;
    top: var(--topbar-height);
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 400px;
    z-index: 1000;
    transform: translateX(105%);
    transition: transform 0.3s cubic-bezier(0.2, 0, 0.2, 1);
    box-shadow: -4px 0 16px rgba(0,0,0,0.1);
  }
  
  .pos-right.mobile-open {
    transform: translateX(0);
  }
  
  .pos-right-inner {
    height: max-content;
    max-height: 100%;
    bottom: auto;
    border-bottom: 1px solid var(--surface-2);
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  
  .mobile-fab-container {
    display: flex;
    position: fixed;
    bottom: 20px;
    right: 20px;
    gap: 12px;
    z-index: 900;
  }
  
  .mobile-fab {
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 50%;
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(227, 24, 55, 0.4);
    cursor: pointer;
    position: relative;
  }
  
  .mobile-fab.orders {
    background: white;
    color: var(--primary);
    box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  }`;

if (cssContent.includes(oldMobilePosLayout)) {
  cssContent = cssContent.replace(oldMobilePosLayout, newMobilePosLayout);
}

fs.writeFileSync(cssPath, cssContent, 'utf8');
console.log('CSS updated successfully');
