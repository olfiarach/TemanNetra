import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, Play, Pause, Headphones, CheckCircle2, AlertTriangle, Loader } from 'lucide-react';
import ScannerView, { CAMERA_MESSAGES } from './components/ScannerView';
import StatusBanner from './components/StatusBanner';
import WalletSummary from './components/WalletSummary';
import BrandMark from './components/BrandMark';
import { speak, isSpeaking, playChime, triggerHaptic, preloadSpeech } from './utils/soundEffects';
import { loadDetector, detect } from './utils/detector';
import { NOMINAL_VALUES, GUIDANCE, speechFor, initialConfirmation, stepConfirmation, guidanceFor } from './utils/scanLogic';

// Detection runs in the browser (onnxruntime-web); no backend is involved.
const MIN_FRAME_GAP_MS = 150; // ponytail: unmeasured floor between frames; raise if phones overheat
const ERROR_GAP_MS = 750; // backoff after a failed frame
const GUIDANCE_GAP_MS = 3000; // min gap between spoken framing hints
const UNCERTAIN_PROMPT = 'Nominal belum pasti, coba lagi';

const SERVER_LABELS = {
  checking: 'Memuat model',
  unreachable: 'Model gagal diunduh',
  model_unavailable: 'Model pengenal uang tidak tersedia',
  ready: 'Model siap',
};

const formatRupiah = (n) => `Rp${n.toLocaleString('id-ID')}`;

