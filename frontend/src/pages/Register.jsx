import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { authAPI } from '../services/api';

const ALLOWED_DOMAIN = 'bvrithyderabad.edu.in';

const Register = () => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
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
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await authAPI.register({ name: formData.name, email: formData.email, password: formData.password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    try {
      const res = await authAPI.google(credentialResponse.credential);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Google sign-up failed.');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🎓</div>
          <h2 style={{ margin: 0 }}>Faculty Registration</h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.3rem' }}>
            BVRIT Hyderabad — org email only
          </p>
        </div>

        {/* Google Sign-Up */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google sign-up was cancelled or failed.')}
            text="signup_with"
            shape="rectangular"
            logo_alignment="left"
            width="320"
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          ⚠️ Only @{ALLOWED_DOMAIN} accounts will be accepted
        </p>

        <div style={dividerStyle}>
          <span style={dividerLineStyle} />
          <span style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '0 0.75rem' }}>or register with email</span>
          <span style={dividerLineStyle} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" name="name" value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" name="email" placeholder={`you@${ALLOWED_DOMAIN}`}
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" name="password" value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" name="confirmPassword" value={formData.confirmPassword}
              onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} required />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Registering…' : 'Register'}
          </button>
        </form>

        <p className="auth-link" style={{ textAlign: 'center', marginTop: '1rem' }}>
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
};

const dividerStyle     = { display: 'flex', alignItems: 'center', margin: '1.25rem 0' };
const dividerLineStyle = { flex: 1, height: 1, background: '#e2e8f0' };

export default Register;
