import { useNavigate } from 'react-router-dom';

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('facultyName');
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="nav-brand">
        🎓 Attendance System
      </div>
      <div className="nav-links">
        <button onClick={() => navigate('/home')} className="nav-btn">Dashboard</button>
        <button onClick={handleLogout} className="nav-btn logout-btn">Logout</button>
      </div>
    </nav>
  );
};

export default Navbar;
