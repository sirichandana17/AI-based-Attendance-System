import hashlib
import os
import sys
import re
import uuid
import time
import socket
import tempfile
import numpy as np
from datetime import datetime, timedelta
from functools import wraps

import cv2
import jwt
import chromadb
from deepface import DeepFace
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector
from mysql.connector import Error
import pandas as pd
import qrcode
from io import BytesIO
import base64

from student_list import ALL_STUDENTS

# Fix Windows console encoding for DeepFace emoji logs
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR    = os.path.dirname(__file__)
CHROMA_DIR  = os.path.join(DATA_DIR, "chroma_db")
MODEL_NAME  = "Facenet512"
DETECTOR    = "retinaface"
THRESHOLD    = 0.35
QR_TTL_SEC   = 120

def get_local_ip():
    """Get the machine's LAN IP so QR works on phones on the same network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

# Priority: FRONTEND_URL env var (set this to ngrok URL for public access)
# Fallback: auto-detected LAN IP
_local_ip     = get_local_ip()
FRONTEND_URL  = os.environ.get("FRONTEND_URL", f"http://{_local_ip}:5173")
BACKEND_URL   = os.environ.get("BACKEND_URL",  f"http://{_local_ip}:5000")
print(f"[CONFIG] Local IP   : {_local_ip}")
print(f"[CONFIG] Frontend   : {FRONTEND_URL}")
print(f"[CONFIG] Backend    : {BACKEND_URL}")
print(f"[CONFIG] To use ngrok: set FRONTEND_URL and BACKEND_URL env vars before starting")

app = Flask(__name__)
app.config["SECRET_KEY"] = "attendance_secret_key_2026"
CORS(app)

DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "root",
    "database": "attendance_system",
}

# In-memory QR store: {token: {faculty_id, expires_at, scanned_by: {student_id: timestamp}, devices: set()}}
QR_STORE: dict = {}

# ── ChromaDB ──────────────────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)


def get_collection():
    try:
        return chroma_client.get_collection("face_embeddings")
    except Exception:
        return None


# ── Helpers ───────────────────────────────────────────────────────────────────
def l2_normalize(vec):
    arr = np.array(vec, dtype=np.float32)
    norm = np.linalg.norm(arr)
    return (arr / norm).tolist() if norm > 0 else arr.tolist()


def get_db_connection():
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        print(f"[DB ERROR] {e}")
        return None


def init_db():
    conn = get_db_connection()
    if not conn:
        return
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS faculty (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Add email column if upgrading from old schema
    try:
        cur.execute("ALTER TABLE students ADD COLUMN email VARCHAR(255) UNIQUE")
        conn.commit()
        print("[DB] Added 'email' column to students table")
    except Exception:
        pass
    cur.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(50) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            faculty_id INT,
            FOREIGN KEY (faculty_id) REFERENCES faculty(id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS qr_attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id VARCHAR(50) NOT NULL,
            qr_token VARCHAR(100) NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            faculty_id INT,
            FOREIGN KEY (faculty_id) REFERENCES faculty(id)
        )
    """)
    # Add method column if it doesn't exist
    try:
        cur.execute("ALTER TABLE attendance ADD COLUMN method VARCHAR(20) DEFAULT 'face'")
        conn.commit()
        print("[DB] Added 'method' column to attendance table")
    except Exception:
        pass  # Column already exists
    conn.commit()
    cur.close()
    conn.close()


def validate_password(password):
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"
    return True, ""


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth:
            return jsonify({"message": "Token is missing"}), 401
        try:
            tok = auth[7:] if auth.startswith("Bearer ") else auth
            data = jwt.decode(tok, app.config["SECRET_KEY"], algorithms=["HS256"])
            current_user_id = data["user_id"]
        except Exception:
            return jsonify({"message": "Token is invalid"}), 401
        return f(current_user_id, *args, **kwargs)
    return decorated


