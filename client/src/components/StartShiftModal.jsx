import React, { useState, useEffect } from 'react'
import axios from '../api'
import toast from 'react-hot-toast'
import { 
  Clock, 
  Play, 
  Store, 
  UserCheck, 
  Calendar, 
  ShoppingBag, 
  Truck, 
  UtensilsCrossed, 
  AlertCircle,
  Banknote
} from 'lucide-react'
import { CURRENCY } from '../config'
import { formatSaudiDate, getSaudiLiveTimeString } from '../utils/timezone'

export default function StartShiftModal({ isOpen, user, onShiftStarted }) {
  const [openingCash, setOpeningCash] = useState('0')
  const [loading, setLoading] = useState(false)
  const [liveTime, setLiveTime] = useState(getSaudiLiveTimeString())
  const [prevShiftInfo, setPrevShiftInfo] = useState({
    lastCashier: null,
    totalPending: 0,
    takeaway: 0,
    delivery: 0,
    dineIn: 0
  })
  const [loadingPrevShift, setLoadingPrevShift] = useState(false)

  const branchName = user?.branch && user.branch !== 'All' ? user.branch : 'Branch 1'

  useEffect(() => {
    if (!isOpen) return
    const timer = setInterval(() => {
      setLiveTime(getSaudiLiveTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [isOpen])

  // Fetch previous shift info and pending orders for this branch
  useEffect(() => {
    if (!isOpen) return
    setLoadingPrevShift(true)
    axios.get(`/api/orders/cashier-shift/previous-shift-info?branch=${encodeURIComponent(branchName)}`)
      .then(res => {
        if (res.data?.success) {
          setPrevShiftInfo(res.data)
          if (res.data.previousRemainingCash !== undefined && res.data.previousRemainingCash !== null && res.data.previousRemainingCash > 0) {
            setOpeningCash(res.data.previousRemainingCash.toString())
          }
        }
      })
      .catch(err => {
        console.error('Failed to load previous shift info:', err)
      })
      .finally(() => setLoadingPrevShift(false))
  }, [isOpen, branchName])

  if (!isOpen) return null

  const handleStartShift = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await axios.post('/api/orders/cashier-shift/start', {
        branch: branchName,
        opening_cash: parseFloat(openingCash) || 0
      })
      toast.success('Shift started successfully! Ready for orders.')
      if (onShiftStarted) {
        onShiftStarted(res.data.shift)
      }
    } catch (err) {
      console.error('Failed to start shift:', err)
      toast.error(err.response?.data?.error || 'Failed to start shift. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: 16
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 16,
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--surface-2)',
        overflow: 'hidden',
        animation: 'scaleIn 0.25s ease-out'
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #E31837 0%, #b91c1c 100%)',
          padding: '22px 24px 18px',
          color: '#ffffff',
          textAlign: 'center'
        }}>
          <div style={{
            width: 48,
            height: 48,
            background: 'rgba(255, 255, 255, 0.18)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 10px'
          }}>
            <Clock size={26} color="#fff" />
          </div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.3px' }}>
            Start Your Shift
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            Welcome, <strong>{user?.username || 'Cashier'}</strong>! Please start your shift to begin.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleStartShift} style={{ padding: '20px 24px' }}>
          {/* Top Info Cards: Branch, Date, KSA Time */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 16
          }}>
            {/* Branch */}
            <div style={{
              background: 'var(--surface-1)',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--surface-2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                <Store size={13} color="var(--primary)" /> Branch
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {branchName}
              </div>
            </div>

            {/* Date */}
            <div style={{
              background: 'var(--surface-1)',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--surface-2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                <Calendar size={13} color="var(--primary)" /> Date
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'nowrap' }}>
                {formatSaudiDate(new Date())}
              </div>
            </div>

            {/* KSA Time */}
            <div style={{
              background: 'var(--surface-1)',
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--surface-2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>
                <Clock size={13} color="var(--primary)" /> KSA Time
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'nowrap' }}>
                {liveTime}
              </div>
            </div>
          </div>

          {/* Previous Shift & Pending Orders Section */}
          <div style={{
            background: 'var(--surface-1)',
            borderRadius: 12,
            border: '1px solid var(--surface-2)',
            padding: '14px 16px',
            marginBottom: 18
          }}>
            {/* Header: Last Shift Cashier, Cash Left, & Pending Badge */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              borderBottom: '1px solid var(--surface-2)',
              paddingBottom: 10,
              gap: 8,
              flexWrap: 'wrap'
            }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <UserCheck size={13} color="var(--primary)" /> Previous Cashier
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {loadingPrevShift ? 'Loading...' : (prevShiftInfo?.lastCashier || 'None / First Shift')}
                </div>
              </div>

              {/* Cash Left in Drawer by Previous Shift */}
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 8,
                padding: '4px 10px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 10, color: '#065f46', fontWeight: 700, textTransform: 'uppercase' }}>
                  💵 Left in Drawer
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#047857', marginTop: 1 }}>
                  {loadingPrevShift ? '...' : `${CURRENCY}${parseFloat(prevShiftInfo?.previousRemainingCash || 0).toFixed(2)}`}
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                  Pending Orders
                </div>
                {(prevShiftInfo?.totalPending || 0) > 0 ? (
                  <span style={{
                    background: '#fef3c7',
                    color: '#b45309',
                    padding: '3px 9px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 800,
                    border: '1px solid #fde68a',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <AlertCircle size={12} color="#b45309" />
                    {prevShiftInfo.totalPending} Uncompleted
                  </span>
                ) : (
                  <span style={{
                    background: '#ecfdf5',
                    color: '#047857',
                    padding: '3px 9px',
                    borderRadius: 12,
                    fontSize: 11,
                    fontWeight: 700,
                    border: '1px solid #a7f3d0'
                  }}>
                    ✓ 0 Pending
                  </span>
                )}
              </div>
            </div>

            {/* Order Type Breakdown */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Punching / Uncompleted Breakdown:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {/* Takeaway */}
                <div style={{
                  background: 'var(--surface)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  textAlign: 'center',
                  border: '1px solid var(--surface-2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                    <ShoppingBag size={13} color="#2563eb" /> Takeaway
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                    {prevShiftInfo?.takeaway || 0}
                  </div>
                </div>

                {/* Delivery */}
                <div style={{
                  background: 'var(--surface)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  textAlign: 'center',
                  border: '1px solid var(--surface-2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                    <Truck size={13} color="#16a34a" /> Delivery
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                    {prevShiftInfo?.delivery || 0}
                  </div>
                </div>

                {/* Dine-In */}
                <div style={{
                  background: 'var(--surface)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  textAlign: 'center',
                  border: '1px solid var(--surface-2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
                    <UtensilsCrossed size={13} color="#d97706" /> Dine-In
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                    {prevShiftInfo?.dineIn || 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Remaining Cash in Drawer Input */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 6
            }}>
              Remaining Cash in Drawer (دراز میں موجود رقم) ({CURRENCY})
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontWeight: 700,
                color: 'var(--text-muted)',
                fontSize: 14
              }}>
                {CURRENCY}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                autoFocus
                style={{
                  width: '100%',
                  padding: '11px 14px 11px 48px',
                  borderRadius: 10,
                  border: '1.5px solid var(--surface-2)',
                  background: 'var(--surface-1)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
              {parseFloat(prevShiftInfo?.previousRemainingCash || 0) > 0
                ? `Pichle cashier ne ${CURRENCY}${parseFloat(prevShiftInfo.previousRemainingCash).toFixed(2)} daraz me chhori thi. Gin kar confirm ya edit karein.`
                : 'Pichli shift se daraz me mojood bachi hui raqam enter ya confirm karein.'}
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #E31837 0%, #b91c1c 100%)',
              color: '#ffffff',
              border: 'none',
              fontSize: 15,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(227, 24, 55, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            {loading ? (
              <span>Starting Shift...</span>
            ) : (
              <>
                <Play size={17} fill="#fff" /> Start Shift Now
              </>
            )}
          </button>
        </form>
      </div>
      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

