import React, { useState, useEffect } from 'react';
import axios from '../api';
import toast from 'react-hot-toast';
import { ShieldCheck, Lock, Eye, EyeOff, X, AlertCircle } from 'lucide-react';

export default function DeveloperAuthModal({
  isOpen = true,
  title = 'Developer Authorization Required',
  actionDescription = 'Editing closed shift records requires verified Developer credentials for financial audit compliance.',
  onClose,
  onAuthorized
}) {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Lock background scroll while modal is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow || 'unset';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!usernameOrEmail.trim()) {
      setErrorMsg('Please enter your Developer username or email.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your Developer password.');
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post('/api/auth/verify-developer', {
        usernameOrEmail: usernameOrEmail.trim(),
        password
      });

      if (res.data?.success && res.data?.devToken) {
        toast.success(`Authorized by Developer: ${res.data?.developer?.username || 'Developer'}`);
        if (onAuthorized) {
          onAuthorized({
            devToken: res.data.devToken,
            developer: res.data.developer
          });
        }
      } else {
        setErrorMsg(res.data?.error || 'Verification failed. Please check your developer credentials.');
      }
    } catch (err) {
      console.error('Developer authorization error:', err);
      const msg = err.response?.data?.error || err.message || 'Developer authorization failed.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target.classList.contains('modal-overlay')) onClose();
      }}
      style={{
        zIndex: 10001,
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        className="modal"
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#ffffff',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.18)',
                border: '1.5px solid rgba(239, 68, 68, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ShieldCheck size={22} color="#f87171" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#ffffff' }}>
                {title}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Role-Based Financial Security Guard
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: 24 }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
            {actionDescription}
          </p>

          {errorMsg && (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#b91c1c',
                fontSize: 12.5,
                fontWeight: 600,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} id="developer-auth-form">
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: 6
                }}
              >
                Developer Username or Email
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. dev_admin or dev@example.com"
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1.5px solid #cbd5e1',
                  fontSize: 13.5,
                  fontWeight: 500
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#334155',
                  marginBottom: 6
                }}
              >
                Developer Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Enter your developer password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 12px',
                    borderRadius: 8,
                    border: '1.5px solid #cbd5e1',
                    fontSize: 13.5,
                    fontWeight: 500
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    padding: 4
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 11.5,
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <Lock size={14} color="#059669" />
              <span>
                All edits are recorded with Developer ID, timestamp, and mathematical variance.
              </span>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div
          style={{
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            padding: '14px 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexShrink: 0
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="developer-auth-form"
            className="btn btn-primary"
            disabled={loading}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 600
            }}
          >
            {loading ? 'Verifying...' : 'Authorize & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

