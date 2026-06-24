# 🎓 AI-Based Automated Classroom Attendance System

A full-stack web application for automated classroom attendance using facial recognition, QR code scanning, and Google OAuth — built for BVRIT Hyderabad College of Engineering for Women.

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)

---

## ✨ Features

- **Face Recognition** — Upload classroom photo; RetinaFace detects all faces, FaceNet512 matches them against ChromaDB embeddings (cosine similarity ≥ 0.50)
- **QR Code Attendance** — Faculty generates a QR code (2-min expiry); students scan on phone and enter RNO — no login required
- **Manual Attendance** — Faculty enters missed RNOs (comma/space/newline separated) to mark present
- **Google OAuth Login** — Sign in / Sign up with Google; restricted to `@bvrithyderabad.edu.in` org emails only
- **Live Attendance Stats** — Real-time dashboard cards: Total / Present / Absent — updates after every action
- **Processing Animation** — Animated PiP (Picture-in-Picture) pill shows face recognition stages while site stays usable
- **No Student Login** — QR attendance is fully login-free; students only enter their RNO
- **Anti-Proxy Protection** — Duplicate RNO check + device fingerprint (IP + User-Agent hash) per QR session
- **Accuracy Reporting** — Faces detected / matched / unknown / accuracy % after each session
- **Per-Face Debug Table** — Distance score and confidence % for every detected face
- **Session-Scoped Excel Report** — Present/absent report filtered strictly to current session IDs; supports method filter (face / qr / manual / all); green/red colour-coded
- **JWT Authentication** — Secure faculty login/register (24-hour tokens)

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| Backend | Flask 3.0, DeepFace (Facenet512), RetinaFace, ChromaDB |
| Database | MySQL 8.0+ |
| Auth | PyJWT, Werkzeug, Google OAuth 2.0 (`google-auth`) |
| Frontend | React 19, Vite, Axios, React Router v7, `@react-oauth/google` |
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
│   ├── student_list.py                   # ALL_STUDENTS list
│   ├── setup_database.sql                # MySQL schema
│   └── requirements.txt
│
└── frontend/
    ├── .env                              # VITE_GOOGLE_CLIENT_ID
    └── src/
        ├── pages/
        │   ├── Login.jsx         # Faculty login (email + Google OAuth)
        │   ├── Register.jsx      # Faculty register (email + Google OAuth)
        │   ├── Home.jsx          # Faculty dashboard (face, QR, manual, stats, report)
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

### 4. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project → **APIs & Services → OAuth consent screen** → External
3. **Credentials → Create OAuth 2.0 Client ID** → Web application
4. Add `http://localhost:5173` to **Authorised JavaScript origins**
5. Copy the Client ID and set it in `frontend/.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   ```
6. The backend has the client ID hardcoded in `app_chromadb.py` (`GOOGLE_CLIENT_ID`)

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Faculty registration (email + password) |
| POST | `/api/auth/login` | Faculty login → JWT token |
| POST | `/api/auth/google` | Google OAuth login/register → JWT token |

### Attendance
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/attendance/upload` | ✅ | Upload image → face recognition |
| POST | `/api/attendance/manual` | ✅ | Manually mark students present |
| GET  | `/api/attendance/report` | ✅ | Download Excel report (params: `session_ids`, `method`) |
| GET  | `/api/attendance/stats`  | ✅ | Live stats: total / present / absent (param: `session_ids`) |

### QR
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/qr/generate` | ✅ | Generate QR code (2 min expiry) |
| GET  | `/api/qr/status/:token` | ✅ | Faculty: who has scanned |
| GET  | `/api/qr/public-status/:token` | ❌ | Student: check QR validity |
| POST | `/api/qr/scan` | ❌ | Student: submit RNO attendance |

### Utilities
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET  | `/api/students/list` | ✅ | List all student IDs |
| GET  | `/api/embeddings/validate` | ✅ | Check ChromaDB coverage |

---

