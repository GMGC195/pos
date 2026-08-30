const fs = require('fs');

const cssPath = 'd:/pos/pizza-shop/client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

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
  }
  
  .pos-right-inner {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 92%;
    max-height: 80vh;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4);
    z-index: 2000;
    display: none;
    border: 1px solid var(--surface-2);
  }
  
  .pos-right-inner.cart-open {
    display: flex;
    transform: translate(-50%, -50%); /* Needs to override the other transform */
  }`;

const newMobilePosLayout = `  .pos-right {
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

if (cssContent.includes(oldMobilePosLayout)) {
  cssContent = cssContent.replace(oldMobilePosLayout, newMobilePosLayout);
  fs.writeFileSync(cssPath, cssContent, 'utf8');
  console.log('CSS updated successfully');
} else {
  console.log('Could not find oldMobilePosLayout to replace!');
}
