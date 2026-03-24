import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authAPI = {
  login:    (credentials) => api.post('/auth/login', credentials),
  register: (userData)    => api.post('/auth/register', userData),
};

export const attendanceAPI = {
  upload: (formData) => api.post('/attendance/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  manual:    (studentIds) => api.post('/attendance/manual', { student_ids: studentIds }),
  getStats:  (sessionIds = []) => api.get('/attendance/stats', {
    params: { session_ids: Array.isArray(sessionIds) ? sessionIds.join(',') : sessionIds },
  }),
  getReport: (method = 'all', sessionIds = []) => api.get('/attendance/report', {
    params: { method, session_ids: Array.isArray(sessionIds) ? sessionIds.join(',') : sessionIds },
    responseType: 'blob',
  }),
};

export const qrAPI = {
  generate: () => api.post('/qr/generate'),
  status:   (token) => api.get(`/qr/status/${token}`),
  statusPublic: (backendUrl, token) =>
    axios.get(`${backendUrl}/api/qr/public-status/${token}`),
  scan: (backendUrl, qrToken, studentId) =>
    axios.post(`${backendUrl}/api/qr/scan`, { qr_token: qrToken, student_id: studentId }),
};

export default api;
