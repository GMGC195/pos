import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet, ArrowRight, Download, Info } from 'lucide-react';
import { parseFile, applyMapping } from '../utils/fileParser';
import { validateImportData } from '../utils/importValidation';
import { bulkImportEmployees, downloadErrorReport } from '../utils/importService';
import ImportPreviewTable from './ImportPreviewTable';
import toast from 'react-hot-toast';
import axios from '../api';

const STEPS = {
  UPLOAD: 'UPLOAD',
  MAPPING: 'MAPPING',
  PREVIEW: 'PREVIEW',
  IMPORTING: 'IMPORTING',
  SUMMARY: 'SUMMARY'
};

export default function ImportEmployeesModal({ isOpen, onClose, onImportSuccess }) {
  const [currentStep, setCurrentStep] = useState(STEPS.UPLOAD);
  const [progressText, setProgressText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  // File states
  const [selectedFile, setSelectedFile] = useState(null);
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mappedHeaders, setMappedHeaders] = useState({ name: '', department: '', position: '', shift: '' });
  
  // Validation and process states
  const [validatedRows, setValidatedRows] = useState([]);
  const [existingEmployees, setExistingEmployees] = useState([]);
  const [duplicateResolution, setDuplicateResolution] = useState('skip'); // 'skip' or 'update'

  // Summary states
  const [importSummary, setImportSummary] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Fetch existing employees to use for duplication checking on client side
      axios.get('/api/employees')
        .then(res => setExistingEmployees(res.data))
        .catch(() => toast.error('Error fetching system employee list'));
      
      // Reset state
      setCurrentStep(STEPS.UPLOAD);
      setSelectedFile(null);
      setRawRows([]);
      setHeaders([]);
      setValidatedRows([]);
      setImportSummary(null);
      setDuplicateResolution('skip');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file) => {
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      toast.error('Unsupported file type. Please upload a CSV or Excel file.');
      return;
    }
    
    setSelectedFile(file);
    processFile(file);
  };

  // Step-by-step progress processor
  const processFile = async (file) => {
    try {
      // 1. Upload & Parse
      setProgressText('Uploading File...');
      setProgressPercent(10);
      
      await new Promise(r => setTimeout(r, 400));
      setProgressText('Parsing Data...');
      setProgressPercent(35);
      
      const parsed = await parseFile(file);
      setRawRows(parsed.rawRows);
      setHeaders(parsed.headers);
      setMappedHeaders(parsed.mappedHeaders);

      setProgressPercent(60);
      setProgressText('Validating...');
      await new Promise(r => setTimeout(r, 300));

      if (parsed.needsManualMapping) {
        // Fallback to manual mapping step
        setCurrentStep(STEPS.MAPPING);
      } else {
        // Automatically map fields and move to preview
        const mapped = applyMapping(parsed.rawRows, parsed.mappedHeaders);
        const validated = validateImportData(mapped, existingEmployees);
        setValidatedRows(validated);
        
        setProgressPercent(100);
        setProgressText('Preparing Preview...');
        await new Promise(r => setTimeout(r, 200));
        
        setCurrentStep(STEPS.PREVIEW);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to parse file');
      setSelectedFile(null);
    }
  };

  // User manually configured the mapping
  const handleApplyManualMapping = () => {
    if (!mappedHeaders.name) {
      toast.error('Employee Name mapping is required');
      return;
    }
    const mapped = applyMapping(rawRows, mappedHeaders);
    const validated = validateImportData(mapped, existingEmployees);
    setValidatedRows(validated);
    setCurrentStep(STEPS.PREVIEW);
  };

  const handleRemoveRow = (index) => {
    const updated = validatedRows.filter(r => r.index !== index);
    setValidatedRows(updated);
  };

  const handleImportClick = async () => {
    // Only import valid or duplicate items depending on resolution, filtering out errors
    const importableRows = validatedRows.filter(r => r.status !== 'error');
    
    if (importableRows.length === 0) {
      toast.error('No valid records to import');
      return;
    }

    try {
      setCurrentStep(STEPS.IMPORTING);
      setProgressText('Importing Employees...');
      setProgressPercent(20);

      await new Promise(r => setTimeout(r, 350));
      setProgressPercent(60);

      // Perform bulk import
      const result = await bulkImportEmployees(importableRows, duplicateResolution);
      
      setProgressPercent(100);
      setProgressText('Completed');
      await new Promise(r => setTimeout(r, 250));

      setImportSummary(result);
      setCurrentStep(STEPS.SUMMARY);
      onImportSuccess();
      toast.success('Employees imported successfully!');
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Import failed');
      setCurrentStep(STEPS.PREVIEW);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!importSummary) return;
    
    // Combine client-side errors and skipped duplicates from backend
    const allErrors = [];
    
    // Client-side excluded error rows
    validatedRows.forEach(r => {
      if (r.status === 'error') {
        allErrors.push({
          name: r.name || 'N/A',
          department: r.department || '',
          position: r.position || '',
          shift: r.shift || '',
          reason: r.reason || 'Missing Name'
        });
      }
    });

    // Backend import endpoint error summaries
    if (importSummary.errors && importSummary.errors.length > 0) {
      allErrors.push(...importSummary.errors);
    }

    if (allErrors.length === 0) {
      toast.error('No skipped or failed records to download.');
      return;
    }

    downloadErrorReport(allErrors);
  };

  // Render progress timeline tracker
  const renderProgressTracker = () => {
    const stepsList = [
      { id: STEPS.UPLOAD, label: 'Upload File' },
      { id: STEPS.MAPPING, label: 'Column Map' },
      { id: STEPS.PREVIEW, label: 'Preview' },
      { id: STEPS.SUMMARY, label: 'Summary' }
    ];

    const getStepIndex = (step) => Object.values(STEPS).indexOf(step);
    const activeIdx = getStepIndex(currentStep);

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--surface-2)', marginBottom: 20 }}>
        {stepsList.map((step, idx) => {
          const stepIndex = getStepIndex(step.id);
          const isCompleted = activeIdx > stepIndex || currentStep === STEPS.SUMMARY;
          const isActive = currentStep === step.id || (step.id === STEPS.MAPPING && currentStep === STEPS.MAPPING);

          // Skip mapping screen in tracker if it wasn't required
          if (step.id === STEPS.MAPPING && currentStep !== STEPS.MAPPING && !mappedHeaders.name) {
            return null;
          }

          return (
            <React.Fragment key={step.id}>
              {idx > 0 && <ArrowRight size={14} style={{ color: 'var(--text-muted)' }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: isCompleted ? 'var(--green)' : isActive ? 'var(--primary)' : 'var(--surface-3)',
                  color: isCompleted || isActive ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700
                }}>
                  {isCompleted ? '✓' : idx + 1}
                </span>
                <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: currentStep === STEPS.PREVIEW ? 900 : 600,
        padding: 0,
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--surface-2)' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileSpreadsheet size={20} style={{ color: 'var(--primary)' }} /> Bulk Import Employees
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: 24 }}>
          {renderProgressTracker()}

          {/* UPLOAD STEP */}
          {currentStep === STEPS.UPLOAD && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current.click()}
                style={{
                  border: '2px dashed var(--surface-3)',
                  borderRadius: 12,
                  padding: '48px 24px',
                  textAlign: 'center',
                  background: 'var(--surface-1)',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--surface-3)'}
              >
                <div style={{ background: 'rgba(var(--primary-rgb), 0.1)', color: 'var(--primary)', padding: 14, borderRadius: '50%' }}>
                  <Upload size={32} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 600 }}>Drag & Drop Excel or CSV File</h4>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Support files: .csv, .xlsx, .xls</p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}>
                  Choose File
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".csv, .xlsx, .xls" 
                  style={{ display: 'none' }} 
                />
              </div>

              <div style={{ display: 'flex', gap: 8, background: 'rgba(var(--primary-rgb), 0.05)', padding: 12, borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', alignItems: 'flex-start' }}>
                <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Formatting Tips:</strong>
                  <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
                    <li>Employee Name is required. Rows with missing names will be skipped.</li>
                    <li>Fields like Shift, Department, and Position will be mapped automatically.</li>
                    <li>Employee IDs will be automatically generated as <strong>EMP-XXXX</strong>.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* COLUMN MAPPING STEP */}
          {currentStep === STEPS.MAPPING && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8, padding: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
                <AlertTriangle size={18} />
                <span>Automatic column mapping failed. Please map columns manually to proceed.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { field: 'name', label: 'Employee Name *', required: true },
                  { field: 'department', label: 'Department', required: false },
                  { field: 'position', label: 'Position / Designation', required: false },
                  { field: 'shift', label: 'Shift', required: false }
                ].map((item) => (
                  <div key={item.field} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                    <select
                      value={mappedHeaders[item.field] || ''}
                      onChange={(e) => setMappedHeaders({ ...mappedHeaders, [item.field]: e.target.value })}
                      style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-1)', color: 'var(--text)', outline: 'none' }}
                    >
                      <option value="">-- Skip Field --</option>
                      {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(STEPS.UPLOAD)}>Back</button>
                <button type="button" className="btn btn-primary" onClick={handleApplyManualMapping}>Apply Mapping</button>
              </div>
            </div>
          )}

          {/* PREVIEW STEP */}
          {currentStep === STEPS.PREVIEW && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div style={{ fontSize: 13 }}>
                  File: <strong>{selectedFile?.name}</strong> ({(selectedFile?.size / 1024).toFixed(1)} KB)
                </div>
                
                {/* Duplicate resolution selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Duplicate Resolution:</span>
                  <select
                    value={duplicateResolution}
                    onChange={(e) => setDuplicateResolution(e.target.value)}
                    style={{ border: '1px solid var(--surface-2)', borderRadius: 8, padding: '6px 12px', background: 'var(--surface-1)', color: 'var(--text)', fontSize: 12, outline: 'none' }}
                  >
                    <option value="skip">Skip Duplicates</option>
                    <option value="update">Overwrite Existing Records</option>
                  </select>
                </div>
              </div>

              <ImportPreviewTable rows={validatedRows} onRemoveRow={handleRemoveRow} />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCurrentStep(STEPS.UPLOAD)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleImportClick}>Import Employees</button>
              </div>
            </div>
          )}

          {/* IMPORTING / PROGRESS SCREEN */}
          {currentStep === STEPS.IMPORTING && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '40px 0' }}>
              <div style={{ position: 'relative', width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--surface-2)', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              <style>{`
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <div style={{ textAlign: 'center' }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: 16, fontWeight: 700 }}>{progressText}</h4>
                <div style={{ width: 200, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', margin: '0 auto' }}>
                  <div style={{ width: `${progressPercent}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
                </div>
              </div>
            </div>
          )}

          {/* SUMMARY STEP */}
          {currentStep === STEPS.SUMMARY && importSummary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 0', borderBottom: '1px solid var(--surface-2)' }}>
                <CheckCircle2 size={48} style={{ color: 'var(--green)' }} />
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Import Completed!</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>Employees have been processed successfully.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[
                  { label: 'Total Records', val: importSummary.total, color: 'var(--text)' },
                  { label: 'Imported Successfully', val: importSummary.success, color: 'var(--green)' },
                  { label: 'Duplicates Skipped', val: importSummary.skipped, color: '#F97316' },
                  { label: 'Updated Records', val: importSummary.updated, color: 'var(--primary)' }
                ].map((item, idx) => (
                  <div key={idx} style={{ background: 'var(--surface-1)', border: '1px solid var(--surface-2)', padding: 12, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.label}</span>
                    <strong style={{ fontSize: 16, color: item.color }}>{item.val}</strong>
                  </div>
                ))}
              </div>

              {/* Show error report download if there are errors or skipped items */}
              {(importSummary.skipped > 0 || importSummary.failed > 0 || validatedRows.some(r => r.status === 'error')) && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.03)',
                  border: '1px solid rgba(239, 68, 68, 0.1)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={18} style={{ color: 'var(--red)' }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Some rows were skipped, failed, or contained errors.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadErrorReport}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={14} /> Download Error Report
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
