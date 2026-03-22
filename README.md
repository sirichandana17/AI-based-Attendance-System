# 🎓 AI-Based Automated Classroom Attendance System

A full-stack web application for automated classroom attendance using facial recognition and QR code scanning.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![React](https://img.shields.io/badge/react-19.2.0-blue.svg)

---

## ✨ Features

- **Face Recognition** — Upload a classroom photo; system detects all faces and matches them using DeepFace (Facenet512 + RetinaFace) against ChromaDB embeddings
- **QR Code Attendance** — Faculty generates a QR code (2-min expiry); students scan it on their phone and enter their RNO — no login required
- **Manual Attendance** — Faculty enters missed student RNOs (comma / space / newline separated) to mark them present
- **No Student Login** — QR attendance is fully login-free; students only enter their RNO
- **Anti-Proxy Protection** — Duplicate RNO check + device fingerprint (IP + User-Agent hash) per QR session
- **Accuracy Reporting** — Faces detected / matched / unknown / accuracy % shown after each session
- **Per-Face Debug Table** — Cosine distance and confidence % displayed for every detected face
- **Excel Report Download** — Full present/absent report exported for all students
- **Bulk Student Registration** — Faculty registers all 70 students in one click (email = `<rno>@bvrithyderabad.edu.in`, password = RNO)
- **JWT Authentication** — Secure faculty login/register with 24-hour tokens

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
│   ├── chroma_db/                        # ChromaDB embeddings (auto-generated, git-ignored)
│   ├── app_chromadb.py                   # Main Flask server
│   ├── generate_embeddings_improved.py   # Builds face embeddings — run once
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

# Start the server
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
| GET  | `/api/qr/status/:token` | ✅ | Faculty: see who has scanned |
| GET  | `/api/qr/public-status/:token` | ❌ | Student: check if QR is still valid |
| POST | `/api/qr/scan` | ❌ | Student: submit RNO to mark attendance |

### Faculty Utilities
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/faculty/register-students` | ✅ | Bulk register all 70 students |
| GET  | `/api/student/debug` | ✅ | Verify students stored in DB |
| GET  | `/api/students/list` | ✅ | List all student IDs |
| GET  | `/api/embeddings/validate` | ✅ | Check ChromaDB embedding coverage |

---

## 📸 How Face Attendance Works

1. Faculty clicks **Upload Images** on the dashboard
2. RetinaFace detects all faces in the uploaded photo
3. Each face gets a Facenet512 embedding (512-dimensional vector)
4. Embedding is L2-normalized and queried against ChromaDB (cosine space)
5. Cosine distance < 0.35 → matched; else → Unknown
6. Results shown with per-face distance, confidence %, and overall accuracy summary

## 📱 How QR Attendance Works

1. Faculty clicks **Generate QR Code** on the dashboard
2. QR encodes a URL: `http://<LAN-IP>:5173/qr/<token>?api=http://<LAN-IP>:5000`
3. Student scans QR with phone camera → browser opens the scan page
4. Student enters their RNO and submits — no login required
5. Backend validates: RNO format, student exists in system, not a duplicate, device not reused
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
- Duplicate QR scans blocked per student RNO
- Device fingerprint (IP + User-Agent hash) blocks same-device reuse per QR session
- Passwords hashed with Werkzeug (bcrypt)
- Parameterized SQL queries — no SQL injection possible
- No student login — eliminates credential-based attack surface for the QR flow

---

## ⚠️ Important Notes

- **Run embeddings first** — execute `generate_embeddings_improved.py` once before starting the server; this builds the ChromaDB face index (~5–10 min)
- **Windows UTF-8 flag** — always start the backend with `python -X utf8 app_chromadb.py` to avoid emoji/encoding errors from DeepFace logs
- **QR on mobile** — the student's phone and the faculty PC must be on the **same Wi-Fi network**; the backend auto-detects the LAN IP and embeds it in the QR URL
- **ngrok / public access** — set `FRONTEND_URL` and `BACKEND_URL` environment variables before starting the backend to override the auto-detected LAN IP
- **Lighting matters** — good, even lighting significantly improves face recognition accuracy
- **Accepted RNO formats** — `23WH1A66xx` (2023 batch) and `24WH5A66xx` (2024 batch); the regex is `^\d{2}wh[15]a66\d{2}$`
- **Student login removed** — there is no student account login; QR attendance only requires the student to type their RNO
- **DB credentials** — default config uses `root / root` on `localhost`; update `DB_CONFIG` in `app_chromadb.py` if your MySQL setup differs
- **chroma_db is git-ignored** — the embeddings folder is excluded from version control; every developer must run `generate_embeddings_improved.py` locally

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
