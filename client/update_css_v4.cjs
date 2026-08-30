const fs = require('fs');

const cssPath = 'd:/pos/pizza-shop/client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

// Replace the previous mobile layout with a normal document flow layout
const oldMobilePosLayout = `  .pos-right {
    flex: 1; /* Takes bottom 1/3 */
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    width: 100%;
    max-width: 100%;
    transform: none;
    box-shadow: none;
    border-top: 2px solid var(--primary);
    transition: none;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Prevent inner elements from breaking layout */
  }
  
  .active-orders-panel {
    flex: 1;
    overflow-y: auto; /* Fully scrollable active orders */
  }
  
  .pos-right-inner {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: max-content;
    max-height: 100%; /* Only takes up to the height of bottom 1/3 */
    border-radius: 12px 12px 0 0;
    box-shadow: 0 -4px 16px rgba(0,0,0,0.2);
    z-index: 10;
    display: flex;
    transform: translateY(105%);
    transition: transform 0.3s cubic-bezier(0.2, 0, 0.2, 1);
    border: 1px solid var(--surface-2);
    background: white;
  }
  
  .pos-right-inner.cart-open {
    transform: translateY(0);
  }`;

const newMobilePosLayout = `  .pos-layout {
    display: flex;
    flex-direction: column;
    height: auto !important; /* Allow normal document scrolling */
    gap: 16px;
    overflow: visible;
  }

  .pos-left {
    height: auto !important; /* Normal flow */
    min-height: 60vh; /* Takes roughly 2/3 of initial screen */
    overflow: visible;
  }

  .pos-right {
    height: auto;
    position: relative;
    width: 100%;
    max-width: 100%;
    transform: none;
    box-shadow: none;
    border-top: 2px solid var(--primary);
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow: visible;
  }
  
  .active-orders-panel {
    height: auto;
    overflow: visible;
  }
  
  .pos-right-inner {
    position: relative; /* Normal flow */
    width: 100%;
    height: max-content;
    max-height: none;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    z-index: 10;
    display: none;
    transform: none;
    transition: none;
    border: 1px solid var(--surface-2);
    background: white;
  }
  
  .pos-right-inner.cart-open {
    display: flex;
    transform: none;
  }`;

const oldPosLayoutStr = `  .pos-layout {
    display: flex;
    flex-direction: column;
    height: calc(100vh - var(--topbar-height));
    gap: 0;
  }

  .pos-left {
    flex: 2; /* Takes 2/3 of screen */
    height: 65vh; /* Safe fallback */
    min-height: 0;
    overflow-y: auto;
  }`;

if (cssContent.includes(oldMobilePosLayout)) {
  cssContent = cssContent.replace(oldMobilePosLayout, newMobilePosLayout);
  cssContent = cssContent.replace(oldPosLayoutStr, ''); // Remove the old one since it's merged into newMobilePosLayout
  fs.writeFileSync(cssPath, cssContent, 'utf8');
  console.log('CSS updated successfully to normal flow');
} else {
  console.log('Could not find oldMobilePosLayout to replace!');
}
