import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ImageUpload from '../components/ImageUpload';
import { attendanceAPI, qrAPI } from '../services/api';

const StatBadge = ({ label, value, color }) => (
  <div style={{
    flex: 1, minWidth: 100, background: '#f8fafc', borderRadius: 8,
    padding: '0.75rem 1rem', textAlign: 'center', border: `2px solid ${color}20`,
  }}>
    <div style={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>{label}</div>
  </div>
);

const Home = () => {
  const [loading, setLoading]               = useState(false);
  const [facultyName, setFacultyName]       = useState('Faculty');
  const [attendanceData, setAttendanceData] = useState(null);
  const [statusMsg, setStatusMsg]           = useState('');
  const [showUpload, setShowUpload]         = useState(false);
  const [qrData, setQrData]                 = useState(null);
  const [qrCountdown, setQrCountdown]       = useState(0);
  const [qrScanned, setQrScanned]           = useState([]);
  // Accumulated session ids across all methods for scoped report
  const [sessionIds, setSessionIds]         = useState([]);
  // Last manual attendance result for persistent UI
  const [manualAdded, setManualAdded]       = useState([]);
  // Manual attendance modal
  const [showManual, setShowManual]         = useState(false);
  const [manualInput, setManualInput]       = useState('');
  const [manualLoading, setManualLoading]   = useState(false);
  const [manualResult, setManualResult]     = useState(null);
  // Report method filter
  const [reportMethod, setReportMethod]     = useState('all');

  const countdownRef = useRef(null);
  const pollRef      = useRef(null);
  const qrSectionRef = useRef(null);
  const resultRef    = useRef(null);
  const navigate     = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) navigate('/login');
    const name = localStorage.getItem('facultyName');
    if (name) setFacultyName(name);
    return () => { clearInterval(countdownRef.current); clearInterval(pollRef.current); };
  }, [navigate]);

  // ── Face Attendance ──────────────────────────────────────────────────────
  const handleUploadImages = async (files) => {
    setLoading(true);
    setStatusMsg('');
    setAttendanceData(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const res = await attendanceAPI.upload(formData);
      setAttendanceData(res.data);
      setStatusMsg(res.data.message);
      if (res.data.session_id) setSessionIds(prev => [...new Set([...prev, res.data.session_id])]);
      setShowUpload(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setStatusMsg(err.response?.data?.message || 'Failed to process attendance');
    } finally {
      setLoading(false);
    }
  };

  // ── QR Attendance ────────────────────────────────────────────────────────
  const handleGenerateQR = async () => {
    try {
      const res = await qrAPI.generate();
      setQrData(res.data);
      setQrCountdown(res.data.expires_in);
      setQrScanned([]);
      if (res.data.session_id) setSessionIds(prev => [...new Set([...prev, res.data.session_id])]);
      setTimeout(() => qrSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

      clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setQrCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownRef.current); clearInterval(pollRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);

      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const s = await qrAPI.status(res.data.qr_token);
          setQrScanned(s.data.scanned_list || []);
          if (!s.data.active) clearInterval(pollRef.current);
        } catch (_) {}
      }, 3000);
    } catch (err) {
      setStatusMsg('Failed to generate QR code');
    }
  };

  // ── Manual Attendance ────────────────────────────────────────────────────
  const handleManualAttendance = async () => {
    const ids = manualInput.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;
    setManualLoading(true);
    setManualResult(null);
    try {
      const res = await attendanceAPI.manual(ids);
      setManualResult(res.data);
      if (res.data.session_id) setSessionIds(prev => [...new Set([...prev, res.data.session_id])]);
      if (res.data.added?.length) setManualAdded(prev => [...new Set([...prev, ...res.data.added])]);
      setManualInput('');
    } catch (err) {
      setManualResult({ error: err.response?.data?.message || 'Failed to add attendance' });
    } finally {
      setManualLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await attendanceAPI.getReport(reportMethod, sessionIds);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', `attendance_report_${reportMethod}.xlsx`);
      document.body.appendChild(a); a.click(); a.remove();
    } catch (_) {
      setStatusMsg('Failed to download report');
    }
  };

  const isError = statusMsg.toLowerCase().includes('fail') || statusMsg.toLowerCase().includes('error');

  return (
    <div>
      <Navbar />
      <div className="container">
        <div className="welcome-section">
          <h1>Welcome, {facultyName}!</h1>
          <p>Manage your classroom attendance efficiently</p>
        </div>

        {/* ── Action Cards ── */}
        <div className="dashboard-grid">
          <div className="card">
            <h3>Face Attendance</h3>
            <p>Upload classroom images to mark attendance via face recognition</p>
            <button className="btn-primary" disabled={loading}
              onClick={() => { setShowUpload(true); setStatusMsg(''); setAttendanceData(null); }}>
              {loading ? 'Processing...' : 'Upload Images'}
            </button>
          </div>

          <div className="card">
            <h3>QR Attendance</h3>
            <p>Generate a QR code for students to scan (expires in 2 min)</p>
            <button className="btn-primary" onClick={handleGenerateQR}>
              Generate QR Code
            </button>
          </div>

          <div className="card">
            <h3>Add Manually</h3>
            <p>Mark missed students as present by entering their RNOs</p>
            <button className="btn-primary" onClick={() => { setShowManual(true); setManualResult(null); setManualInput(''); }}>
              Add Manually
            </button>
          </div>

        </div>

        {/* ── Download Report ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: 520 }}>
            <h3 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Download Report</h3>
            <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
              Export current session attendance as Excel file
            </p>
            {sessionIds.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#f59e0b', marginBottom: '0.75rem' }}>
                No active session — run Face, QR, or Manual attendance first.
              </p>
            ) : (
              <p style={{ textAlign: 'center', fontSize: '0.82rem', color: '#22c55e', marginBottom: '0.75rem', fontWeight: 600 }}>
                {sessionIds.length} session(s) ready
              </p>
            )}
            <select
              value={reportMethod}
              onChange={e => setReportMethod(e.target.value)}
              style={{
                width: '100%', padding: '0.65rem 0.75rem', marginBottom: '1rem',
                border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.95rem',
                background: '#f8fafc', cursor: 'pointer',
              }}
            >
              <option value="all">All Methods</option>
              <option value="face">Face Recognition only</option>
              <option value="qr">QR Scan only</option>
              <option value="manual">Manual only</option>
            </select>
            <button
              className="btn-secondary"
              onClick={handleDownloadReport}
              disabled={sessionIds.length === 0}
              style={{ width: '100%' }}
            >
              Download Excel
            </button>
          </div>
        </div>

        {/* ── Image Upload Modal ── */}
        {showUpload && (
          <div className="modal-overlay" onClick={() => setShowUpload(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Upload Classroom Images</h3>
                <button className="modal-close" onClick={() => setShowUpload(false)}>×</button>
              </div>
              <ImageUpload onUpload={handleUploadImages} loading={loading} />
            </div>
          </div>
        )}

        {/* ── Manual Attendance Modal ── */}
        {showManual && (
          <div className="modal-overlay" onClick={() => setShowManual(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add Manually</h3>
                <button className="modal-close" onClick={() => setShowManual(false)}>×</button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <p style={{ color: '#64748b', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
                  Enter RNOs separated by commas, spaces, or new lines.
                </p>
                <textarea
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  placeholder="23wh1a6601, 23wh1a6602&#10;24wh5a6601"
                  rows={5}
                  style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0',
                    borderRadius: 6, fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box' }}
                  disabled={manualLoading}
                />
                {manualResult && !manualResult.error && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
                      padding: '0.75rem', marginBottom: '0.5rem', color: '#15803d', fontWeight: 600 }}>
                      {manualResult.message}
                    </div>
                    {manualResult.invalid?.length > 0 && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                        padding: '0.75rem', color: '#dc2626', fontSize: '0.85rem' }}>
                        Invalid RNOs: {manualResult.invalid.join(', ')}
                      </div>
                    )}
                  </div>
                )}
                {manualResult?.error && (
                  <div className="error-message" style={{ marginTop: '0.75rem' }}>{manualResult.error}</div>
                )}
                <button className="btn-primary" disabled={manualLoading || !manualInput.trim()}
                  onClick={handleManualAttendance} style={{ marginTop: '1rem' }}>
                  {manualLoading ? 'Marking...' : 'Mark Present'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── QR Panel ── */}
        {qrData && (
          <div ref={qrSectionRef} className="card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ textAlign: 'center' }}>
              QR Code {qrCountdown > 0 ? `— expires in ${qrCountdown}s` : '— EXPIRED'}
            </h3>

            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* QR Image */}
              <div style={{ textAlign: 'center', flex: '0 0 auto' }}>
                <img src={qrData.qr_image} alt="QR Code"
                  style={{ width: 200, height: 200, display: 'block',
                           opacity: qrCountdown > 0 ? 1 : 0.3,
                           border: '2px solid #e2e8f0', borderRadius: 8 }} />
                <p style={{ marginTop: '0.5rem', fontWeight: 600,
                            color: qrCountdown > 0 ? '#22c55e' : '#ef4444' }}>
                  {qrCountdown > 0 ? `Active — ${qrCountdown}s left` : 'Expired'}
                </p>
              </div>

              {/* Scanned table */}
              <div style={{ flex: 1, minWidth: 260 }}>
                <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                  Scanned: {qrScanned.length} student(s)
                </p>
                {qrScanned.length > 0 ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={thStyle}>#</th>
                          <th style={thStyle}>Student ID</th>
                          <th style={thStyle}>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qrScanned.map((row, i) => (
                          <tr key={row.student_id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={tdStyle}>{i + 1}</td>
                            <td style={tdStyle}>{row.student_id}</td>
                            <td style={tdStyle}>{row.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No students scanned yet</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Manual Attendance Results Panel ── */}
        {manualAdded.length > 0 && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Manually Added Students</h3>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Student ID</th>
                    <th style={thStyle}>Method</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {manualAdded.map((s, i) => (
                    <tr key={s} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>{s}</td>
                      <td style={tdStyle}>Manual</td>
                      <td style={{ ...tdStyle, color: '#16a34a', fontWeight: 600 }}>Present</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Status Message ── */}
        {statusMsg && (
          <div className={`status-message ${isError ? 'error' : 'success'}`}>
            {statusMsg}
          </div>
        )}

        {/* ── Attendance Results ── */}
        {attendanceData && (
          <div ref={resultRef} className="card" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Attendance Recorded</h3>

            {/* Accuracy Stats */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <StatBadge label="Faces Detected" value={attendanceData.total_faces}    color="#6366f1" />
              <StatBadge label="Matched"         value={attendanceData.matched_count}  color="#22c55e" />
              <StatBadge label="Unknown"          value={attendanceData.unknown_count}  color="#f59e0b" />
              <StatBadge label="Accuracy"         value={`${attendanceData.accuracy}%`} color="#3b82f6" />
            </div>

            {/* Present Students Table with distance + confidence */}
            {attendanceData.students?.length > 0 ? (
              <>
                <h4 style={{ marginBottom: '0.5rem' }}>
                  Present Students ({attendanceData.students.length})
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Student ID</th>
                        <th style={thStyle}>Distance</th>
                        <th style={thStyle}>Confidence</th>
                        <th style={thStyle}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceData.students.map((s, i) => {
                        const dbg = attendanceData.debug?.find(d => d.student_id === s);
                        return (
                          <tr key={s} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={tdStyle}>{i + 1}</td>
                            <td style={tdStyle}>{s}</td>
                            <td style={tdStyle}>{dbg ? dbg.distance : '—'}</td>
                            <td style={tdStyle}>{dbg ? `${dbg.confidence}%` : '—'}</td>
                            <td style={{ ...tdStyle, color: '#16a34a', fontWeight: 600 }}>Present</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p style={{ color: '#94a3b8' }}>No students were recognized in the uploaded image.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const thStyle    = { padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.8rem' };
const tdStyle    = { padding: '0.5rem 0.75rem', color: '#374151' };
const labelStyle = { display: 'block', fontWeight: 600, color: '#374151', fontSize: '0.9rem', marginBottom: '0.4rem' };
const selectStyle = {
  width: '100%', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: '0.95rem', background: '#f8fafc', cursor: 'pointer',
};
const inputStyle = {
  width: '100%', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: '0.95rem', boxSizing: 'border-box',
};

export default Home;
