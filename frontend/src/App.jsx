import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Eye, Volume2, Play, Pause, DollarSign, Sparkles } from 'lucide-react';
import ScannerView from './components/ScannerView';
import StatusBanner from './components/StatusBanner';
import WalletSummary from './components/WalletSummary';
import { playBase64Audio, playChime, triggerHaptic } from './utils/soundEffects';

const API_BASE_URL = 'http://127.0.0.1:8000';

const NOMINAL_VALUES = {
  'Satu Ribu': 1000,
  'Dua Ribu': 2000,
  'Lima Ribu': 5000,
  'Sepuluh Ribu': 10000,
  'Dua Puluh Ribu': 20000,
  'Lima Puluh Ribu': 50000,
  'Seratus Ribu': 100000,
};

export default function App() {
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [scanState, setScanState] = useState('SEARCHING'); // 'SEARCHING' | 'DETECTED' | 'RESETTING'
  const [lastDetections, setLastDetections] = useState([]);
  const [boundingBoxes, setBoundingBoxes] = useState([]);
  const [transcript, setTranscript] = useState('Arahkan uang Rupiah ke depan kamera');
  const [lastAudioB64, setLastAudioB64] = useState(null);
  const [walletItems, setWalletItems] = useState([]);

  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const consecutiveEmptyRef = useRef(0);
  const consecutiveMatchCountRef = useRef(0);
  const pendingNotesRef = useRef(null);
  const lastAnnouncedSignatureRef = useRef(null);
  const lastAnnouncedTimeRef = useRef(0);
  const isPlayingAudioRef = useRef(false);
  const scanStateRef = useRef('SEARCHING');

  // Keep state ref in sync
  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  // 1. Health check for FastAPI backend
  useEffect(() => {
    let timer = null;

    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/`, { method: 'GET' });
        if (res.ok) {
          setIsServerOnline(true);
        } else {
          setIsServerOnline(false);
        }
      } catch {
        setIsServerOnline(false);
      }
    }

    checkHealth();
    timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  // 2. Add detected banknote to wallet tally
  const addToWallet = (notes) => {
    const newItems = notes.map((note) => ({
      id: Date.now() + Math.random(),
      name: note,
      value: NOMINAL_VALUES[note] || 0,
      timestamp: new Date().toLocaleTimeString('id-ID'),
    }));

    setWalletItems((prev) => [...newItems, ...prev]);
  };

  // 3. Replay last audio
  const handleReplayAudio = () => {
    playChime('click');
    if (lastAudioB64) {
      isPlayingAudioRef.current = true;
      playBase64Audio(lastAudioB64).finally(() => {
        isPlayingAudioRef.current = false;
      });
    } else {
      speakFallback(transcript);
    }
  };

  // Native Indonesian Speech fallback if needed
  const speakFallback = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.onend = () => {
        isPlayingAudioRef.current = false;
      };
      isPlayingAudioRef.current = true;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Speak wallet summary
  const handleSpeakTotal = (amount, count) => {
    const text =
      count === 0
        ? 'Dompet masih kosong. Belum ada uang yang dipindai.'
        : `Total uang terkumpul adalah ${amount.toLocaleString('id-ID')} rupiah, terdiri dari ${count} lembar uang.`;
    speakFallback(text);
  };

  // 4. Scanner frame processor
  const processFrame = useCallback(async () => {
    if (!isScanning || isProcessingRef.current || !scannerRef.current) {
      return;
    }

    isProcessingRef.current = true;

    try {
      const blob = await scannerRef.current.captureFrameBlob();
      if (!blob) {
        isProcessingRef.current = false;
        return;
      }

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const detectedList = (data.detections || []).filter((note) => NOMINAL_VALUES[note]);
      const detectedBoxes = (data.boxes || []).filter((box) => NOMINAL_VALUES[box.label]);
      const hasDetections = detectedList.length > 0;

      if (hasDetections) {
        consecutiveEmptyRef.current = 0;

        // Compute current detection signature
        const currentSig = [...detectedList].sort().join(',');
        if (currentSig === pendingNotesRef.current) {
          consecutiveMatchCountRef.current += 1;
        } else {
          pendingNotesRef.current = currentSig;
          consecutiveMatchCountRef.current = 1;
        }

        // Detection is confirmed if stable across 2 consecutive frames OR genuine high confidence (>= 0.88)
        const maxConf = Math.max(...detectedBoxes.map((b) => b.confidence || 0), 0);
        const isConfirmed = consecutiveMatchCountRef.current >= 2 || maxConf >= 0.88;

        if (isConfirmed) {
          // Continuously update bounding boxes so overlay tracks banknote movement
          setBoundingBoxes(detectedBoxes);

          const now = Date.now();
          const isSameAsLast = currentSig === lastAnnouncedSignatureRef.current;
          const isWithinLockout = now - lastAnnouncedTimeRef.current < 5000; // 5s lockout for same note

          // Only announce if this is a newly detected note or previous note was cleared
          if (!isSameAsLast || !isWithinLockout || scanStateRef.current !== 'DETECTED') {
            lastAnnouncedSignatureRef.current = currentSig;
            lastAnnouncedTimeRef.current = now;

            setScanState('DETECTED');
            setLastDetections(detectedList);
            setTranscript(data.text);
            setLastAudioB64(data.audio_b64);

            // Audio & haptic cue
            playChime('detected');
            triggerHaptic(100);

            // Prevent audio stacking
            if (data.audio_b64) {
              isPlayingAudioRef.current = true;
              playBase64Audio(data.audio_b64).finally(() => {
                isPlayingAudioRef.current = false;
              });
            } else {
              speakFallback(data.text);
            }

            // Add to wallet tally once
            addToWallet(detectedList);
          }
        }
      } else {
        // No banknote in view
        consecutiveEmptyRef.current += 1;
        consecutiveMatchCountRef.current = 0;
        pendingNotesRef.current = null;

        // Clear bounding boxes when note is absent for 2 cycles
        if (consecutiveEmptyRef.current >= 2) {
          setBoundingBoxes([]);
        }

        // Only reset to SEARCHING when note has genuinely been removed for >= 4 cycles (~3 seconds)
        if (scanStateRef.current === 'DETECTED' && consecutiveEmptyRef.current >= 4) {
          lastAnnouncedSignatureRef.current = null;
          setScanState('RESETTING');
          playChime('ready');
          triggerHaptic(40);

          setTimeout(() => {
            setScanState('SEARCHING');
            setTranscript('Siap memindai uang berikutnya...');
          }, 800);
        }
      }
    } catch (err) {
      console.warn('Frame processing error:', err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [isScanning]);

  // Clear bounding boxes if scanning is paused
  useEffect(() => {
    if (!isScanning) {
      setBoundingBoxes([]);
    }
  }, [isScanning]);

  // 5. Continuous Scanning Tick (every 750ms)
  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
      processFrame();
    }, 750);

    return () => clearInterval(interval);
  }, [isScanning, processFrame]);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-icon">
            <DollarSign size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="brand-title">TemanNetra</h1>
            <div className="brand-tagline">Pemindai Uang Kertas</div>
          </div>
        </div>

        <div className="status-pill" title={isServerOnline ? 'API Terhubung' : 'API Tidak Terhubung'}>
          <span className={`status-dot ${isServerOnline ? 'online' : 'offline'}`} />
          <span>{isServerOnline ? 'AI Aktif' : 'Offline'}</span>
        </div>
      </header>

      {/* Live Scanner Viewport */}
      <ScannerView
        ref={scannerRef}
        isScanning={isScanning}
        isDetected={scanState === 'DETECTED'}
        isReady={scanState === 'RESETTING'}
        boxes={boundingBoxes}
      />

      {/* State Badge */}
      <StatusBanner scanState={scanState} isScanning={isScanning} />

      {/* Main Detection Announcement Card */}
      <section
        className={`detection-card ${scanState === 'DETECTED' ? 'active-note' : ''}`}
        aria-live="polite"
      >
        <div className="label-hint">Hasil Deteksi Suara</div>
        <div className={`spoken-transcript ${scanState === 'SEARCHING' ? 'placeholder' : ''}`}>
          {transcript}
        </div>

        {lastDetections.length > 0 && scanState === 'DETECTED' && (
          <div className="detected-tags">
            {lastDetections.map((note, index) => (
              <span key={index} className="tag-item">
                <Sparkles size={14} style={{ display: 'inline', marginRight: '6px' }} />
                {note}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Running Wallet Counter */}
      <WalletSummary
        walletItems={walletItems}
        onClearWallet={() => setWalletItems([])}
        onSpeakTotal={handleSpeakTotal}
      />

      {/* Instructions Box */}
      <div className="instruction-box">
        <b>Cara Pakai:</b> Pegang uang di depan kamera. Saat uang dilepas, aplikasi akan berbunyi <em>ping</em> dan siap memindai uang berikutnya secara otomatis.
      </div>

      {/* Primary Accessible Controls */}
      <div className="controls-bar">
        <button
          onClick={() => {
            playChime('click');
            setIsScanning((prev) => !prev);
          }}
          className={`action-btn ${isScanning ? 'btn-secondary' : 'btn-primary'}`}
          aria-label={isScanning ? 'Jeda Pemindaian' : 'Mulai Pemindaian'}
        >
          {isScanning ? <Pause size={22} /> : <Play size={22} />}
          <span>{isScanning ? 'Jeda Pindai' : 'Mulai Pindai'}</span>
        </button>

        <button
          onClick={handleReplayAudio}
          className="action-btn btn-primary"
          aria-label="Ulangi Suara Terakhir"
        >
          <Volume2 size={22} />
          <span>Ulangi Suara</span>
        </button>
      </div>
    </div>
  );
}
