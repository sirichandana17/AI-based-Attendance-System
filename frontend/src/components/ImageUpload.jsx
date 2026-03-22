import { useState } from 'react';

const ImageUpload = ({ onUpload, loading }) => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = (files) => {
    const fileArray = Array.from(files);
    const imageFiles = fileArray.filter(file => 
      file.type === 'image/jpeg' || file.type === 'image/jpg' || file.type === 'image/png'
    );

    setSelectedFiles(imageFiles);

    const previewUrls = imageFiles.map(file => URL.createObjectURL(file));
    setPreviews(previewUrls);
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onUpload(selectedFiles);
    }
  };

  const handleClear = () => {
    setSelectedFiles([]);
    setPreviews([]);
  };

  return (
    <div className="upload-container">
      <div
        className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          multiple
          accept="image/jpeg,image/jpg,image/png"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input" className="upload-label">
          <div className="upload-icon">📸</div>
          <p>Drag and drop images here or click to browse</p>
          <p className="upload-hint">Supports: JPG, JPEG, PNG</p>
        </label>
      </div>

      {previews.length > 0 && (
        <div className="preview-section">
          <div className="preview-header">
            <h4>{selectedFiles.length} image(s) selected</h4>
            <button onClick={handleClear} className="btn-clear">Clear</button>
          </div>
          <div className="preview-grid">
            {previews.map((preview, index) => (
              <div key={index} className="preview-item">
                <img src={preview} alt={`Preview ${index + 1}`} />
                <p>{selectedFiles[index].name}</p>
              </div>
            ))}
          </div>
          <button
            onClick={handleUpload}
            className="btn-upload"
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Upload & Process Attendance'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