export default function App() {
  const [serverStatus, setServerStatus] = useState('checking'); // checking | unreachable | model_unavailable | ready
  const [cameraStatus, setCameraStatus] = useState('starting'); // starting | ready | denied | unavailable | insecure
  const [audioStatus, setAudioStatus] = useState('unknown'); // unknown | ok | unavailable
  const [startupComplete, setStartupComplete] = useState(false);
  const [splashMounted, setSplashMounted] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [lastResult, setLastResult] = useState(null); // last CONFIRMED note: { label }
  const [hint, setHint] = useState('');
  const [boundingBoxes, setBoundingBoxes] = useState([]);
  const [walletItems, setWalletItems] = useState([]);

  const scannerRef = useRef(null);
  const isProcessingRef = useRef(false);
  const isScanningRef = useRef(false);
  const confirmationRef = useRef(initialConfirmation());
  const lastGuidanceRef = useRef({ text: '', at: 0 });
  const gapRef = useRef(MIN_FRAME_GAP_MS);

  const canScan = cameraStatus === 'ready' && serverStatus === 'ready';
  // Keep the camera mounted while loading; an error must expose the existing retry/error UI.
  useEffect(() => {
    if ((cameraStatus === 'ready' && serverStatus === 'ready') ||
        (cameraStatus !== 'starting' && cameraStatus !== 'ready') ||
        (serverStatus !== 'checking' && serverStatus !== 'ready')) setStartupComplete(true);
  }, [cameraStatus, serverStatus]);
  // Unmount after the CSS exit transition; a timer (not transitionend) also covers reduced motion.
  useEffect(() => {
    if (!startupComplete) return;
    const t = setTimeout(() => setSplashMounted(false), 400);
    return () => clearTimeout(t);
  }, [startupComplete]);

  useEffect(() => {
    isScanningRef.current = isScanning;
    if (!isScanning) setBoundingBoxes([]);
  }, [isScanning]);

  // Pause automatically when scanning cannot work (camera lost, server or model down)
  useEffect(() => {
    if (!canScan) setIsScanning(false);
  }, [canScan]);

  // Fetch every fixed phrase up front so announcements play without a TTS round trip
  useEffect(() => {
    if (serverStatus === 'ready') {
      preloadSpeech([...Object.keys(NOMINAL_VALUES).map(speechFor), ...Object.values(GUIDANCE), UNCERTAIN_PROMPT]);
    }
  }, [serverStatus]);

  // Download and initialise the model once (cached by the browser afterwards)
  useEffect(() => {
    loadDetector(import.meta.env.BASE_URL).then(
      () => setServerStatus('ready'),
      (err) => {
        console.warn('Model load failed:', err);
        setServerStatus(err instanceof TypeError ? 'unreachable' : 'model_unavailable'); // TypeError = network
      }
    );
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
    gapRef.current = MIN_FRAME_GAP_MS;

    try {
      const frame = scannerRef.current.captureFrame();
      if (!frame) return;

      const data = { boxes: await detect(frame) };
      if (!isScanningRef.current) return; // paused while the request was in flight

      const boxes = (data.boxes || []).filter((box) => NOMINAL_VALUES[box.label]);
      setBoundingBoxes(boxes);

      const { state, event } = stepConfirmation(
        confirmationRef.current,
        boxes.map((b) => b.label)
      );
      confirmationRef.current = state;
      if (event) handleEvent(event);
      else {
        // Spoken framing hint; throttled and never cuts off a result announcement
        const tip = guidanceFor(boxes, state);
        const last = lastGuidanceRef.current;
        const now = Date.now();
        if (tip && !isSpeaking() && now - last.at > (tip === last.text ? 2 * GUIDANCE_GAP_MS : GUIDANCE_GAP_MS)) {
          lastGuidanceRef.current = { text: tip, at: now };
          setHint(tip);
          say(tip);
        } else if (!tip && boxes.length === 0) setHint('');
      }
    } catch (err) {
      gapRef.current = ERROR_GAP_MS;
      console.warn('Frame processing error:', err.name);
    } finally {
      isProcessingRef.current = false;
    }
  }, [handleEvent]);

  useEffect(() => {
    if (!isScanning) return;
    let timer;
    let stopped = false;
    const loop = async () => {
      await processFrame();
      if (!stopped && isScanningRef.current) timer = setTimeout(loop, gapRef.current);
    };
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isScanning, processFrame]);

  // One status for the live region. Priority: camera > model download > model > paused > audio > scanning.
  let status;
  if (CAMERA_MESSAGES[cameraStatus]) status = { tone: 'error', text: CAMERA_MESSAGES[cameraStatus] };
  else if (serverStatus === 'unreachable') status = { tone: 'error', text: 'Model gagal diunduh. Periksa koneksi lalu muat ulang halaman.' };
  else if (serverStatus === 'model_unavailable') status = { tone: 'error', text: 'Model pengenal uang tidak tersedia. Pemindaian dinonaktifkan.' };
  else if (cameraStatus === 'starting' || serverStatus === 'checking') status = { tone: 'paused', text: 'Menyiapkan kamera dan model' };
  else if (!isScanning) status = { tone: 'paused', text: 'Pemindai dijeda. Tekan Mulai Pindai.' };
  else if (audioStatus === 'unavailable') status = { tone: 'error', text: 'Suara tidak tersedia. Naikkan volume perangkat lalu tekan Uji Suara.' };
  else if (boundingBoxes.length > 0 && !confirmationRef.current.confirmed) status = { tone: 'searching', text: 'Uang terlihat, memastikan nominal…' };
  else status = { tone: 'searching', text: 'Memindai. Arahkan satu lembar uang ke kamera.' };

  const ServerIcon = serverStatus === 'ready' ? CheckCircle2 : serverStatus === 'checking' ? Loader : AlertTriangle;
  const serverClass = serverStatus === 'ready' ? 'is-ready' : serverStatus === 'checking' ? '' : 'is-error';
  const noteValue = lastResult ? NOMINAL_VALUES[lastResult.label] : null;

  return (
    <>
      {splashMounted && (
        <section className={`splash${startupComplete ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-hidden={startupComplete || undefined}>
          <div className="splash-content">
            <BrandMark className="splash-mark" aria-hidden="true" />
            <h2>TemanNetra</h2>
            <p>Menyiapkan pemindai</p>
            <p>{SERVER_LABELS[serverStatus]} · {cameraStatus === 'ready' ? 'Kamera siap' : 'Menyiapkan kamera'}</p>
          </div>
        </section>
      )}
      <div className="app-container" inert={startupComplete ? undefined : ''}>
      <header className="app-header">
        <h1 className="brand-title">
          <BrandMark size={40} className="brand-mark" aria-hidden="true" replayOnInteract={false} />
          Teman<span>Netra</span>
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
            <p className="result-amount" key={noteValue}>{formatRupiah(noteValue)}</p>
            <p className="result-words" key={`w${noteValue}`}>{lastResult.label} Rupiah</p>
          </>
        ) : (
          <p className="result-amount is-empty">Belum ada hasil</p>
        )}
        {hint && <p className="result-hint">{hint}</p>}
      </section>

      <p className="result-hint">Demo eksperimental. Bukan alat verifikasi keaslian atau nilai uang.</p>

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
    </>
  );
}
