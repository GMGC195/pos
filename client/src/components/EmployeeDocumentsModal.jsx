import React, { useState, useEffect } from 'react'
import { X, Upload, Trash2, FileText, Image as ImageIcon, Download, MoreVertical, Edit2, Eye } from 'lucide-react'
import axios from '../api'
import toast from 'react-hot-toast'

export default function EmployeeDocumentsModal({ employee, onClose }) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState([])
  const [documentName, setDocumentName] = useState('')
  const [documentType, setDocumentType] = useState('CNIC')
  const [documentNumber, setDocumentNumber] = useState('')
  const [note, setNote] = useState('')
  const [editingDoc, setEditingDoc] = useState(null)
  const [viewingDoc, setViewingDoc] = useState(null)
  const [menuOpenFor, setMenuOpenFor] = useState(null)

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
    formData.append('documentType', documentType)
    formData.append('documentNumber', documentNumber)
    formData.append('note', note)
    files.forEach(file => {
      formData.append('documents', file)
    })

    try {
      if (editingDoc) {
        await axios.put(`/api/employees/documents/${editingDoc.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        toast.success('Document updated successfully')
      } else {
        await axios.post(`/api/employees/${employee.id}/documents`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        toast.success('Documents uploaded successfully')
      }
      setFiles([])
      setDocumentName('')
      setDocumentType('CNIC')
      setDocumentNumber('')
      setNote('')
      setEditingDoc(null)
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
    let baseUrl = 'http://localhost:5000';
    try {
      if (import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
      }
    } catch(e) {}
    try {
      if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
        baseUrl = process.env.REACT_APP_API_URL;
      }
    } catch(e) {}
    
    const url = `${baseUrl}${fileUrl}`;
    window.open(url, '_blank');
  }

  const getFileUrl = (fileUrl) => {
    let baseUrl = 'http://localhost:5000';
    try {
      if (import.meta && import.meta.env && import.meta.env.VITE_API_URL) {
        baseUrl = import.meta.env.VITE_API_URL;
      }
    } catch(e) {}
    try {
      if (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) {
        baseUrl = process.env.REACT_APP_API_URL;
      }
    } catch(e) {}
    return `${baseUrl}${fileUrl}`;
  }

  const handleEditClick = (doc) => {
    setEditingDoc(doc)
    setDocumentName(doc.document_name || '')
    setDocumentType(doc.document_type || 'Other')
    setDocumentNumber(doc.document_number || '')
    setNote(doc.note || '')
    setMenuOpenFor(null)
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
        
        <div className="modal-scroll-container" style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Upload Section */}
          <div style={{ background: 'var(--surface-1)', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Upload New Document(s)</h4>
            </div>
            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Document Type</label>
                  <select 
                    value={documentType}
                    onChange={e => setDocumentType(e.target.value)}
                    style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                  >
                    <option value="CNIC">CNIC</option>
                    <option value="Passport">Passport</option>
                    <option value="Visa">Visa</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                {documentType === 'Other' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Custom Document Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Contract"
                      value={documentName}
                      onChange={e => setDocumentName(e.target.value)}
                      style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                    />
                  </div>
                )}
                <div style={{ gridColumn: documentType === 'Other' ? '1 / -1' : 'auto' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>CNIC / Document Number (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="Enter document number"
                    value={documentNumber}
                    onChange={e => setDocumentNumber(e.target.value)}
                    style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Note (Optional)</label>
                <textarea 
                  rows="2"
                  placeholder="Additional details..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', resize: 'vertical' }}
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
                      <div style={{ position: 'relative' }}>
                        <button onClick={() => setMenuOpenFor(menuOpenFor === doc.id ? null : doc.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                          <MoreVertical size={14} />
                        </button>
                        {menuOpenFor === doc.id && (
                          <div style={{ position: 'absolute', top: 24, right: 0, background: 'white', border: '1px solid var(--surface-2)', borderRadius: 6, boxShadow: 'var(--shadow)', padding: 4, zIndex: 10, width: 120 }}>
                            <button onClick={() => handleEditClick(doc)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, textAlign: 'left', borderRadius: 4 }}>
                              <Edit2 size={12} /> Edit
                            </button>
                            <button onClick={() => { setMenuOpenFor(null); handleDelete(doc.id) }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, textAlign: 'left', color: 'var(--red)', borderRadius: 4 }}>
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    {doc.document_type && (
                      <div style={{ display: 'inline-block', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, width: 'fit-content' }}>
                        {doc.document_type}
                      </div>
                    )}
                    {(doc.document_number || doc.note) && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {doc.document_number && <div style={{ marginBottom: 4 }}><strong style={{ color: 'var(--text-primary)' }}>ID:</strong> {doc.document_number}</div>}
                        {doc.note && <div><strong style={{ color: 'var(--text-primary)' }}>Note:</strong> {doc.note}</div>}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {doc.original_filename}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        title="Download"
                        onClick={() => downloadFile(doc.file_path, doc.original_filename)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px' }}
                      >
                        <Download size={16} />
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => setViewingDoc(doc)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12 }}
                      >
                        <Eye size={14} /> View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {viewingDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 800, maxHeight: '95vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{viewingDoc.document_name}</h3>
              <button onClick={() => setViewingDoc(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--surface-1)' }}>
              <div style={{ display: 'flex', gap: 24, flexDirection: 'column' }}>
                <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Document Metadata</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                    <div><strong>Type:</strong> {viewingDoc.document_type || 'N/A'}</div>
                    <div><strong>ID Number:</strong> {viewingDoc.document_number || 'N/A'}</div>
                    <div style={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {viewingDoc.note || 'None'}</div>
                    <div><strong>Uploaded:</strong> {new Date(viewingDoc.uploaded_at).toLocaleString()}</div>
                    <div><strong>Size:</strong> {(viewingDoc.file_size / 1024).toFixed(1)} KB</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => downloadFile(viewingDoc.file_path, viewingDoc.original_filename)} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Download size={16} /> Download File
                  </button>
                </div>
                <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)', minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {viewingDoc.mime_type?.startsWith('image/') ? (
                    <img src={getFileUrl(viewingDoc.file_path)} alt="Document" style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
                  ) : (
                    <iframe src={getFileUrl(viewingDoc.file_path)} title="Document Viewer" style={{ width: '100%', height: '60vh', border: 'none' }} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 900, maxHeight: '95vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white' }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Edit Document: {editingDoc.document_name}</h3>
              <button onClick={() => { setEditingDoc(null); setFiles([]); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--surface-1)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                {/* Left Side: Preview */}
                <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: 14, alignSelf: 'flex-start' }}>Current File Preview</h4>
                  {editingDoc.mime_type?.startsWith('image/') ? (
                    <img src={getFileUrl(editingDoc.file_path)} alt="Preview" style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      <FileText size={48} style={{ margin: '0 auto 12px' }} />
                      <div>PDF Document</div>
                      <a href={getFileUrl(editingDoc.file_path)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary)', marginTop: 8, display: 'inline-block' }}>Open in new tab</a>
                    </div>
                  )}
                </div>
                {/* Right Side: Form */}
                <div style={{ background: 'white', padding: 16, borderRadius: 8, border: '1px solid var(--surface-2)' }}>
                  <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Document Type</label>
                      <select 
                        value={documentType}
                        onChange={e => setDocumentType(e.target.value)}
                        style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                      >
                        <option value="CNIC">CNIC</option>
                        <option value="Passport">Passport</option>
                        <option value="Visa">Visa</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {documentType === 'Other' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Custom Document Name</label>
                        <input 
                          type="text" 
                          value={documentName}
                          onChange={e => setDocumentName(e.target.value)}
                          style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                        />
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>CNIC / Document Number (Optional)</label>
                      <input 
                        type="text" 
                        value={documentNumber}
                        onChange={e => setDocumentNumber(e.target.value)}
                        style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Note (Optional)</label>
                      <textarea 
                        rows="2"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '10px 12px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', resize: 'vertical' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Replace File (Optional)</label>
                      <input 
                        type="file" 
                        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                        onChange={handleFileChange}
                        style={{ width: '100%', border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 10px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                      />
                    </div>
                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      disabled={uploading}
                      style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <Edit2 size={16} /> {uploading ? 'Saving...' : 'Update Document'}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
