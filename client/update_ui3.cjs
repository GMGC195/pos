const fs = require('fs');

const posPath = 'd:/pos/pizza-shop/client/src/pages/POS.jsx';
let posContent = fs.readFileSync(posPath, 'utf8');

// 1. Remove {!showCart && (
const panelStartStr = `        <div className={\`pos-right \${showCart ? 'has-cart-open' : ''}\`}>
          {!showCart && (
            <div className="active-orders-panel">`;
const newPanelStartStr = `        <div className={\`pos-right \${showCart ? 'has-cart-open' : ''}\`}>
          <div className="active-orders-panel">`;
posContent = posContent.replace(panelStartStr, newPanelStartStr);

const panelEndStr = `                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          
          {showCart && (`;
const newPanelEndStr = `                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          
          {showCart && (`;
posContent = posContent.replace(panelEndStr, newPanelEndStr);


// 2. Add setShowCart(false) and fetchActiveOrders() to submitOrder cleanup
const cleanupOld = `      // Cleanup
      setCart([])
      setEditingOrderId(null)
      window.history.replaceState({}, '', '/pos')
      setPaymentMethod('Cash')
      setConfirmModal(false)
      setCustomerInfo({ name: '', phone: '', address: '', discount: '' })
    } catch (err) {`;
const cleanupNew = `      // Cleanup
      setCart([])
      setEditingOrderId(null)
      window.history.replaceState({}, '', '/pos')
      setPaymentMethod('Cash')
      setConfirmModal(false)
      setCustomerInfo({ name: '', phone: '', address: '', discount: '' })
      setShowCart(false)
      fetchActiveOrders()
    } catch (err) {`;
posContent = posContent.replace(cleanupOld, cleanupNew);

fs.writeFileSync(posPath, posContent, 'utf8');
console.log('Successfully updated POS behavior tweaks');
