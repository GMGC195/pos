import React, { useState, useEffect } from 'react'
import { X, Upload, Trash2, FileText, Image as ImageIcon, Download } from 'lucide-react'
import axios from '../api'
import toast from 'react-hot-toast'

export default function EmployeeDocumentsModal({ employee, onClose }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState([])
  const [documentName, setDocumentName] = useState('')

  useEffect(() => {
    if (employee) {
      loadDocuments()
    }
  }, [employee])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/employees/${employee.id}/documents`)
      setDocuments(res.data)
    } catch (err) {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files)
    if (selectedFiles.length > 5) {
      toast.error('You can upload a maximum of 5 files at once.')
      return
    }
    setFiles(selectedFiles)
    if (selectedFiles.length === 1 && !documentName) {
      // Auto-fill document name if only one file is selected
      const nameWithoutExt = selectedFiles[0].name.split('.').slice(0, -1).join('.')
      setDocumentName(nameWithoutExt)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (files.length === 0) {
      toast.error('Please select files to upload')
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append('documentName', documentName || 'Document')
    files.forEach(file => {
      formData.append('documents', file)
    })

    try {
      await axios.post(`/api/employees/${employee.id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      toast.success('Documents uploaded successfully')
      setFiles([])
      setDocumentName('')
      // clear the file input
      document.getElementById('file-upload-input').value = ''
      loadDocuments()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to upload documents')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return
    try {
      await axios.delete(`/api/employees/documents/${docId}`)
      toast.success('Document deleted')
      loadDocuments()
    } catch (err) {
      toast.error('Failed to delete document')
    }
  }

  const getFileIcon = (mimeType) => {
    if (mimeType && mimeType.startsWith('image/')) return <ImageIcon size={20} className="text-blue-500" />
    return <FileText size={20} className="text-gray-500" />
  }

  const downloadFile = (fileUrl, originalName) => {
    // We can just open the url in a new tab to view/download
    // Assumes backend serves files statically
    const url = process.env.REACT_APP_API_URL 
      ? `${process.env.REACT_APP_API_URL}${fileUrl}` 
      : `http://localhost:5000${fileUrl}`;
    window.open(url, '_blank');
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 700, maxHeight: '90vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--surface-2)', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
            Documents for {employee?.name}
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>
        
        <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Upload Section */}
          <div style={{ background: 'var(--surface-1)', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)' }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>Upload New Document(s)</h4>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Document Name / Label (Optional)</label>
                <input 
                  type="text" 
                  placeholder="e.g. ID Card, Contract"
                  value={documentName}
                  onChange={e => setDocumentName(e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Select File(s) (Max 5, images/pdfs)</label>
                <input 
                  id="file-upload-input"
                  type="file" 
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                  onChange={handleFileChange}
                  style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={uploading || files.length === 0}
                style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Upload size={16} /> {uploading ? 'Uploading...' : 'Upload Document(s)'}
              </button>
            </form>
          </div>

          {/* Documents List */}
          <div>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>Uploaded Documents</h4>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Loading documents...</div>
            ) : documents.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-1)', borderRadius: 8, border: '1px dashed var(--surface-3)' }}>
                No documents uploaded yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                {documents.map(doc => (
                  <div key={doc.id} style={{ 
                    border: '1px solid var(--surface-2)', 
                    borderRadius: 8, 
                    padding: 12,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        {getFileIcon(doc.mime_type)}
                        <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.document_name}>
                          {doc.document_name}
                        </span>
                      </div>
                      <button onClick={() => handleDelete(doc.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--red)', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {doc.original_filename}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => downloadFile(doc.file_url, doc.original_filename)}
                      style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                    >
                      <Download size={14} /> View / Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