def student_token_required(f):
    """Decorator for student-authenticated endpoints."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth:
            return jsonify({"message": "Student token is missing"}), 401
        try:
            tok = auth[7:] if auth.startswith("Bearer ") else auth
            data = jwt.decode(tok, app.config["SECRET_KEY"], algorithms=["HS256"])
            if data.get("role") != "student":
                return jsonify({"message": "Invalid student token"}), 401
            current_student_id = data["student_id"]
        except Exception:
            return jsonify({"message": "Token is invalid"}), 401
        return f(current_student_id, *args, **kwargs)
    return decorated


def cosine_similarity(a, b):
    """Explicit cosine similarity between two L2-normalized vectors."""
    a = np.array(a, dtype=np.float32)
    b = np.array(b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# ── Face Recognition Core ─────────────────────────────────────────────────────
def recognize_faces_in_image(img: np.ndarray):
    """
    Detect ALL faces in img using RetinaFace via DeepFace.
    For each face generate a Facenet512 embedding, normalize it,
    query ChromaDB with cosine distance, apply threshold 0.35.

    Returns:
        recognized  – set of matched student_ids
        face_count  – total faces detected
        debug_info  – list of per-face debug dicts
    """
    collection = get_collection()
    if collection is None:
        print("[ERROR] ChromaDB collection not found. Run generate_embeddings_improved.py")
        return set(), 0, []

    # Save full image to temp file so DeepFace can detect all faces
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    cv2.imwrite(tmp_path, img)

    recognized = set()
    debug_info = []
    face_count = 0

    try:
        # extract_faces returns one entry per detected face
        faces_data = DeepFace.extract_faces(
            img_path=tmp_path,
            detector_backend=DETECTOR,
            enforce_detection=False,
            align=True,
        )
        face_count = len(faces_data)
        print(f"\n[DEBUG] Faces detected: {face_count}")

        for i, face_obj in enumerate(faces_data):
            face_arr = face_obj.get("face")  # numpy array (H,W,3) float 0-1
            if face_arr is None:
                continue

            # Convert float [0,1] → uint8 [0,255] and save to temp
            face_uint8 = (face_arr * 255).astype(np.uint8)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as ftmp:
                face_tmp = ftmp.name
            cv2.imwrite(face_tmp, cv2.cvtColor(face_uint8, cv2.COLOR_RGB2BGR))

            try:
                emb_objs = DeepFace.represent(
                    img_path=face_tmp,
                    model_name=MODEL_NAME,
                    detector_backend="skip",   # face already cropped
                    enforce_detection=False,
                    align=False,
                )
                if not emb_objs:
                    continue

                query_emb = l2_normalize(emb_objs[0]["embedding"])

                results = collection.query(
                    query_embeddings=[query_emb],
                    n_results=1,
                    include=["embeddings", "metadatas", "distances"],
                )

                # ChromaDB returns cosine distance (1 - similarity) when space="cosine"
                chroma_distance = results["distances"][0][0]
                meta       = results["metadatas"][0][0]
                student_id = meta["student_id"]

                # Also compute explicit cosine similarity for verification/logging
                stored_emb = results["embeddings"][0][0] if results.get("embeddings") else None
                if stored_emb is not None:
                    similarity = cosine_similarity(query_emb, stored_emb)
                    distance   = round(1.0 - similarity, 4)
                else:
                    similarity = round(1.0 - chroma_distance, 4)
                    distance   = round(chroma_distance, 4)

                print(f"  Face {i+1}: best_match={student_id}  "
                      f"similarity={similarity:.4f}  distance={distance:.4f}  "
                      f"{'MATCH' if distance < THRESHOLD else 'UNKNOWN'}")

                entry = {
                    "face_index": i + 1,
                    "best_match": student_id,
                    "similarity": round(similarity if stored_emb is not None else (1.0 - chroma_distance), 4),
                    "distance": distance,
                    "confidence": round((1.0 - distance) * 100, 1),
                    "matched": distance < THRESHOLD,
                }

                if distance < THRESHOLD and student_id not in recognized:
                    recognized.add(student_id)
                    entry["student_id"] = student_id
                else:
                    entry["student_id"] = "Unknown"

                debug_info.append(entry)

            except Exception as e:
                print(f"  Face {i+1}: embedding error — {e}")
            finally:
                if os.path.exists(face_tmp):
                    os.remove(face_tmp)

    except Exception as e:
        print(f"[ERROR] extract_faces failed: {e}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return recognized, face_count, debug_info


EMAIL_DOMAIN = "bvrithyderabad.edu.in"
RNO_PATTERN  = re.compile(r'^\d{2}wh[15]a66\d{2}$', re.IGNORECASE)


def rno_to_email(rno):
    return f"{rno.lower()}@{EMAIL_DOMAIN}"


def get_device_fingerprint():
    """Hash of client IP + User-Agent — lightweight proxy deterrent."""
    ip  = request.headers.get('X-Forwarded-For', request.remote_addr or '').split(',')[0].strip()
    ua  = request.headers.get('User-Agent', '')
    return hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()[:16]


# ── Faculty: Bulk Register Students ──────────────────────────────────────────
@app.route("/api/faculty/register-students", methods=["POST"])
@token_required
def faculty_register_students(current_user_id):
    """
    Faculty bulk-registers all students from ALL_STUDENTS.
    email = <rno>@bvrithyderabad.edu.in, password = RNO (hashed).
    Skips already-registered students.
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500

    registered, skipped, failed = [], [], []
    cur = conn.cursor()

    for rno in ALL_STUDENTS:
        email = rno_to_email(rno)
        try:
            cur.execute("SELECT id FROM students WHERE student_id = %s", (rno,))
            if cur.fetchone():
                skipped.append(rno)
                continue
            cur.execute(
                "INSERT INTO students (student_id, email, name, password) VALUES (%s, %s, %s, %s)",
                (rno, email, rno.upper(), generate_password_hash(rno)),
            )
            conn.commit()  # commit each row so failures don't block others
            registered.append(rno)
        except Exception as e:
            conn.rollback()
            failed.append({"rno": rno, "error": str(e)})

    cur.close(); conn.close()
    print(f"[BULK REG] registered={len(registered)} skipped={len(skipped)} failed={len(failed)}")

    return jsonify({
        "message": f"Registered {len(registered)} students, {len(skipped)} already existed.",
        "registered": registered,
        "skipped": skipped,
        "failed": failed,
        "total": len(ALL_STUDENTS),
    }), 200


