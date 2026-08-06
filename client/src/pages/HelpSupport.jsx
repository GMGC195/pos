import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Mail, MessageSquare, Image as ImageIcon, Send, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { BRAND_EMAIL } from '../branding'
import api from '../api'

export default function HelpSupport() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.username || '',
    email: user?.email || '',
    phone: '',
    reason: '',
    screenshot: null
  })



  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size should be less than 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, screenshot: reader.result }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await api.post('/api/support/send', {
        ...formData,
        // Re-affirm name/email/phone from state
        name: formData.name || user?.username || 'Admin',
        email: formData.email || user?.email || BRAND_EMAIL,
        phone: formData.phone || 'Not Provided'
      })

      const data = response.data
      if (data.success) {
        toast.success('Support request sent successfully!')
        setFormData(prev => ({ ...prev, reason: '', screenshot: null }))
        // Clear file input
        const fileInput = document.querySelector('input[type="file"]')
        if (fileInput) fileInput.value = ''
      } else {
        toast.error(data.error || 'Failed to send support request')
      }
    } catch (err) {
      console.error('Support error:', err)
      toast.error('Connection error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="help-support-page" style={{ maxWidth: '800px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
      <div className="card" style={{ padding: '30px' }}>
        <div className="card-header" style={{ borderBottom: '1px solid var(--surface-2)', paddingBottom: '20px', marginBottom: '25px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 12, margin: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(227, 24, 55, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MessageSquare color="var(--red)" size={24} />
            </div>
            Help & Support Center
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', marginTop: 10, lineHeight: 1.5 }}>
            Experiencing any issues or have questions about the system? <br/>
            Fill out the form below and our technical team will assist you.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-row">
            <div className="form-group">
              <label>Your Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input 
                type="text" 
                className="form-control" 
                value={formData.name}
                required
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                style={{ fontWeight: 600 }}
              />
            </div>
            <div className="form-group">
              <label>Mobile Number <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(Optional)</span></label>
              <input 
                type="tel" 
                className="form-control" 
                placeholder="03xx-xxxxxxx"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                style={{ fontWeight: 600 }}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Your Email Address</label>
            <input 
              type="email" 
              className="form-control" 
              value={formData.email}
              readOnly
              style={{ background: '#f8fafc', cursor: 'not-allowed', fontWeight: 600 }}
            />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>This email is used for correspondence</p>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 700 }}>Problem / Reason Details <span style={{ color: 'var(--red)' }}>*</span></label>
            <textarea 
              className="form-control" 
              rows="6" 
              placeholder="Please provide details about the issue you're facing..."
              required
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              style={{ padding: '15px', lineHeight: 1.6 }}
            ></textarea>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <ImageIcon size={18} color="var(--text-secondary)" /> Attach Screenshot (Optional)
            </label>
            <input 
              type="file" 
              accept="image/*"
              className="form-control" 
              onChange={handleFileChange}
              style={{ padding: '8px' }}
            />
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 5 }}>Max file size: 5MB</p>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={loading}
            style={{ width: '100%', height: '50px', justifyContent: 'center', fontSize: '16px', gap: 12, marginTop: 10 }}
          >
            {loading ? 'Sending Request...' : <><Send size={20} /> Send Support Request</>}
          </button>
        </form>

        <div style={{ marginTop: 50, borderTop: '1px solid var(--surface-2)', paddingTop: 40 }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: 25, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 4, height: 20, background: 'var(--red)', borderRadius: 2 }}></span>
            Need Instant Support?
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {/* Email Contact */}
            <div className="contact-box" style={{ 
              padding: '24px', 
              border: '1.5px solid var(--surface-2)', 
              borderRadius: '16px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 12,
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--red)', fontWeight: 700, fontSize: '16px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(227, 24, 55, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mail size={20} />
                </div>
                Email Support
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Send us an email anytime</p>
              <a href="mailto:uzairshafqat106@gmail.com" style={{ 
                fontWeight: 700, 
                color: 'var(--text-primary)', 
                textDecoration: 'none',
                fontSize: '15px',
                padding: '10px 14px',
                background: 'var(--surface)',
                borderRadius: '8px',
                display: 'inline-block',
                textAlign: 'center'
              }}>
                uzairshafqat106@gmail.com
              </a>
            </div>

            {/* WhatsApp Contact */}
            <div className="contact-box" style={{ 
              padding: '24px', 
              border: '1.5px solid #25D366', 
              borderRadius: '16px', 
              background: 'rgba(37, 211, 102, 0.02)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 12,
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#25D366', fontWeight: 700, fontSize: '16px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37, 211, 102, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Phone size={20} />
                </div>
                Direct WhatsApp
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>Chat with us for quick help</p>
              <a 
                href="https://wa.me/923062951312" 
                target="_blank" 
                rel="noreferrer"
                style={{ 
                  fontWeight: 700, 
                  color: 'white', 
                  textDecoration: 'none',
                  fontSize: '15px',
                  padding: '10px 14px',
                  background: '#25D366',
                  borderRadius: '8px',
                  display: 'inline-block',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.2)'
                }}
              >
                +92 306 2951312
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
