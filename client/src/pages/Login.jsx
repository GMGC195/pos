import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  Users,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Hash,
  LogIn,
  Send,
  ShieldCheck,
  KeyRound,
  Fingerprint,
  CalendarRange,
  Clock,
} from 'lucide-react'
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_VERSION,
  BRAND_PRIMARY,
  BRAND_EMAIL
} from '../branding'
import BRAND_LOGIN_LOGO from '../assets/1 al rasaq.png'

const API = import.meta.env.API_URL || 'http://localhost:5000'

const features = [
  { icon: LayoutDashboard, title: 'Smart Dashboard',            desc: 'Real-time insights for smarter decisions' },
  { icon: Fingerprint,     title: 'Mark Attendance',            desc: 'Easy check-in & check-out tracking for staff' },
  { icon: CalendarRange,   title: 'Monthly Attendance Reports', desc: 'Aggregated attendance sheets at a glance' },
  { icon: Clock,           title: "Today's Attendance",         desc: 'Monitor active shifts and breaks in real time' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('login')
  const [form, setForm] = useState({ usernameOrEmail: '', password: '', email: '', otp: '', newPassword: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)
  const [isFlipped, setIsFlipped] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleLogin = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: form.usernameOrEmail, password: form.password })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      login(data.user, data.token)
      setIsFlipped(true)
      setTimeout(() => {
        if (data.user?.role?.toLowerCase() === 'operator') {
          navigate('/attendance', { replace: true })
        } else {
          navigate('/pos', { replace: true })
        }
      }, 750)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleForgot = async e => {
    e.preventDefault()
    setError(''); setInfo(''); setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setInfo(data.message); setStep('otp')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleReset = async e => {
    e.preventDefault(); setError('')
    if (form.newPassword !== form.confirmPassword) return setError('Passwords do not match')
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, otp: form.otp, newPassword: form.newPassword })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reset failed')
      setInfo('Password reset! You can now log in.'); setStep('login')
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const leftPanelVariants = {
    hidden: { 
      opacity: 0, 
      rotateX: -180,
      z: -100
    },
    show: { 
      opacity: 1, 
      rotateX: 0,
      z: 0,
      transition: { type: 'spring', damping: 15, stiffness: 50, duration: 1.2 } 
    },
    success: { 
      opacity: 0, 
      rotateX: 180,
      z: -100,
      transition: { ease: 'easeInOut', duration: 0.75 } 
    }
  }

  const rightPanelVariants = {
    hidden: { 
      opacity: 0, 
      rotateX: 180,
      z: -100
    },
    show: { 
      opacity: 1, 
      rotateX: 0,
      z: 0,
      transition: { type: 'spring', damping: 15, stiffness: 50, duration: 1.2, delay: 0.1 } 
    },
    success: { 
      opacity: 0, 
      rotateX: -180,
      z: -100,
      transition: { ease: 'easeInOut', duration: 0.75 } 
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Dancing+Script:wght@700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-root {
          min-height: 100vh;
          display: flex;
          align-items: stretch;
          font-family: 'Inter', sans-serif;
          background: #0d3038;
          position: relative;
          overflow: hidden;
          perspective: 1500px;
        }

        /* Dot grid */
        .lp-dots {
          position: absolute; inset: 0; pointer-events: none; z-index: 0;
          background-image: radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        /* Decorative circles */
        .lp-deco {
          position: absolute; border-radius: 50%; pointer-events: none; z-index: 0;
        }
        .lp-deco-1 {
          width: 480px; height: 480px;
          border: 1.5px solid rgba(255,255,255,0.045);
          top: -160px; right: 390px;
        }
        .lp-deco-2 {
          width: 320px; height: 320px;
          border: 1.5px solid rgba(255,255,255,0.04);
          bottom: -80px; left: 80px;
        }
        .lp-deco-3 {
          width: 240px; height: 240px;
          background: rgba(244,180,0,0.045);
          top: 80px; right: 430px;
        }
        .lp-deco-4 {
          width: 160px; height: 160px;
          background: rgba(255,255,255,0.025);
          bottom: 100px; left: 340px;
        }

        /* ── LEFT PANEL ── */
        .lp-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 48px 36px 36px;
          position: relative;
          z-index: 1;
          text-align: center;
        }

        .lp-logo {
          width: auto; height: 116px;
          object-fit: contain;
          margin-bottom: 22px;
        }

        .lp-welcome {
          font-size: 17px; font-weight: 400;
          color: rgba(255,255,255,0.65);
          margin-bottom: 4px; letter-spacing: 0.3px;
        }

        .lp-brand-name {
          font-size: 46px; font-weight: 900;
          color: #fff; line-height: 1.05;
          letter-spacing: 4px; margin-bottom: 10px;
        }
        .lp-brand-name span { color: #F4B400; }

        .lp-tagline {
          font-size: 11.5px; letter-spacing: 4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          margin-bottom: 6px;
        }

        .lp-divider {
          width: 38px; height: 3px;
          background: #F4B400; border-radius: 2px;
          margin: 12px auto 26px; opacity: 0.85;
        }

        /* 2-column feature grid */
        .lp-features {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 20px;
          width: 100%; max-width: 440px;
          margin-bottom: 26px;
        }

        .lp-feature {
          display: flex; align-items: flex-start; gap: 11px;
          text-align: left;
        }

        .lp-feat-icon-wrap {
          width: 40px; height: 40px; flex-shrink: 0;
          border-radius: 50%;
          border: 1.5px solid rgba(244,180,0,0.4);
          background: rgba(244,180,0,0.09);
          display: flex; align-items: center; justify-content: center;
          color: #F4B400;
        }

        .lp-feat-text h4 {
          font-size: 12.5px; font-weight: 700;
          color: #fff; margin-bottom: 2px;
        }
        .lp-feat-text p {
          font-size: 10.5px;
          color: rgba(255,255,255,0.42);
          line-height: 1.45;
        }

        /* Slogan */
        .lp-slogan { margin-top: 2px; }
        .lp-slogan-script {
          font-family: 'Dancing Script', cursive;
          font-size: 21px; font-weight: 700;
          color: #F4B400;
          display: flex; align-items: center; gap: 7px;
          justify-content: center;
        }
        .lp-slogan-sub {
          font-size: 10.5px; color: rgba(255,255,255,0.35);
          margin-top: 5px; letter-spacing: 0.4px;
        }

        /* ── RIGHT: floating white card ── */
        .lp-right {
          width: 460px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 28px;
          margin-right: 200px;
          position: relative;
          z-index: 2;
        }

        .lp-card {
          width: 100%;
          background: #fff;
          border-radius: 24px;
          padding: 36px 32px 26px;
          box-shadow:
            0 24px 80px rgba(0,0,0,0.38),
            0 4px 16px rgba(0,0,0,0.18);
        }

        .lp-card-logo {
          display: block;
          width: auto; height: 76px;
          object-fit: contain;
          margin: 0 auto 16px;
          background-color: #0d3038;
          padding: 8px 16px;
          border-radius: 12px;
        }

        .lp-card-title {
          font-size: 25px; font-weight: 800;
          color: #111827;
          text-align: center; margin-bottom: 4px;
        }
        .lp-card-sub {
          font-size: 13.5px; color: #9ca3af;
          text-align: center; margin-bottom: 24px;
        }

        /* Fields */
        .lp-field { margin-bottom: 14px; }
        .lp-label {
          display: block;
          font-size: 13px; font-weight: 600;
          color: #374151; margin-bottom: 7px;
        }
        .lp-input-wrap {
          position: relative;
          display: flex; align-items: center;
        }
        .lp-input-icon {
          position: absolute; left: 13px;
          color: #9ca3af; pointer-events: none; z-index: 1;
          display: flex; align-items: center;
        }
        .lp-input {
          width: 100%;
          padding: 12px 42px 12px 40px;
          border: 1.5px solid #e5e7eb;
          border-radius: 10px;
          font-size: 14px; font-family: inherit;
          color: #111827; background: #fafafa;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
        }
        .lp-input::placeholder { color: #c8ccd4; }
        .lp-input:focus {
          border-color: #F4B400;
          box-shadow: 0 0 0 3px rgba(244,180,0,0.14);
          background: #fff;
        }
        .lp-eye {
          position: absolute; right: 11px;
          background: none; border: none; cursor: pointer;
          color: #9ca3af; padding: 4px;
          display: flex; align-items: center;
          transition: color 0.15s;
        }
        .lp-eye:hover { color: #374151; }

        /* Forgot row */
        .lp-forgot-row {
          text-align: right; margin-top: -4px; margin-bottom: 18px;
        }
        .lp-forgot-btn {
          background: none; border: none;
          color: #D4A000; font-size: 13px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: color 0.15s;
        }
        .lp-forgot-btn:hover { color: #b38a00; }

        /* Submit button */
        .lp-submit {
          width: 100%; padding: 13.5px;
          background: linear-gradient(135deg, #F4B400, #D4A000);
          border: none; border-radius: 11px;
          color: #000; font-size: 14.5px; font-weight: 800;
          letter-spacing: 1.5px; text-transform: uppercase;
          cursor: pointer; font-family: inherit;
          box-shadow: 0 4px 16px rgba(244,180,0,0.38);
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 9px;
        }
        .lp-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(244,180,0,0.5);
        }
        .lp-submit:active:not(:disabled) { transform: translateY(0); }
        .lp-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Secondary buttons */
        .lp-back-btn {
          background: none; border: none; color: #9ca3af;
          font-size: 12.5px; cursor: pointer; width: 100%;
          text-align: center; padding: 8px; text-decoration: underline;
          font-family: inherit; margin-top: 8px; display: block;
        }
        .lp-link-btn {
          background: none; border: none; color: #D4A000;
          font-size: 13px; cursor: pointer; font-weight: 700;
          font-family: inherit; display: block;
          text-align: center; margin-top: 8px; padding: 4px;
        }

        /* Alert messages */
        .lp-error {
          background: rgba(239,68,68,0.07);
          border: 1px solid rgba(239,68,68,0.25);
          border-radius: 8px; padding: 10px 13px;
          color: #dc2626; font-size: 13px;
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 14px;
        }
        .lp-info {
          background: rgba(16,185,129,0.07);
          border: 1px solid rgba(16,185,129,0.25);
          border-radius: 8px; padding: 10px 13px;
          color: #059669; font-size: 13px;
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 14px;
        }

        .lp-otp-hint {
          font-size: 11px; color: #9ca3af; margin-top: 5px;
        }

        /* Footer */
        .lp-card-footer {
          margin-top: 18px; text-align: center;
          color: #9ca3af; font-size: 11.5px;
          border-top: 1px solid #f0f0f0; padding-top: 14px;
          line-height: 1.75;
        }
        .lp-version-badge {
          display: inline-block;
          background: #f3f4f6; color: #6b7280;
          font-size: 10px; font-weight: 600;
          padding: 2px 8px; border-radius: 20px;
          border: 1px solid #e5e7eb; margin-left: 4px;
          vertical-align: middle;
        }

        /* ── RESPONSIVE ── */
        @media (max-width: 1024px) {
          .lp-brand-name { font-size: 38px; }
          .lp-right { width: 420px; }
        }

        @media (max-width: 820px) {
          .lp-root { flex-direction: column; justify-content: center; align-items: center; }
          .lp-left { display: none !important; }
          .lp-features { display: none !important; }
          .lp-right { width: 100%; padding: 16px; margin-right: 0; }
          .lp-card { padding: 26px 22px 20px; border-radius: 20px; }
        }

        @media (max-width: 480px) {
          .lp-left { display: none !important; }
          .lp-right { padding: 12px; }
          .lp-card { padding: 22px 16px 16px; }
        }
      `}</style>

      <div className="lp-root">
        {/* Background layers */}
        <div className="lp-dots" />
        <div className="lp-deco lp-deco-1" />
        <div className="lp-deco lp-deco-2" />
        <div className="lp-deco lp-deco-3" />
        <div className="lp-deco lp-deco-4" />

        {/* ── LEFT PANEL ── */}
        <motion.div 
          className="lp-left"
          variants={leftPanelVariants}
          initial="hidden"
          animate={isFlipped ? "success" : "show"}
        >
          <img src={BRAND_LOGIN_LOGO} alt={BRAND_NAME} className="lp-logo" />
          <div className="lp-divider" />
          
          {/* features, slogans... */}
          <div className="lp-features">
            {features.map((feat) => {
              const Icon = feat.icon
              return (
                <div key={feat.title} className="lp-feature">
                  <div className="lp-feat-icon-wrap">
                    <Icon size={18} strokeWidth={2} />
                  </div>
                  <div className="lp-feat-text">
                    <h4>{feat.title}</h4>
                    <p>{feat.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="lp-slogan">
            <div className="lp-slogan-script">
              <span style={{ opacity: 0.7, fontSize: 14 }}>→</span>
              Cook. Serve. Satisfy.
              <span style={{ opacity: 0.7, fontSize: 14 }}>←</span>
            </div>
            <p className="lp-slogan-sub">All-in-one Restaurant Management Solution</p>
          </div>
        </motion.div>

        {/* ── RIGHT: floating white card (centered) ── */}
        <motion.div 
          className="lp-right"
          variants={rightPanelVariants}
          initial="hidden"
          animate={isFlipped ? "success" : "show"}
        >
          <div className="lp-card">
            <img src={BRAND_LOGIN_LOGO} alt={BRAND_NAME} className="lp-card-logo" />

            <h2 className="lp-card-title">
              {step === 'login' && 'Welcome Back!'}
              {step === 'forgot' && 'Forgot Password'}
              {step === 'otp'    && 'Enter OTP'}
              {step === 'reset'  && 'Reset Password'}
            </h2>
            <p className="lp-card-sub">
              {step === 'login'  && `Sign in to your ${BRAND_NAME} account`}
              {step === 'forgot' && "We'll send a verification code to your email"}
              {step === 'otp'    && `OTP sent to ${form.email}`}
              {step === 'reset'  && 'Choose a strong new password'}
            </p>

            {error && (
              <div className="lp-error">
                <ShieldCheck size={15} />
                {error}
              </div>
            )}
            {info && (
              <div className="lp-info">
                <ShieldCheck size={15} />
                {info}
              </div>
            )}

            {/* ── LOGIN ── */}
            {step === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="lp-field">
                  <label className="lp-label">Username or Email</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><User size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      placeholder="Enter username or email"
                      value={form.usernameOrEmail}
                      onChange={e => set('usernameOrEmail', e.target.value)}
                      required autoFocus
                    />
                  </div>
                </div>

                <div className="lp-field">
                  <label className="lp-label">Password</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><Lock size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      type={showPass ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={form.password}
                      onChange={e => set('password', e.target.value)}
                      required
                    />
                    <button type="button" className="lp-eye" onClick={() => setShowPass(p => !p)}>
                      {showPass ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </div>

                <div className="lp-forgot-row">
                  <button type="button" className="lp-forgot-btn"
                    onClick={() => { setError(''); setInfo(''); setStep('forgot') }}>
                    Forgot password?
                  </button>
                </div>

                <button type="submit" className="lp-submit" disabled={loading}>
                  <LogIn size={17} strokeWidth={2.5} />
                  {loading ? 'SIGNING IN…' : 'SIGN IN'}
                </button>
              </form>
            )}

            {/* ── FORGOT ── */}
            {step === 'forgot' && (
              <form onSubmit={handleForgot}>
                <div className="lp-field">
                  <label className="lp-label">Your Email Address</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><Mail size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      type="email"
                      placeholder="Enter your email"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      required autoFocus
                    />
                  </div>
                </div>
                <button type="submit" className="lp-submit" disabled={loading}>
                  <Send size={16} strokeWidth={2.5} />
                  {loading ? 'SENDING…' : 'SEND OTP'}
                </button>
                <button type="button" className="lp-back-btn"
                  onClick={() => { setError(''); setStep('login') }}>
                  ← Back to Login
                </button>
              </form>
            )}

            {/* ── OTP ── */}
            {step === 'otp' && (
              <form onSubmit={e => { e.preventDefault(); setStep('reset') }}>
                <div className="lp-field">
                  <label className="lp-label">6-Digit OTP</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><Hash size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      style={{ letterSpacing: 8, fontWeight: 800, fontSize: 20, textAlign: 'center', paddingLeft: 44 }}
                      placeholder="000000"
                      maxLength={6}
                      value={form.otp}
                      onChange={e => set('otp', e.target.value.replace(/\D/g, ''))}
                      required autoFocus
                    />
                  </div>
                  <p className="lp-otp-hint">Check your inbox and spam folder</p>
                </div>
                <button type="submit" className="lp-submit" disabled={form.otp.length < 6}>
                  <ShieldCheck size={16} strokeWidth={2.5} />
                  VERIFY OTP
                </button>
                <button type="button" className="lp-link-btn" onClick={handleForgot} disabled={loading}>
                  {loading ? 'Resending…' : '↺  Resend OTP'}
                </button>
                <button type="button" className="lp-back-btn"
                  onClick={() => { setError(''); setStep('forgot') }}>
                  ← Change Email
                </button>
              </form>
            )}

            {/* ── RESET ── */}
            {step === 'reset' && (
              <form onSubmit={handleReset}>
                <div className="lp-field">
                  <label className="lp-label">New Password</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><KeyRound size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      type={showNewPass ? 'text' : 'password'}
                      placeholder="Enter new password"
                      value={form.newPassword}
                      onChange={e => set('newPassword', e.target.value)}
                      required minLength={6} autoFocus
                    />
                    <button type="button" className="lp-eye" onClick={() => setShowNewPass(p => !p)}>
                      {showNewPass ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                    </button>
                  </div>
                </div>
                <div className="lp-field">
                  <label className="lp-label">Confirm Password</label>
                  <div className="lp-input-wrap">
                    <span className="lp-input-icon"><Lock size={16} strokeWidth={2} /></span>
                    <input
                      className="lp-input"
                      type="password"
                      placeholder="Confirm new password"
                      value={form.confirmPassword}
                      onChange={e => set('confirmPassword', e.target.value)}
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="lp-submit" disabled={loading}>
                  <ShieldCheck size={16} strokeWidth={2.5} />
                  {loading ? 'RESETTING…' : 'RESET PASSWORD'}
                </button>
              </form>
            )}

            <div className="lp-card-footer">
              © {new Date().getFullYear()} {BRAND_NAME} — Restaurant ERP.<br />
              All rights reserved.
              <span className="lp-version-badge">{BRAND_VERSION}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