## 📸 How Face Attendance Works

1. Faculty clicks **Upload Image** → modal opens with drag-and-drop uploader
2. After upload, modal closes and a **PiP pill** appears at bottom-right showing live processing stages
3. RetinaFace detects all faces in the photo with landmark-based alignment
4. Each face gets a FaceNet512 embedding (512-dim vector), L2-normalized
5. Queried against ChromaDB (HNSW cosine index) — similarity ≥ 0.50 → matched
6. Results shown with per-face distance, confidence %, and accuracy summary
7. Live stats (Total / Present / Absent) update automatically

## 📱 How QR Attendance Works

1. Faculty clicks **Generate QR Code** on dashboard
2. QR encodes a URL: `http://<LAN-IP>:5173/qr/<token>?api=http://<LAN-IP>:5000`
3. Student scans QR with phone camera → browser opens the scan page
4. Student enters their RNO and submits — no login required
5. Backend validates: RNO format, student exists, not duplicate, device not reused
6. Faculty dashboard polls every 3 seconds — live list of who scanned + stats update

## ✍️ How Manual Attendance Works

1. Faculty clicks **Add Manually** on the dashboard
2. Enters one or more RNOs separated by commas, spaces, or new lines
3. Backend validates each RNO against `ALL_STUDENTS` and inserts with `method='manual'`
4. Invalid RNOs are reported back; valid ones marked present immediately
5. Live stats update after submission

## 📊 How Reports Work

1. Faculty clicks **Download Excel** on the dashboard
2. Report covers **all sessions** from the current page visit (face + QR + manual combined)
3. Disabled until at least one attendance action is performed
4. Filter by method: All / Face / QR / Manual
5. Excel is colour-coded: 🟢 green = Present, 🔴 red = Absent

## 🔐 How Google OAuth Works

1. Faculty clicks **Sign in with Google** on login or register page
2. Google account picker opens — any Google account can be selected
3. Backend decodes the ID token and checks email domain
4. If email does not end with `@bvrithyderabad.edu.in` → **403 rejected**
5. If first time → auto-registered in the faculty table
6. JWT token issued and faculty is logged in

---

## 🔒 Security

- JWT tokens expire in 24 hours
- QR codes expire in 2 minutes
- Google OAuth restricted to `@bvrithyderabad.edu.in` domain (backend enforced)
- Duplicate QR scans blocked per student ID
- Device fingerprint (IP + User-Agent SHA-256 hash) blocks same-device reuse per session
- Passwords hashed with Werkzeug PBKDF2-HMAC-SHA256
- Parameterized SQL queries (no SQL injection)
- No student login — eliminates credential-based attack surface for QR flow

---

## ⚠️ Important Notes

- Run `generate_embeddings_improved.py` **once** before first use
- Use `-X utf8` flag on Windows: `python -X utf8 app_chromadb.py`
- For QR on mobile: phone and PC must be on the **same WiFi network**
- To use ngrok for public access: set `FRONTEND_URL` and `BACKEND_URL` env vars
- Good lighting improves face recognition accuracy significantly
- RNO format accepted: `23WH1A66xx` (batch 2023) and `24WH5A66xx` (batch 2024)
- Students are defined in `student_list.py` — no database registration needed
- If `pydantic` breaks after pip installs, run:
  ```bash
  pip install "pydantic==2.6.4" "pydantic-core==2.16.3" "pydantic-settings==2.2.1"
  ```

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

### attendance
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| student_id | VARCHAR(50) |
| timestamp | TIMESTAMP |
| faculty_id | INT FK |
| method | VARCHAR(20) — `face` / `qr` / `manual` |
| session_id | VARCHAR(36) |

### qr_attendance
| Column | Type |
|---|---|
| id | INT PK AUTO_INCREMENT |
| student_id | VARCHAR(50) |
| qr_token | VARCHAR(100) |
| timestamp | TIMESTAMP |
| faculty_id | INT FK |
