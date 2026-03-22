import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import ImageUpload from '../components/ImageUpload';
import { attendanceAPI, qrAPI, facultyAPI } from '../services/api';

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
  const [qrScanned, setQrScanned]           = useState([]); // [{student_id, time}]
  // Register students modal
  const [showRegister, setShowRegister]     = useState(false);
  const [regLoading, setRegLoading]         = useState(false);
  const [regResult, setRegResult]           = useState(null);
  // Manual attendance modal
  const [showManual, setShowManual]         = useState(false);
  const [manualInput, setManualInput]       = useState('');
  const [manualLoading, setManualLoading]   = useState(false);
  const [manualResult, setManualResult]     = useState(null);

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
      setManualInput('');
    } catch (err) {
      setManualResult({ error: err.response?.data?.message || 'Failed to add attendance' });
    } finally {
      setManualLoading(false);
    }
  };

  // ── Bulk Register Students ───────────────────────────────────────────────
  const handleRegisterStudents = async () => {
    setRegLoading(true);
    setRegResult(null);
    try {
      const res = await facultyAPI.registerStudents();
      setRegResult(res.data);
    } catch (err) {
      setRegResult({ error: err.response?.data?.message || 'Registration failed' });
    } finally {
      setRegLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    try {
      const res = await attendanceAPI.getReport();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.setAttribute('download', 'attendance_report.xlsx');
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
            <h3>Register Students</h3>
            <p>Bulk register all students with college email and RNO password</p>
            <button className="btn-primary" onClick={() => { setShowRegister(true); setRegResult(null); }}>
              Register Students
            </button>
          </div>

          <div className="card">
            <h3>Add Manually</h3>
            <p>Mark missed students as present by entering their RNOs</p>
            <button className="btn-primary" onClick={() => { setShowManual(true); setManualResult(null); setManualInput(''); }}>
              Add Manually
            </button>
          </div>

          <div className="card">
            <h3>Download Report</h3>
            <p>Export attendance records as Excel file</p>
            <button className="btn-secondary" onClick={handleDownloadReport}>
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

        {/* ── Register Students Modal ── */}
        {showRegister && (
          <div className="modal-overlay" onClick={() => setShowRegister(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Register Students</h3>
                <button className="modal-close" onClick={() => setShowRegister(false)}>×</button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem' }}>
                  <p style={{ margin: 0, color: '#0369a1', fontSize: '0.9rem' }}>
                    <strong>Auto-generated credentials:</strong><br />
                    Email: <code>&lt;rno&gt;@bvrithyderabad.edu.in</code><br />
                    Password: <code>&lt;rno&gt;</code> (e.g. 23wh1a6601)
                  </p>
                </div>

                {!regResult ? (
                  <button className="btn-primary" disabled={regLoading} onClick={handleRegisterStudents}
                    style={{ marginTop: 0 }}>
                    {regLoading ? 'Registering all students...' : 'Register All Students'}
                  </button>
                ) : regResult.error ? (
                  <div className="error-message">{regResult.error}</div>
                ) : (
                  <>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                      <p style={{ margin: 0, color: '#15803d', fontWeight: 600 }}>{regResult.message}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                      <StatBadge label="Total"      value={regResult.total}              color="#6366f1" />
                      <StatBadge label="Registered" value={regResult.registered?.length} color="#22c55e" />
                      <StatBadge label="Skipped"    value={regResult.skipped?.length}    color="#f59e0b" />
                      {regResult.failed?.length > 0 &&
                        <StatBadge label="Failed" value={regResult.failed.length} color="#ef4444" />}
                    </div>
                    {regResult.registered?.length > 0 && (
                      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th style={thStyle}>#</th>
                              <th style={thStyle}>RNO</th>
                              <th style={thStyle}>Email</th>
                            </tr>
                          </thead>
                          <tbody>
                            {regResult.registered.map((rno, i) => (
                              <tr key={rno} style={{ borderTop: '1px solid #f1f5f9' }}>
                                <td style={tdStyle}>{i + 1}</td>
                                <td style={tdStyle}>{rno}</td>
                                <td style={tdStyle}>{rno}@bvrithyderabad.edu.in</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <button className="btn-primary" onClick={handleRegisterStudents}
                      disabled={regLoading} style={{ marginTop: '1rem' }}>
                      {regLoading ? 'Running...' : 'Run Again'}
                    </button>
                  </>
                )}
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

const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: '0.8rem' };
const tdStyle = { padding: '0.5rem 0.75rem', color: '#374151' };

export default Home;
