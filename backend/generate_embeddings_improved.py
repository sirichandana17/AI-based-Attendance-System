import os
import sys
import cv2
import numpy as np
import chromadb
from deepface import DeepFace
from student_list import ALL_STUDENTS

# Fix Windows console encoding for emoji in DeepFace logs
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

DATASET_DIR = os.path.join(os.path.dirname(__file__), "Dataset")
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

MODEL_NAME = "Facenet512"
DETECTOR = "retinaface"


def l2_normalize(vec):
    norm = np.linalg.norm(vec)
    return (np.array(vec) / norm).tolist() if norm > 0 else vec


def augment_image(img):
    """Return list of augmented variants of an image."""
    variants = [img]

    # Horizontal flip
    variants.append(cv2.flip(img, 1))

    # Brightness +30
    bright = np.clip(img.astype(np.int32) + 30, 0, 255).astype(np.uint8)
    variants.append(bright)

    # Brightness -30
    dark = np.clip(img.astype(np.int32) - 30, 0, 255).astype(np.uint8)
    variants.append(dark)

    # Rotation +10
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w // 2, h // 2), 10, 1.0)
    variants.append(cv2.warpAffine(img, M, (w, h)))

    # Rotation -10
    M = cv2.getRotationMatrix2D((w // 2, h // 2), -10, 1.0)
    variants.append(cv2.warpAffine(img, M, (w, h)))

    return variants


def get_embedding(img_path, enforce=True):
    """Get L2-normalized Facenet512 embedding from image path."""
    objs = DeepFace.represent(
        img_path=img_path,
        model_name=MODEL_NAME,
        detector_backend=DETECTOR,
        enforce_detection=enforce,
        align=True,
    )
    if objs:
        return l2_normalize(objs[0]["embedding"])
    return None


def generate_embeddings():
    print("Initializing ChromaDB...")
    client = chromadb.PersistentClient(path=CHROMA_DIR)

    try:
        client.delete_collection("face_embeddings")
        print("Cleared existing embeddings.")
    except Exception:
        pass

    collection = client.create_collection(
        name="face_embeddings",
        configuration={"hnsw": {"space": "cosine"}},
    )

    print(f"\nGenerating embeddings with {MODEL_NAME} + {DETECTOR} + augmentation...\n")

    embeddings_list, ids_list, metadatas_list = [], [], []
    success_count = fail_count = 0

    for student_id in ALL_STUDENTS:
        student_dir = os.path.join(DATASET_DIR, student_id)
        if not os.path.isdir(student_dir):
            print(f"[WARN] {student_id}: folder not found")
            fail_count += 1
            continue

        images = [
            f for f in os.listdir(student_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ]
        if not images:
            print(f"[WARN] {student_id}: no images")
            fail_count += 1
            continue

        for img_file in images:
            img_path = os.path.join(student_dir, img_file)
            base_img = cv2.imread(img_path)
            if base_img is None:
                print(f"[WARN] {student_id}: cannot read {img_file}")
                continue

            # Try original first with strict detection
            emb = None
            try:
                emb = get_embedding(img_path, enforce=True)
            except Exception:
                try:
                    emb = get_embedding(img_path, enforce=False)
                except Exception as e:
                    print(f"[FAIL] {student_id}: {str(e).encode('ascii', errors='replace').decode()}")
                    fail_count += 1
                    continue

            if emb is None:
                print(f"[FAIL] {student_id}: no face detected")
                fail_count += 1
                continue

            # Store original
            embeddings_list.append(emb)
            ids_list.append(f"{student_id}_orig")
            metadatas_list.append({"student_id": student_id})
            success_count += 1

            # Augmented variants — save to temp (BGR, cv2 standard), embed, delete
            # DeepFace.represent with detector=retinaface reads BGR→RGB internally — consistent
            for aug_idx, aug_img in enumerate(augment_image(base_img)[1:], 1):
                temp_path = f"_aug_temp_{student_id}_{aug_idx}.jpg"
                cv2.imwrite(temp_path, aug_img)
                try:
                    aug_emb = get_embedding(temp_path, enforce=False)
                    if aug_emb:
                        embeddings_list.append(aug_emb)
                        ids_list.append(f"{student_id}_aug{aug_idx}")
                        metadatas_list.append({"student_id": student_id})
                        success_count += 1
                except Exception:
                    pass
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)

            print(f"[OK] {student_id}: embeddings stored (orig + augmented)")

    if embeddings_list:
        # Batch add in chunks to avoid memory issues
        CHUNK = 100
        for i in range(0, len(embeddings_list), CHUNK):
            collection.add(
                embeddings=embeddings_list[i:i+CHUNK],
                ids=ids_list[i:i+CHUNK],
                metadatas=metadatas_list[i:i+CHUNK],
            )

    print(f"\n{'='*50}")
    print(f"[DONE] Embeddings stored : {len(embeddings_list)}")
    print(f"[DONE] Students success  : {success_count}")
    print(f"[DONE] Students failed   : {fail_count}")
    print(f"[DONE] ChromaDB path     : {CHROMA_DIR}")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    generate_embeddings()
