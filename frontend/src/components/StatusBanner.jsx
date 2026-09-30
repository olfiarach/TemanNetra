import React from 'react';
import { Eye, CheckCircle2, RotateCcw, PauseCircle } from 'lucide-react';

export default function StatusBanner({ scanState, isScanning }) {
  if (!isScanning) {
    return (
      <div className="status-banner">
        <div className="state-badge paused">
          <PauseCircle size={24} />
          <span>Pemindai Dijeda</span>
        </div>
      </div>
    );
  }

  return (
    <div className="status-banner">
      {scanState === 'SEARCHING' && (
        <div className="state-badge searching">
          <Eye size={24} />
          <span>Mencari Uang... Arahkan ke Kamera</span>
        </div>
      )}

      {scanState === 'DETECTED' && (
        <div className="state-badge detected">
          <CheckCircle2 size={24} />
          <span>Uang Terdeteksi!</span>
        </div>
      )}

      {scanState === 'RESETTING' && (
        <div className="state-badge cleared">
          <RotateCcw size={24} />
          <span>Siap Untuk Uang Baru</span>
        </div>
      )}
    </div>
  );
}