@app.route("/api/student/debug", methods=["GET"])
@token_required
def student_debug(current_user_id):
    """Faculty: verify students are stored correctly in DB."""
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT student_id, email, name, created_at FROM students ORDER BY student_id LIMIT 100")
    rows = cur.fetchall()
    cur.execute("SELECT COUNT(*) AS total FROM students")
    total = cur.fetchone()["total"]
    cur.close(); conn.close()
    # Convert datetime to string for JSON
    for r in rows:
        if r.get("created_at"):
            r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M:%S")
    return jsonify({"total": total, "sample": rows}), 200


# ── Faculty Auth Endpoints ────────────────────────────────────────────────────
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    name, email, password = data.get("name"), data.get("email"), data.get("password")
    if not all([name, email, password]):
        return jsonify({"message": "All fields are required"}), 400
    valid, msg = validate_password(password)
    if not valid:
        return jsonify({"message": msg}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cur = conn.cursor()
    cur.execute("SELECT id FROM faculty WHERE email = %s", (email,))
    if cur.fetchone():
        cur.close(); conn.close()
        return jsonify({"message": "Email already registered"}), 400
    cur.execute(
        "INSERT INTO faculty (name, email, password) VALUES (%s, %s, %s)",
        (name, email, generate_password_hash(password)),
    )
    conn.commit(); cur.close(); conn.close()
    return jsonify({"message": "Registration successful"}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    email, password = data.get("email"), data.get("password")
    if not all([email, password]):
        return jsonify({"message": "Email and password are required"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT * FROM faculty WHERE email = %s", (email,))
    user = cur.fetchone(); cur.close(); conn.close()

    if not user or not check_password_hash(user["password"], password):
        return jsonify({"message": "Invalid email or password"}), 401

    token = jwt.encode(
        {"user_id": user["id"], "email": user["email"],
         "exp": datetime.utcnow() + timedelta(hours=24)},
        app.config["SECRET_KEY"], algorithm="HS256",
    )
    return jsonify({"token": token, "name": user["name"], "email": user["email"]}), 200


# ── Attendance — Image Upload ─────────────────────────────────────────────────
@app.route("/api/attendance/upload", methods=["POST"])
@token_required
def upload_attendance(current_user_id):
    if "images" not in request.files:
        return jsonify({"message": "No images provided"}), 400

    files = request.files.getlist("images")
    if not files:
        return jsonify({"message": "No images selected"}), 400

    if get_collection() is None:
        return jsonify({"message": "Embeddings not found. Run generate_embeddings_improved.py"}), 400

    recognized_students = set()
    total_faces = 0
    all_debug = []

    print(f"\n{'='*60}")
    print(f"Processing {len(files)} image(s)...")

    for idx, file in enumerate(files, 1):
        if not file.filename:
            continue
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if img is None:
            print(f"[WARN] Image {idx}: failed to decode")
            continue

        recognized, face_count, debug_info = recognize_faces_in_image(img)
        recognized_students.update(recognized)
        total_faces += face_count
        all_debug.extend(debug_info)

        matched = [d["student_id"] for d in debug_info if d["matched"]]
        unknown = sum(1 for d in debug_info if not d["matched"])
        print(f"Image {idx}: {face_count} faces | matched={matched} | unknown={unknown}")

    print(f"\nFINAL: {total_faces} faces detected, {len(recognized_students)} students matched")
    print(f"{'='*60}\n")

    # Save to DB
    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        ts = datetime.now()
        for sid in recognized_students:
            cur.execute(
                "INSERT INTO attendance (student_id, faculty_id, timestamp, method) VALUES (%s,%s,%s,'face')",
                (sid, current_user_id, ts),
            )
        conn.commit(); cur.close(); conn.close()

    unknown_count = max(total_faces - len(recognized_students), 0)
    accuracy = round((len(recognized_students) / total_faces * 100), 1) if total_faces > 0 else 0

    return jsonify({
        "message": f"Attendance recorded for {len(recognized_students)} students",
        "students": sorted(recognized_students),
        "total_faces": total_faces,
        "matched_count": len(recognized_students),
        "unknown_count": unknown_count,
        "accuracy": accuracy,
        "debug": all_debug,
    }), 200


# ── QR Attendance ─────────────────────────────────────────────────────────────
@app.route("/api/qr/generate", methods=["POST"])
@token_required
def generate_qr(current_user_id):
    """Faculty generates a QR code. QR encodes a URL that opens the scan page."""
    qr_token = str(uuid.uuid4())
    expires_at = time.time() + QR_TTL_SEC

    QR_STORE[qr_token] = {
        "faculty_id": current_user_id,
        "expires_at": expires_at,
        "scanned_by": {},   # {student_id: "HH:MM:SS"}
        "devices":    set(), # device fingerprints that have submitted
    }

    # QR encodes a URL with backend IP embedded as ?api= param
    # This lets the student's phone POST to the correct backend regardless of network
    scan_url = f"{FRONTEND_URL}/qr/{qr_token}?api={BACKEND_URL}"
    qr_img = qrcode.make(scan_url)
    buf = BytesIO()
    qr_img.save(buf, format="PNG")
    buf.seek(0)
    qr_b64 = base64.b64encode(buf.read()).decode()

    return jsonify({
        "qr_token": qr_token,
        "qr_image": f"data:image/png;base64,{qr_b64}",
        "scan_url": scan_url,
        "backend_url": BACKEND_URL,
        "expires_in": QR_TTL_SEC,
        "message": f"QR code valid for {QR_TTL_SEC} seconds",
    }), 200


@app.route("/api/qr/scan", methods=["POST"])
def scan_qr():
    """No-auth QR scan. Student enters RNO; device fingerprint prevents same-device reuse."""
    data       = request.get_json(force=True, silent=True) or {}
    qr_token   = (data.get("qr_token") or "").strip()
    student_id = (data.get("student_id") or "").strip().lower()

    if not qr_token or not student_id:
        return jsonify({"message": "qr_token and student_id are required"}), 400

    # Validate RNO format
    if not RNO_PATTERN.match(student_id):
        return jsonify({"message": "Invalid RNO format (e.g. 23wh1a6601)"}), 400

    # Validate student exists in system
    matched_id = next((s for s in ALL_STUDENTS if s.lower() == student_id), None)
    if not matched_id:
        return jsonify({"message": "RNO not found in system"}), 400

    entry = QR_STORE.get(qr_token)
    if not entry:
        return jsonify({"message": "Invalid QR code"}), 400
    if time.time() > entry["expires_at"]:
        QR_STORE.pop(qr_token, None)
        return jsonify({"message": "QR code has expired"}), 400

    # Duplicate student check
    if matched_id in entry["scanned_by"]:
        return jsonify({"message": "Attendance already marked for this RNO"}), 400

    # Device fingerprint check — one device per session
    fp = get_device_fingerprint()
    if fp in entry["devices"]:
        return jsonify({"message": "This device has already submitted attendance for this session"}), 400

    entry["scanned_by"][matched_id] = datetime.now().strftime("%H:%M:%S")
    entry["devices"].add(fp)
    print(f"[QR] {matched_id} | fp={fp} | total={len(entry['scanned_by'])}")

    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO qr_attendance (student_id, qr_token, faculty_id) VALUES (%s,%s,%s)",
            (matched_id, qr_token, entry["faculty_id"]),
        )
        cur.execute(
            "INSERT INTO attendance (student_id, faculty_id, method) VALUES (%s,%s,'qr')",
            (matched_id, entry["faculty_id"]),
        )
        conn.commit(); cur.close(); conn.close()

    return jsonify({
        "message": f"Attendance marked for {matched_id}",
        "student_id": matched_id,
        "total_scanned": len(entry["scanned_by"]),
    }), 200


# ── Manual Attendance (Faculty) ───────────────────────────────────────────────────
@app.route("/api/attendance/manual", methods=["POST"])
@token_required
def manual_attendance(current_user_id):
    """Faculty manually marks one or more students as present."""
    data        = request.get_json(force=True, silent=True) or {}
    student_ids = data.get("student_ids") or []
    if isinstance(student_ids, str):
        student_ids = [student_ids]

    added, invalid, already = [], [], []
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500
    cur = conn.cursor()
    ts  = datetime.now()

    for raw in student_ids:
        sid = raw.strip().lower()
        matched = next((s for s in ALL_STUDENTS if s.lower() == sid), None)
        if not matched:
            invalid.append(raw)
            continue
        cur.execute(
            "INSERT INTO attendance (student_id, faculty_id, timestamp, method) VALUES (%s,%s,%s,'manual')",
            (matched, current_user_id, ts),
        )
        added.append(matched)

    conn.commit(); cur.close(); conn.close()
    print(f"[MANUAL] added={added} invalid={invalid}")
    return jsonify({
        "message": f"Manually added {len(added)} student(s).",
        "added": added,
        "invalid": invalid,
    }), 200


# ── QR Public Status ────────────────────────────────────────────────────────────
@app.route("/api/qr/public-status/<qr_token>", methods=["GET"])
def qr_public_status(qr_token):
    """Public endpoint — no auth needed. Used by student's phone to check QR validity."""
    entry = QR_STORE.get(qr_token)
    if not entry:
        return jsonify({"active": False, "message": "Invalid or expired QR"}), 404
    remaining = max(0, int(entry["expires_at"] - time.time()))
    return jsonify({"active": remaining > 0, "expires_in": remaining}), 200


@app.route("/api/qr/status/<qr_token>", methods=["GET"])
@token_required
def qr_status(current_user_id, qr_token):
    """Faculty checks who has scanned the QR."""
    entry = QR_STORE.get(qr_token)
    if not entry:
        return jsonify({"message": "QR not found or expired"}), 404
    remaining = max(0, int(entry["expires_at"] - time.time()))
    return jsonify({
        "scanned_by": sorted(entry["scanned_by"].keys()),
        "scanned_list": [{"student_id": sid, "time": ts} for sid, ts in sorted(entry["scanned_by"].items())],
        "scanned_count": len(entry["scanned_by"]),
        "expires_in": remaining,
        "active": remaining > 0,
    }), 200


# ── Hybrid Attendance (QR + Face) ─────────────────────────────────────────────
@app.route("/api/attendance/hybrid", methods=["POST"])
@token_required
def hybrid_attendance(current_user_id):
    """
    Hybrid: student must appear in face recognition AND have scanned QR.
    Prevents proxy attendance.
    """
    qr_token = request.form.get("qr_token")
    if not qr_token:
        return jsonify({"message": "qr_token is required"}), 400

    entry = QR_STORE.get(qr_token)
    if not entry:
        return jsonify({"message": "Invalid or expired QR token"}), 400

    if "images" not in request.files:
        return jsonify({"message": "No images provided"}), 400

    files = request.files.getlist("images")
    recognized_students = set()
    total_faces = 0
    all_debug = []

    for file in files:
        if not file.filename:
            continue
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        if img is None:
            continue
        recognized, face_count, debug_info = recognize_faces_in_image(img)
        recognized_students.update(recognized)
        total_faces += face_count
        all_debug.extend(debug_info)

    # Intersection: face-recognized AND QR-scanned
    qr_scanned = set(entry["scanned_by"].keys())
    verified = recognized_students & qr_scanned
    face_only = recognized_students - qr_scanned
    qr_only   = qr_scanned - recognized_students

    conn = get_db_connection()
    if conn:
        cur = conn.cursor()
        ts = datetime.now()
        for sid in verified:
            cur.execute(
                "INSERT INTO attendance (student_id, faculty_id, timestamp, method) VALUES (%s,%s,%s,'hybrid')",
                (sid, current_user_id, ts),
            )
        conn.commit(); cur.close(); conn.close()

    return jsonify({
        "message": f"Hybrid attendance: {len(verified)} verified",
        "verified_students": sorted(verified),
        "face_only": sorted(face_only),
        "qr_only": sorted(qr_only),
        "total_faces": total_faces,
        "debug": all_debug,
    }), 200


# ── Report ────────────────────────────────────────────────────────────────────
@app.route("/api/attendance/report", methods=["GET"])
@token_required
def get_report(current_user_id):
    conn = get_db_connection()
    if not conn:
        return jsonify({"message": "Database connection failed"}), 500

    cur = conn.cursor(dictionary=True)
    cur.execute("""
        SELECT student_id, timestamp, method
        FROM attendance
        WHERE faculty_id = %s
        ORDER BY timestamp DESC
        LIMIT 200
    """, (current_user_id,))
    records = cur.fetchall(); cur.close(); conn.close()

    if not records:
        return jsonify({"message": "No attendance records found"}), 404

    recognized = set()
    latest_ts = records[0]["timestamp"]
    for r in records:
        if abs((r["timestamp"] - latest_ts).total_seconds()) < 120:
            recognized.add(r["student_id"])

    rows = []
    for sid in ALL_STUDENTS:
        rows.append({
            "Student_ID": sid,
            "Status": "Present" if sid in recognized else "Absent",
            "Timestamp": latest_ts.strftime("%Y-%m-%d %H:%M:%S") if sid in recognized else "-",
        })

    df = pd.DataFrame(rows)
    excel_path = os.path.join(DATA_DIR, "attendance_report.xlsx")
    with pd.ExcelWriter(excel_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Attendance")
        ws = writer.sheets["Attendance"]
        for col, width in [("A", 15), ("B", 12), ("C", 22)]:
            ws.column_dimensions[col].width = width

    return send_file(excel_path, as_attachment=True, download_name="attendance_report.xlsx")


@app.route("/api/students/list", methods=["GET"])
@token_required
def get_students_list(current_user_id):
    return jsonify({"students": ALL_STUDENTS, "total": len(ALL_STUDENTS)}), 200


@app.route("/api/embeddings/validate", methods=["GET"])
@token_required
def validate_embeddings(current_user_id):
    col = get_collection()
    if col is None:
        return jsonify({"valid": False, "message": "Run generate_embeddings_improved.py"}), 400
    all_data = col.get()
    stored = {m["student_id"] for m in all_data.get("metadatas", [])}
    missing = sorted(set(ALL_STUDENTS) - stored)
    return jsonify({
        "valid": len(missing) == 0,
        "total_students": len(ALL_STUDENTS),
        "stored_students": len(stored),
        "total_embeddings": len(all_data.get("ids", [])),
        "missing_students": missing,
    }), 200


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
