# AI-Based Automated Classroom Attendance System - Frontend

## Technology Stack
- React.js (Vite)
- React Router for navigation
- Axios for API calls
- CSS for styling

## Project Structure
```
src/
  components/
    Navbar.jsx
  pages/
    Login.jsx
    Register.jsx
    Home.jsx
  services/
    api.js
  App.jsx
  App.css
  main.jsx
  index.css
```

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Features

### Authentication
- Faculty Login with email/password
- Faculty Registration
- Token-based authentication stored in localStorage
- Protected routes

### Dashboard (Home Page)
- Welcome message for faculty
- Start Attendance button
- Download Excel report
- Attendance status display

## API Endpoints

The frontend connects to these backend endpoints:

- `POST /api/auth/login` - Faculty login
- `POST /api/auth/register` - Faculty registration
- `GET /api/attendance/start` - Start attendance
- `GET /api/attendance/report` - Download attendance report

## Routes

- `/login` - Faculty login page
- `/register` - Faculty registration page
- `/home` - Dashboard (protected route)

## Configuration

Update the API base URL in `src/services/api.js`:
```javascript
const API_BASE_URL = 'http://localhost:5000/api';
```
