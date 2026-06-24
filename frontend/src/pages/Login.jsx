import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { authAPI } from '../services/api';

const ALLOWED_DOMAIN = 'bvrithyderabad.edu.in';

const Login = () => {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formData.email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      setError(`Only @${ALLOWED_DOMAIN} email addresses are allowed`);
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.login(formData);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('facultyName', res.data.name);
      navigate('/home');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    try {
      const res = await authAPI.google(credentialResponse.credential);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('facultyName', res.data.name);
      navigate('/home');
    } catch (err) {
      setError(err.response?.data?.message || 'Google sign-in failed.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🎓</div>
          <h2 style={{ margin: 0 }}>Faculty Login</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            BVRIT Hyderabad — org email only
          </p>
        </div>

        {/* Google Sign-In */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google sign-in was cancelled or failed.')}
            text="signin_with"
            shape="rectangular"
            logo_alignment="left"
            width="320"
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.25rem' }}>
          ⚠️ Only @{ALLOWED_DOMAIN} accounts will be accepted
        </p>

        <div style={dividerStyle}>
          <span style={dividerLineStyle} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '0 0.75rem' }}>or sign in with email</span>
          <span style={dividerLineStyle} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email" name="email"
              placeholder={`you@${ALLOWED_DOMAIN}`}
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password" name="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Logging in…' : 'Login'}
          </button>
        </form>

        <p className="auth-link" style={{ textAlign: 'center', marginTop: '1rem' }}>
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
};

const dividerStyle     = { display: 'flex', alignItems: 'center', margin: '1.25rem 0' };
const dividerLineStyle = { flex: 1, height: 1, background: '#e2e8f0' };

export default Login;
