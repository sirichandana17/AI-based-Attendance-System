import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { qrAPI } from '../services/api';

const RNO_RE = /^\d{2}wh[15]a66\d{2}$/i;

const QRScanPage = () => {
  const { token }      = useParams();
  const [searchParams] = useSearchParams();

  const [status, setStatus]       = useState('checking'); // checking|ready|loading|success|already|expired|error
  const [message, setMessage]     = useState('');
  const [countdown, setCountdown] = useState(null);
  const [rno, setRno]             = useState('');
  const [inputErr, setInputErr]   = useState('');
  const inputRef = useRef(null);

  const backendUrl = searchParams.get('api') || `http://${window.location.hostname}:5000`;

  // Check QR validity on mount
  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid QR code.'); return; }
    const check = async () => {
      try {
        const res = await qrAPI.statusPublic(backendUrl, token);
        if (!res.data.active) {
          setStatus('expired');
          setMessage('This QR code has expired. Ask your faculty to generate a new one.');
        } else {
          setCountdown(res.data.expires_in);
          setStatus('ready');
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      } catch {
        setStatus('error');
        setMessage('Could not reach the server. Check your network connection.');
      }
    };
    check();
  }, [token, backendUrl]);

  // Countdown timer
  useEffect(() => {
    if (status !== 'ready' || countdown === null || countdown <= 0) return;
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(t);
          setStatus('expired');
          setMessage('QR code has expired.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [status, countdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setInputErr('');
    const trimmed = rno.trim().toLowerCase();
    if (!RNO_RE.test(trimmed)) {
      setInputErr('Invalid RNO format. Example: 23wh1a6601');
      return;
    }
    setStatus('loading');
    try {
      const res = await qrAPI.scan(backendUrl, token, trimmed);
      setStatus('success');
      setMessage(res.data.message);
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Try again.';
      if (err.response?.status === 400 && msg.toLowerCase().includes('already')) {
        setStatus('already'); setMessage(msg);
      } else if (err.response?.status === 400 && msg.toLowerCase().includes('device')) {
        setStatus('already'); setMessage(msg);
      } else if (msg.toLowerCase().includes('expired')) {
        setStatus('expired'); setMessage(msg);
      } else {
        setStatus('error'); setMessage(msg);
      }
    }
  };

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.header}>
          <div style={S.logo}>🎓</div>
          <h1 style={S.title}>Attendance System</h1>
          <p style={S.subtitle}>Mark your attendance</p>
        </div>

        {status === 'checking' && (
          <div style={S.center}>
            <div style={S.spinner} />
            <p style={{ color: '#64748b', marginTop: '0.75rem' }}>Verifying QR code...</p>
          </div>
        )}

        {status === 'success' && (
          <div style={S.center}>
            <div style={{ fontSize: '4rem' }}>✅</div>
            <h2 style={{ color: '#16a34a', margin: '0.5rem 0' }}>Attendance Marked!</h2>
            <p style={{ color: '#374151' }}>{message}</p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '0.5rem' }}>You can close this page.</p>
          </div>
        )}

        {status === 'already' && (
          <div style={S.center}>
            <div style={{ fontSize: '3rem' }}>ℹ️</div>
            <h2 style={{ color: '#d97706', margin: '0.5rem 0' }}>Already Marked</h2>
            <p style={{ color: '#64748b' }}>{message}</p>
          </div>
        )}

        {status === 'expired' && (
          <div style={S.center}>
            <div style={{ fontSize: '3rem' }}>⏰</div>
            <h2 style={{ color: '#dc2626', margin: '0.5rem 0' }}>QR Expired</h2>
            <p style={{ color: '#64748b' }}>{message}</p>
          </div>
        )}

        {status === 'error' && (
          <div style={S.center}>
            <div style={{ fontSize: '3rem' }}>❌</div>
            <h2 style={{ color: '#dc2626', margin: '0.5rem 0' }}>Error</h2>
            <p style={{ color: '#64748b' }}>{message}</p>
            <button style={{ ...S.btn, marginTop: '1rem' }}
              onClick={() => { setStatus('ready'); setMessage(''); }}>
              Try Again
            </button>
          </div>
        )}

        {(status === 'ready' || status === 'loading') && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Countdown */}
            {countdown !== null && (
              <div style={{
                ...S.badge,
                background: countdown > 30 ? '#dcfce7' : '#fef3c7',
                color:      countdown > 30 ? '#16a34a' : '#d97706',
              }}>
                ⏱ Expires in {countdown}s
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={S.label}>Enter your Roll Number (RNO)</label>
              <input
                ref={inputRef}
                type="text"
                value={rno}
                onChange={e => { setRno(e.target.value); setInputErr(''); }}
                placeholder="e.g. 23wh1a6601"
                style={{ ...S.input, borderColor: inputErr ? '#ef4444' : '#e2e8f0' }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                disabled={status === 'loading'}
              />
              {inputErr && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: 0 }}>{inputErr}</p>}
            </div>

            <button
              type="submit"
              style={{ ...S.btn, opacity: status === 'loading' ? 0.7 : 1 }}
              disabled={status === 'loading' || !rno.trim()}
            >
              {status === 'loading' ? 'Marking Attendance...' : 'Mark Attendance'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  card: {
    background: '#fff', borderRadius: 16, padding: '2rem',
    width: '100%', maxWidth: 420,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  },
  header:   { textAlign: 'center', marginBottom: '1.5rem' },
  logo:     { fontSize: '3rem', marginBottom: '0.5rem' },
  title:    { fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', margin: 0 },
  subtitle: { color: '#64748b', marginTop: '0.25rem', fontSize: '0.95rem' },
  center:   { textAlign: 'center', padding: '1rem 0' },
  badge: {
    textAlign: 'center', padding: '0.6rem 1rem',
    borderRadius: 8, fontWeight: 600, fontSize: '0.9rem',
  },
  label: { fontWeight: 600, color: '#374151', fontSize: '0.95rem' },
  input: {
    padding: '0.85rem 1rem', border: '2px solid #e2e8f0',
    borderRadius: 8, fontSize: '1rem', outline: 'none', width: '100%',
    boxSizing: 'border-box',
  },
  btn: {
    padding: '0.9rem',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: 10,
    fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
    width: '100%',
  },
  spinner: {
    width: 36, height: 36, margin: '0 auto',
    border: '4px solid #e2e8f0', borderTop: '4px solid #667eea',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('qr-spin-style')) {
  const s = document.createElement('style');
  s.id = 'qr-spin-style';
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}

export default QRScanPage;
