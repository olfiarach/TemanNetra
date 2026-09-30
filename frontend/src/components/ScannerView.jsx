import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import BoundingBoxOverlay from './BoundingBoxOverlay';

const ScannerView = forwardRef(({ isScanning, isDetected, isReady, boxes = [] }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment'); // Default to rear camera for scanning
  const [cameraError, setCameraError] = useState(null);
  const [streamActive, setStreamActive] = useState(false);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  // Track viewport container size for exact bounding box placement
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const updateSize = () => {
      if (el) {
        setContainerDimensions({
          width: el.clientWidth,
          height: el.clientHeight,
        });
      }
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Update video dimensions when stream metadata becomes available
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  // Initialize camera stream
  useEffect(() => {
    let stream = null;

    async function startCamera() {
      setCameraError(null);
      try {
        if (videoRef.current && videoRef.current.srcObject) {
          const oldTracks = videoRef.current.srcObject.getTracks();
          oldTracks.forEach((track) => track.stop());
        }

        const baseConstraints = {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 24 },
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: baseConstraints,
            audio: false,
          });
        } catch (constraintErr) {
          console.warn('Could not apply exact 24fps max, falling back to ideal 24fps:', constraintErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              ...baseConstraints,
              frameRate: { ideal: 24 },
            },
            audio: false,
          });
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStreamActive(true);
        }
      } catch (err) {
        console.error('Camera access error:', err);
        setCameraError('Izin kamera diperlukan untuk memindai uang. Pastikan browser mengizinkan akses kamera.');
        setStreamActive(false);
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode]);

  // Flip camera between environment (rear) and user (front)
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Expose captureFrame method to parent App
  useImperativeHandle(ref, () => ({
    captureFrameBlob: () => {
      return new Promise((resolve) => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.readyState !== 4) {
          resolve(null);
          return;
        }

        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          'image/jpeg',
          0.85
        );
      });
    },
  }));

  return (
    <div className="scanner-viewport" ref={viewportRef}>
      {cameraError ? (
        <div style={{ padding: '30px', textAlign: 'center', color: '#f87171' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 12px auto' }} />
          <p style={{ fontWeight: 700 }}>{cameraError}</p>
          <button
            onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
            className="action-btn btn-primary"
            style={{ marginTop: '16px', display: 'inline-flex' }}
          >
            Coba Kamera Lain
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={handleLoadedMetadata}
            className="camera-feed"
            aria-label="Tampilan kamera langsung"
          />

          {/* Animated Laser Scanning Beam (active when scanning) */}
          {isScanning && <div className="scanner-laser" />}

          {/* Dynamic Bounding Box Overlay for detected banknotes */}
          <BoundingBoxOverlay
            boxes={boxes}
            containerDimensions={containerDimensions}
            videoDimensions={videoDimensions}
          />

          {/* Target Alignment Guide Overlay (hidden or dimmed when actual banknote bounding box is detected) */}
          <div className={`target-guide ${isDetected ? 'detected' : ''} ${boxes.length > 0 ? 'boxes-active' : ''}`}>
            <span className="guide-corner corner-tl" />
            <span className="guide-corner corner-tr" />
            <span className="guide-corner corner-bl" />
            <span className="guide-corner corner-br" />
          </div>

          {/* Floating Controls on top of camera */}
          <div className="camera-controls-overlay">
            <button
              onClick={toggleFacingMode}
              className="icon-btn-floating"
              title="Ganti Kamera Depan/Belakang"
              aria-label="Ganti Kamera Depan atau Belakang"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </>
      )}

      {/* Hidden canvas for frame extraction */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
});

export default ScannerView;
