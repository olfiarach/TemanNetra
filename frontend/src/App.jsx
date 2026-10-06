import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Play, Pause, Banknote, Headphones, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import ScannerView, { CAMERA_MESSAGES } from './components/ScannerView';
import StatusBanner from './components/StatusBanner';
import WalletSummary from './components/WalletSummary';
import { speak, playChime, triggerHaptic } from './utils/soundEffects';
import { NOMINAL_VALUES, speechFor, initialConfirmation, stepConfirmation } from './utils/scanLogic';

// Relative URLs: the UI and API share one origin (Vite proxy in dev, reverse proxy in deployment).
const FRAME_INTERVAL_MS = 750;
const REQUEST_TIMEOUT_MS = 8000;
const UNCERTAIN_PROMPT = 'Nominal belum pasti, coba lagi';

const SERVER_LABELS = {
  checking: 'Memeriksa server',
  unreachable: 'Server tidak terhubung',
  model_unavailable: 'Model pengenal uang tidak tersedia',
  ready: 'Server siap',
};

const formatRupiah = (n) => `Rp${n.toLocaleString('id-ID')}`;

export default function App() {
  const [serverStatus, setServerStatus] = useState('checking'); // checking | unreachable | model_unavailable | ready
  const [cameraStatus, setCameraStatus] = useState('starting'); // starting | ready | denied | unavailable | insecure
  const [audioStatus, setAudioStatus] = useState('unknown'); // unknown | ok | unavailable
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState(null); // last CONFIRMED note: { label }
  const [hint, setHint] = useState('');
  const [boundingBoxes, setBoundingBoxes] = useState([]);
  const [walletItems, setWalletItems] = useState([]);

  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isScanningRef = useRef(false);
  const confirmationRef = useRef(initialConfirmation());

  const canScan = cameraStatus === 'ready' && serverStatus === 'ready';

  useEffect(() => {
    isScanningRef.current = isScanning;
    if (!isScanning) setBoundingBoxes([]);
  }, [isScanning]);

  // Pause automatically when scanning cannot work (camera lost, server or model down)
  useEffect(() => {
    if (!canScan) setIsScanning(false);
  }, [canScan]);

  // Health check (also reports model readiness)
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch('/health', { signal: AbortSignal.timeout(4000) });
        if (!res.ok) throw new Error(`health ${res.status}`);
        const data = await res.json();
        setServerStatus(data.model_ready ? 'ready' : 'model_unavailable');
      } catch {
        setServerStatus('unreachable');
      }
    }
    checkHealth();
    const timer = setInterval(checkHealth, 5000);
    return () => clearInterval(timer);
  }, []);

  // Speak and record whether audio actually worked ('interrupted' by newer speech is neutral)
  const say = useCallback((text) => {
    speak(text).then(
      (result) => result === 'done' && setAudioStatus('ok'),
      () => setAudioStatus('unavailable')
    );
  }, []);

  const handleTestAudio = () => say('Tes suara.');
  const handleRepeat = () => say(lastResult ? speechFor(lastResult.label) : 'Belum ada hasil.');

  const handleToggleScan = () => {
    if (isScanning) {
      setIsScanning(false);
      say('Pemindaian dijeda.');
      return;
    }
    confirmationRef.current = initialConfirmation();
    setHint('');
    setIsScanning(true);
    // The click is the user gesture that lets the browser start speech
    say('Pemindaian dimulai. Arahkan satu lembar uang ke kamera.');
  };

  const handleSpeakTotal = (amount, count) =>
    say(
      count === 0
        ? 'Dompet masih kosong.'
        : `Total ${amount.toLocaleString('id-ID')} rupiah, ${count} lembar.`
    );

  const handleEvent = useCallback(
    (event) => {
      if (event.type === 'confirmed') {
        setLastResult({ label: event.label });
        setHint('');
        say(speechFor(event.label));
        triggerHaptic(100);
        setWalletItems((prev) => [
          {
            id: Date.now() + Math.random(),
            name: event.label,
            value: NOMINAL_VALUES[event.label],
            timestamp: new Date().toLocaleTimeString('id-ID'),
          },
          ...prev,
        ]);
      } else if (event.type === 'cleared') {
        setHint('');
        playChime('ready');
        triggerHaptic(40);
      } else if (event.type === 'uncertain') {
        setHint(UNCERTAIN_PROMPT);
        say(UNCERTAIN_PROMPT);
      }
    },
    [say]
  );

  const processFrame = useCallback(async () => {
    if (!isScanningRef.current || isProcessingRef.current || !scannerRef.current) return;
    isProcessingRef.current = true;

    try {
      const blob = await scannerRef.current.captureFrameBlob();
      if (!blob) return;

      const formData = new FormData();
      formData.append('file', blob, 'frame.jpg');

      let response;
      try {
        response = await fetch('/predict', { method: 'POST', body: formData, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch {
        setServerStatus('unreachable');
        return;
      }
      if (response.status === 503) {
        setServerStatus('model_unavailable');
        return;
      }
      if (response.status >= 500) {
        setServerStatus('unreachable');
        return;
      }
      if (!response.ok) {
        console.warn('Frame rejected:', response.status); // bad frame: skip, keep scanning
        return;
      }

      const data = await response.json();
      if (!isScanningRef.current) return; // paused while the request was in flight

      const boxes = (data.boxes || []).filter((box) => NOMINAL_VALUES[box.label]);
      setBoundingBoxes(boxes);

      const { state, event } = stepConfirmation(
        confirmationRef.current,
        boxes.map((b) => b.label)
      );
      confirmationRef.current = state;
      if (event) handleEvent(event);
    } catch (err) {
      console.warn('Frame processing error:', err.name);
    } finally {
      isProcessingRef.current = false;
    }
  }, [handleEvent]);

  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(processFrame, FRAME_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isScanning, processFrame]);

  // One status for the live region. Priority: camera > server > model > paused > audio > scanning.
  let status;
  if (CAMERA_MESSAGES[cameraStatus]) status = { tone: 'error', text: CAMERA_MESSAGES[cameraStatus] };
  else if (serverStatus === 'unreachable') status = { tone: 'error', text: 'Server tidak terhubung. Pemindaian dihentikan.' };
  else if (serverStatus === 'model_unavailable') status = { tone: 'error', text: 'Model pengenal uang tidak tersedia. Pemindaian dinonaktifkan.' };
  else if (cameraStatus === 'starting' || serverStatus === 'checking') status = { tone: 'paused', text: 'Menyiapkan kamera dan server' };
  else if (!isScanning) status = { tone: 'paused', text: 'Pemindai dijeda. Tekan Mulai Pindai.' };
  else if (audioStatus === 'unavailable') status = { tone: 'error', text: 'Suara tidak tersedia. Naikkan volume perangkat lalu tekan Uji Suara.' };
  else status = { tone: 'searching', text: 'Memindai. Arahkan satu lembar uang ke kamera.' };

  const ServerIcon = serverStatus === 'ready' ? CheckCircle2 : serverStatus === 'checking' ? Loader : AlertTriangle;
  const serverClass = serverStatus === 'ready' ? 'is-ready' : serverStatus === 'checking' ? '' : 'is-error';
  const noteValue = lastResult ? NOMINAL_VALUES[lastResult.label] : null;

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="brand-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Banknote size={28} aria-hidden="true" /> TemanNetra
        </h1>
        <div className={`server-status ${serverClass}`}>
          <ServerIcon size={20} aria-hidden="true" />
          <span>{SERVER_LABELS[serverStatus]}</span>
        </div>
      </header>

      <ScannerView
        ref={scannerRef}
        isScanning={isScanning}
        isDetected={boundingBoxes.length > 0}
        boxes={boundingBoxes}
        onCameraStatus={setCameraStatus}
      />

      {/* Hero: last confirmed note. Single polite live region for results. */}
      <section className="result" data-note={noteValue || undefined} aria-label="Hasil terakhir" aria-live="polite" aria-atomic="true">
        <p className="result-caption">Hasil terakhir</p>
        {lastResult ? (
          <>
            <p className="result-amount">{formatRupiah(noteValue)}</p>
            <p className="result-words">{lastResult.label} Rupiah</p>
          </>
        ) : (
          <p className="result-amount is-empty">Belum ada hasil</p>
        )}
        {hint && <p className="result-hint">{hint}</p>}
      </section>

      <StatusBanner status={status} />

      <WalletSummary
        walletItems={walletItems}
        onClearWallet={() => setWalletItems([])}
        onSpeakTotal={handleSpeakTotal}
      />

      <div className="controls-bar">
        <button
          onClick={handleToggleScan}
          disabled={!isScanning && !canScan}
          aria-disabled={!isScanning && !canScan}
          className={`action-btn btn-scan ${isScanning ? '' : 'btn-primary'}`}
        >
          {isScanning ? <Pause size={28} aria-hidden="true" /> : <Play size={28} aria-hidden="true" />}
          <span>{isScanning ? 'Jeda Pindai' : 'Mulai Pindai'}</span>
        </button>

        <button onClick={handleTestAudio} className="action-btn">
          <Headphones size={24} aria-hidden="true" />
          <span>Uji Suara</span>
        </button>

        <button onClick={handleRepeat} className="action-btn">
          <Volume2 size={24} aria-hidden="true" />
          <span>Ulangi</span>
        </button>
      </div>
    </div>
  );
}
