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

const STAGES = [
  { icon: '📤', label: 'Uploading Image',       sub: 'Sending image to server...',           color: '#3b82f6' },
  { icon: '🔍', label: 'Detecting Faces',        sub: 'RetinaFace scanning for faces...',      color: '#8b5cf6' },
  { icon: '🧠', label: 'Recognizing Students',   sub: 'FaceNet512 matching embeddings...',     color: '#22c55e' },
];

const ProcessingOverlay = ({ compact = false, stage, progress }) => {
  const { icon, label, sub, color } = STAGES[stage];

  return (
    <div style={{ padding: compact ? '1.25rem 1rem' : '2.5rem 2rem', textAlign: 'center' }}>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 ${color}55; }
          70%  { transform: scale(1);    box-shadow: 0 0 0 14px ${color}00; }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 ${color}00; }
        }
        @keyframes scan-line {
          0%   { top: 8px; opacity: 1; }
          100% { top: 88px; opacity: 0.2; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      {/* Animated icon ring */}
      <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 1.5rem' }}>
        {/* Spinning outer ring */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: `3px solid ${color}22`,
          borderTop: `3px solid ${color}`,
          animation: 'spin-slow 1.2s linear infinite',
        }} />
        {/* Pulsing inner circle */}
        <div style={{
          position: 'absolute', inset: 8, borderRadius: '50%',
          background: `${color}15`,
          animation: 'pulse-ring 1.5s ease-out infinite',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.2rem',
        }}>
          {icon}
        </div>
        {/* Scan line (only on detect stage) */}
        {stage === 1 && (
          <div style={{
            position: 'absolute', left: 8, right: 8, height: 2,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            animation: 'scan-line 1s ease-in-out infinite alternate',
            borderRadius: 2,
          }} />
        )}
      </div>

      {/* Stage label */}
      <div key={label} style={{ animation: 'fade-up 0.4s ease' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e3a5f', marginBottom: '0.3rem' }}>
          {label}
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.75rem' }}>{sub}</div>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#f1f5f9', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: '1rem' }}>
        <div style={{
          height: '100%', borderRadius: 99, width: `${progress}%`,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          backgroundSize: '400px 100%',
          animation: 'shimmer 1.4s linear infinite',
          transition: 'width 0.12s linear',
        }} />
      </div>
      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{Math.round(progress)}% complete</div>

      {/* Stage dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
        {STAGES.map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.75rem', fontWeight: i === stage ? 700 : 400,
            color: i < stage ? '#22c55e' : i === stage ? s.color : '#cbd5e1',
            transition: 'color 0.3s',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i < stage ? '#22c55e' : i === stage ? s.color : '#e2e8f0',
              transition: 'background 0.3s',
            }} />
            {s.label.split(' ')[0]}
          </div>
        ))}
      </div>
    </div>
  );
};

const Home = () => {
  const [loading, setLoading]               = useState(false);
  const [facultyName, setFacultyName]       = useState('');
  const [currentTime, setCurrentTime]       = useState(new Date());
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
  // Public tunnel URLs for QR (ngrok etc.)
  const [ngrokFrontend, setNgrokFrontend]   = useState('');
  const [ngrokBackend, setNgrokBackend]     = useState('');
  const [showNgrok, setShowNgrok]           = useState(false);
  // Live attendance stats
  const [stats, setStats]                   = useState(null);
  // PiP expanded state
  const [pipExpanded, setPipExpanded]       = useState(false);
  // Processing animation state — lifted here so it survives pip toggle
  const [pipStage, setPipStage]             = useState(0);
  const [pipProgress, setPipProgress]       = useState(0);
  const pipTimerRef = useRef(null);

  const countdownRef  = useRef(null);
  const pollRef       = useRef(null);
  const qrSectionRef  = useRef(null);
  const resultRef     = useRef(null);
  const sessionIdsRef = useRef([]);   // always mirrors sessionIds state
  const navigate      = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) navigate('/login');
    const name = localStorage.getItem('facultyName');
    if (name) setFacultyName(name);
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => { clearInterval(countdownRef.current); clearInterval(pollRef.current); clearInterval(clock); clearInterval(pipTimerRef.current); };
  }, [navigate]);

  // keeps ref in sync whenever state changes
  const addSessionId = (id) => {
    if (!id) return sessionIdsRef.current;
    const next = [...new Set([...sessionIdsRef.current, id])];
    sessionIdsRef.current = next;
    setSessionIds(next);
    return next;
  };

  const fetchStats = async (ids) => {
    if (!ids.length) return;
    try {
      const res = await attendanceAPI.getStats(ids);
      setStats(res.data);
    } catch (_) {}
  };

  // ── Face Attendance ──────────────────────────────────────────────────────
  const handleUploadImages = async (files) => {
    setLoading(true);
    setStatusMsg('');
    setAttendanceData(null);
    setPipExpanded(false);
    setPipStage(0);
    setPipProgress(0);
    clearInterval(pipTimerRef.current);
    pipTimerRef.current = setInterval(() => {
      setPipProgress(prev => {
        const next = prev + 0.55;
        if (prev < 30 && next >= 30) setPipStage(1);
        if (prev < 65 && next >= 65) setPipStage(2);
        return Math.min(next, 95);
      });
    }, 110);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('images', f));
      const res = await attendanceAPI.upload(formData);
      setAttendanceData(res.data);
      setStatusMsg(res.data.message);
      const newIds = addSessionId(res.data.session_id);
      fetchStats(newIds);
      setShowUpload(false);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setStatusMsg(err.response?.data?.message || 'Failed to process attendance');
    } finally {
      clearInterval(pipTimerRef.current);
      setLoading(false);
    }
  };

  // ── QR Attendance ────────────────────────────────────────────────────────
  const handleGenerateQR = async () => {
    try {
      const res = await qrAPI.generate(
        ngrokFrontend.trim() || null,
        ngrokBackend.trim()  || null,
      );
      setQrData(res.data);
      setQrCountdown(res.data.expires_in);
      setQrScanned([]);
      const newIds = addSessionId(res.data.session_id);
      fetchStats(newIds);
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
          fetchStats(sessionIdsRef.current);
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
      const newIds = addSessionId(res.data.session_id);
      fetchStats(newIds);
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
      const res = await attendanceAPI.getReport(reportMethod, sessionIdsRef.current);
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

        {/* ── Header Banner ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1e3a5f 0%, #2d6a9f 100%)',
          borderRadius: 14, padding: '1.75rem 2rem', marginBottom: '1.75rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: '1rem',
          boxShadow: '0 4px 20px rgba(30,58,95,0.18)',
        }}>
          <div>
            <div style={{ fontSize: '0.82rem', color: '#93c5fd', fontWeight: 600,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.3rem' }}>
              Faculty Dashboard
            </div>
            <h1 style={{ margin: 0, color: '#fff', fontSize: '1.6rem', fontWeight: 700 }}>
              Welcome!
            </h1>
            <p style={{ margin: '0.3rem 0 0', color: '#bfdbfe', fontSize: '0.9rem' }}>
              BVRIT Hyderabad College of Engineering for Women
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#fff', fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div style={{ color: '#93c5fd', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* ── Live Attendance Stats ── */}
        {stats && (
          <div style={{
            display: 'flex', gap: '1rem', flexWrap: 'wrap',
            marginBottom: '1.5rem', justifyContent: 'center',
          }}>
            <div style={statCardStyle('#6366f1', '#eef2ff')}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#6366f1' }}>{stats.total}</div>
              <div style={statLabelStyle}>Total Students</div>
            </div>
            <div style={statCardStyle('#22c55e', '#f0fdf4')}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#22c55e' }}>{stats.present}</div>
              <div style={statLabelStyle}>Present</div>
            </div>
            <div style={statCardStyle('#ef4444', '#fef2f2')}>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ef4444' }}>{stats.absent}</div>
              <div style={statLabelStyle}>Absent</div>
            </div>
          </div>
        )}

        {/* ── Action Cards ── */}
        <div className="dashboard-grid">
          <div className="card" style={cardStyle}>
            <div style={cardIconStyle('#dbeafe', '#2563eb')}>📷</div>
            <h3 style={cardTitleStyle}>Face Recognition</h3>
            <p style={cardDescStyle}>Upload a classroom photo to automatically detect and mark student attendance</p>
            <button className="btn-primary" disabled={loading}
              onClick={() => { setShowUpload(true); setStatusMsg(''); setAttendanceData(null); }}>
              {loading ? 'Processing...' : 'Upload Image'}
            </button>
          </div>

          <div className="card" style={cardStyle}>
            <div style={cardIconStyle('#dcfce7', '#16a34a')}>📱</div>
            <h3 style={cardTitleStyle}>QR Code Attendance</h3>
            <p style={cardDescStyle}>Generate a QR code for students to scan from their phones — expires in 2 minutes</p>

            {/* Public URL toggle */}
            <div
              onClick={() => setShowNgrok(v => !v)}
              style={{ fontSize: '0.8rem', color: '#2563eb', cursor: 'pointer',
                marginBottom: '0.6rem', userSelect: 'none', fontWeight: 600 }}
            >
              {showNgrok ? '▾' : '▸'} Mobile data / ngrok URLs
            </div>
            {showNgrok && (
              <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Frontend URL  e.g. https://xxxx.ngrok-free.app"
                  value={ngrokFrontend}
                  onChange={e => setNgrokFrontend(e.target.value)}
                  style={ngrokInputStyle}
                />
                <input
                  type="text"
                  placeholder="Backend URL   e.g. https://yyyy.ngrok-free.app"
                  value={ngrokBackend}
                  onChange={e => setNgrokBackend(e.target.value)}
                  style={ngrokInputStyle}
                />
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                  Leave blank to use LAN IP (same-WiFi only).
                </p>
              </div>
            )}
            <button className="btn-primary" onClick={handleGenerateQR}>
              Generate QR Code
            </button>
          </div>

          <div className="card" style={cardStyle}>
            <div style={cardIconStyle('#fef9c3', '#ca8a04')}>✏️</div>
            <h3 style={cardTitleStyle}>Manual Entry</h3>
            <p style={cardDescStyle}>Manually mark students present by entering their roll numbers</p>
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
          <>
            {/* Full modal — only when not loading */}
            {!loading && (
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

            {/* Minimised floating pill — only when loading */}
            {loading && (
              <div style={{
                position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
                background: '#1e3a5f', borderRadius: pipExpanded ? 16 : 50,
                boxShadow: '0 6px 32px rgba(0,0,0,0.32)',
                cursor: 'pointer',
                width: pipExpanded ? 360 : 'auto',
                transition: 'border-radius 0.25s, width 0.25s',
                overflow: 'hidden',
              }}>
                {/* Always-present keyframes so spinner works even when panel is collapsed */}
                <style>{`
                  @keyframes pip-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                  }
                `}</style>

                {/* Pill header row — always visible, click to toggle */}
                <div
                  onClick={() => setPipExpanded(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    padding: '0.72rem 1.1rem', userSelect: 'none',
                  }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    border: '2px solid #3b82f640',
                    borderTop: '2px solid #60a5fa',
                    animation: 'pip-spin 0.9s linear infinite',
                  }} />
                  <span style={{ color: '#e0f2fe', fontSize: '0.88rem', fontWeight: 600, flex: 1, whiteSpace: 'nowrap' }}>
                    Face Recognition Running
                  </span>
                  <span style={{
                    color: '#93c5fd', fontSize: '0.78rem', fontWeight: 600,
                    background: '#ffffff18', borderRadius: 20,
                    padding: '0.15rem 0.55rem',
                  }}>
                    {pipExpanded ? '▾ Hide' : '▴ Details'}
                  </span>
                </div>

                {/* Expanded body — grows upward because pill is anchored to bottom */}
                {pipExpanded && (
                  <div style={{
                    borderTop: '1px solid #ffffff18',
                    background: '#fff',
                    display: 'flex', justifyContent: 'center',
                  }}
                    onClick={e => e.stopPropagation()}>
                    <ProcessingOverlay compact stage={pipStage} progress={pipProgress} />
                  </div>
                )}
              </div>
            )}
          </>
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
const ngrokInputStyle = {
  width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
  borderRadius: 6, fontSize: '0.82rem', boxSizing: 'border-box', color: '#374151',
};
const cardStyle = {
  borderTop: '4px solid #1e3a5f', borderRadius: 12,
  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
};
const cardIconStyle = (bg, color) => ({
  width: 48, height: 48, borderRadius: 12, background: bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '1.5rem', marginBottom: '0.75rem',
});
const cardTitleStyle = { margin: '0 0 0.4rem', fontSize: '1.05rem', fontWeight: 700, color: '#1e3a5f' };
const cardDescStyle  = { color: '#64748b', fontSize: '0.88rem', marginBottom: '1rem', lineHeight: 1.5 };
const statCardStyle = (color, bg) => ({
  flex: '1 1 140px', maxWidth: 180, background: bg, borderRadius: 12,
  padding: '1.25rem 1rem', textAlign: 'center',
  border: `2px solid ${color}30`, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
});
const statLabelStyle = { fontSize: '0.82rem', color: '#64748b', marginTop: '0.3rem', fontWeight: 600, letterSpacing: '0.03em' };

export default Home;
