import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import BoundingBoxOverlay from './BoundingBoxOverlay';

export const CAMERA_MESSAGES = {
  denied: 'Izin kamera ditolak. Izinkan akses kamera di pengaturan browser, lalu tekan Coba Lagi.',
  unavailable: 'Kamera tidak tersedia atau sedang dipakai aplikasi lain.',
  insecure: 'Kamera hanya bisa dipakai lewat HTTPS atau localhost. Buka aplikasi melalui alamat yang aman.',
};

const ScannerView = forwardRef(({ isScanning, isDetected, boxes = [], onCameraStatus }, ref) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const [facingMode, setFacingMode] = useState('environment'); // Default to rear camera for scanning
  const [cameraError, setCameraError] = useState(null); // null | 'denied' | 'unavailable' | 'insecure'
  const [attempt, setAttempt] = useState(0);
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
    let cancelled = false;

    const report = (status) => {
      if (cancelled) return;
      setCameraError(status === 'ready' || status === 'starting' ? null : status);
      setStreamActive(status === 'ready');
      onCameraStatus?.(status);
    };

    async function startCamera() {
      report('starting');
      if (!window.isSecureContext) {
        report('insecure');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        report('unavailable');
        return;
      }
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
            audio: false,
          });
        } catch (constraintErr) {
          if (constraintErr.name === 'NotAllowedError' || constraintErr.name === 'SecurityError') throw constraintErr;
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        report('ready');
      } catch (err) {
        console.warn('Camera error:', err.name);
        report(err.name === 'NotAllowedError' || err.name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode, attempt]);

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
        if (!video || !canvas || !streamActive || video.readyState !== 4) {
          resolve(null);
          return;
        }

        // ponytail: 416 matches the model's imgsz; boxes are normalized so overlay is unaffected
        const srcW = video.videoWidth || 640;
        const srcH = video.videoHeight || 480;
        const scale = Math.min(1, 416 / Math.max(srcW, srcH));
        const width = Math.round(srcW * scale);
        const height = Math.round(srcH * scale);

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          'image/jpeg',
          0.7
        );
      });
    },
  }));

  return (
    <div className="scanner-viewport" ref={viewportRef}>
      {cameraError ? (
        <div className="camera-error">
          <AlertCircle size={48} aria-hidden="true" />
          <p>{CAMERA_MESSAGES[cameraError]}</p>
          {cameraError !== 'insecure' && (
            <button onClick={() => setAttempt((n) => n + 1)} className="action-btn btn-primary">
              Coba Lagi
            </button>
          )}
          {cameraError === 'unavailable' && (
            <button onClick={toggleFacingMode} className="action-btn">
              Coba Kamera Lain
            </button>
          )}
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

          {/* Subtle scanning indicator (hidden under reduced motion) */}
          {isScanning && <div className="scan-line" aria-hidden="true" />}

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
              className="icon-btn"
              title="Ganti Kamera Depan/Belakang"
              aria-label="Ganti Kamera Depan atau Belakang"
            >
              <RefreshCw size={24} aria-hidden="true" />
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
