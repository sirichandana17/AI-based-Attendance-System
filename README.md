# 🎓 AI-Based Automated Classroom Attendance System

A full-stack web application for automated classroom attendance using facial recognition and QR code scanning.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![React](https://img.shields.io/badge/react-19.2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## ✨ Features

- **Face Recognition** — Upload classroom photo; system detects all faces and matches them using DeepFace (Facenet512 + RetinaFace) against ChromaDB embeddings
- **QR Code Attendance** — Faculty generates a QR code (2-min expiry); students scan it on their phone and enter their RNO — no login required
- **Manual Attendance** — Faculty enters missed student RNOs (comma/space/newline separated) to mark them present
- **No Student Login** — QR attendance is fully login-free; students only enter their RNO
- **Anti-Proxy Protection** — Duplicate RNO check + device fingerprint (IP + User-Agent hash) per QR session
- **Accuracy Reporting** — Faces detected / matched / unknown / accuracy % after each session
- **Per-Face Debug Table** — Distance score and confidence % for every detected face
- **Excel Report Download** — Full present/absent report for all students
- **Bulk Student Registration** — Faculty registers all students in one click (email = `<rno>@bvrithyderabad.edu.in`, password = RNO)
- **JWT Authentication** — Secure faculty login/register (24-hour tokens)

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Backend | Flask 3.0, DeepFace (Facenet512), RetinaFace, ChromaDB |
| Database | MySQL 8.0+ |
| Auth | PyJWT, Werkzeug |
| Frontend | React 19, Vite, Axios, React Router v7 |
| Reports | Pandas, OpenPyXL |
| QR | qrcode[pil] |

---

## 📁 Project Structure

```
IOMP-Attendance/
├── backend/
│   ├── Dataset/                          # Student face images (one folder per student)
│   │   └── 23wh1a6601/
│   │       └── 23wh1a6601.jpg
│   ├── chroma_db/                        # ChromaDB embeddings (auto-generated)
│   ├── app_chromadb.py                   # Main Flask server
│   ├── generate_embeddings_improved.py   # Build face embeddings (run once)
│   ├── student_list.py                   # ALL_STUDENTS list (70 students)
│   ├── setup_database.sql                # MySQL schema
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── Login.jsx         # Faculty login
        │   ├── Register.jsx      # Faculty register
        │   ├── Home.jsx          # Faculty dashboard (face, QR, manual, register, report)
        │   └── QRScanPage.jsx    # Student QR scan — no login required
        ├── components/
        │   ├── Navbar.jsx        # Top nav with logout
        │   └── ImageUpload.jsx   # Drag-and-drop image uploader
        ├── services/
        │   └── api.js            # Axios API client
        └── App.jsx               # Routes: /, /login, /register, /home, /qr/:token
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 16+
- MySQL 8.0+

### 1. Database Setup
```bash
mysql -u root -p < backend/setup_database.sql
```

### 2. Backend Setup
```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows
source .venv/bin/activate     # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Generate face embeddings — run once, takes ~5-10 min
python -X utf8 generate_embeddings_improved.py

# Start server
python -X utf8 app_chromadb.py
```

Backend runs on: **http://localhost:5000**

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: **http://localhost:5173**

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Faculty registration |
| POST | `/api/auth/login` | Faculty login → JWT token |

### Attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/attendance/upload` | ✅ | Upload image → face recognition |
| POST | `/api/attendance/manual` | ✅ | Manually mark students present |
| GET  | `/api/attendance/report` | ✅ | Download Excel report |

### QR
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/qr/generate` | ✅ | Generate QR code (2 min expiry) |
| GET  | `/api/qr/status/:token` | ✅ | Faculty: who has scanned |
| GET  | `/api/qr/public-status/:token` | ❌ | Student: check QR validity |
| POST | `/api/qr/scan` | ❌ | Student: submit RNO attendance |

### Faculty Utilities
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/faculty/register-students` | ✅ | Bulk register all students |
| GET  | `/api/student/debug` | ✅ | Verify students in DB |
| GET  | `/api/students/list` | ✅ | List all student IDs |
| GET  | `/api/embeddings/validate` | ✅ | Check ChromaDB coverage |

---

## 📸 How Face Attendance Works

1. Faculty clicks **Upload Images** on the dashboard
2. RetinaFace detects all faces in the uploaded photo
3. Each face gets a Facenet512 embedding (512-dim vector)
4. Embedding is L2-normalized and queried against ChromaDB (cosine space)
5. Cosine distance < 0.35 → matched; else → Unknown
6. Results shown with per-face distance, confidence %, and accuracy summary

## 📱 How QR Attendance Works

1. Faculty clicks **Generate QR Code** on dashboard
2. QR encodes a URL: `http://<LAN-IP>:5173/qr/<token>?api=http://<LAN-IP>:5000`
3. Student scans QR with phone camera → browser opens the scan page
4. Student enters their RNO and submits — no login required
5. Backend validates: RNO format, student exists, not duplicate, device not reused
6. Faculty dashboard polls every 3 seconds and shows a live list of who has scanned

## ✍️ How Manual Attendance Works

1. Faculty clicks **Add Manually** on the dashboard
2. Enters one or more RNOs separated by commas, spaces, or new lines
3. Backend validates each RNO against `ALL_STUDENTS` and inserts with `method='manual'`
4. Invalid RNOs are reported back; valid ones are marked present immediately

---

## 🔒 Security

- JWT tokens expire in 24 hours
- QR codes expire in 2 minutes
- Duplicate QR scans blocked per student ID
- Device fingerprint (IP + User-Agent hash) blocks same-device reuse per session
- Passwords hashed with Werkzeug
- Parameterized SQL queries (no SQL injection)
- No student login — eliminates credential-based attack surface for QR flow

---

## ⚠️ Important Notes

- Run `generate_embeddings_improved.py` **once** before first use
- Use `-X utf8` flag on Windows: `python -X utf8 app_chromadb.py`
- For QR on mobile: phone and PC must be on the **same network**; the backend auto-detects your LAN IP
- To use ngrok for public access: set `FRONTEND_URL` and `BACKEND_URL` env vars before starting the backend
- Good lighting improves face recognition accuracy
- RNO format accepted: `23WH1A66xx` (batch 2023) and `24WH5A66xx` (batch 2024)
- Student login has been removed — QR attendance requires only an RNO, no account needed

---

## 📊 Database Schema

### faculty
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| name | VARCHAR(255) |
| email | VARCHAR(255) UNIQUE |
| password | VARCHAR(255) hashed |
| created_at | TIMESTAMP |

### students
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| student_id | VARCHAR(50) UNIQUE |
| email | VARCHAR(255) UNIQUE |
| name | VARCHAR(255) |
| password | VARCHAR(255) hashed |
| created_at | TIMESTAMP |

### attendance
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| student_id | VARCHAR(50) |
| timestamp | TIMESTAMP |
| faculty_id | INT FK |
| method | VARCHAR(20) — `face` / `qr` / `manual` / `hybrid` |

### qr_attendance
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| student_id | VARCHAR(50) |
| qr_token | VARCHAR(100) |
| timestamp | TIMESTAMP |
| faculty_id | INT FK |
