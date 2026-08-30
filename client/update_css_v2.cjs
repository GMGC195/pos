const fs = require('fs');

const cssPath = 'd:/pos/pizza-shop/client/src/index.css';
let cssContent = fs.readFileSync(cssPath, 'utf8');

const oldMobilePosLayout = `  .pos-layout {
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
  }`;

const newMobilePosLayout = `  .pos-layout {
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
  }

  .pos-right {
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
  }
  
  /* Compact Modal specifically on mobile */
  .modal-content {
    padding: 16px !important;
  }
  
  .modal-content h3 {
    font-size: 16px !important;
    margin-bottom: 12px !important;
  }
  
  .modal-content p {
    font-size: 12px !important;
  }
  
  .modal-content .btn {
    font-size: 12px !important;
    padding: 8px 12px !important;
  }
  
  /* Size modal specific */
  .size-option {
    padding: 12px !important;
  }
  
  .size-option h4 {
    font-size: 14px !important;
  }
  
  .size-option span {
    font-size: 12px !important;
  }`;

if (cssContent.includes(oldMobilePosLayout)) {
  cssContent = cssContent.replace(oldMobilePosLayout, newMobilePosLayout);
  fs.writeFileSync(cssPath, cssContent, 'utf8');
  console.log('CSS updated successfully');
} else {
  console.log('Could not find oldMobilePosLayout to replace!');
}
