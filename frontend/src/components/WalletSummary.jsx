import React from 'react';
import { Wallet, Volume2, Trash2 } from 'lucide-react';
import { playChime } from '../utils/soundEffects';

export default function WalletSummary({ walletItems, onClearWallet, onSpeakTotal }) {
  const totalAmount = walletItems.reduce((acc, item) => acc + item.value, 0);
  const totalCount = walletItems.length;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleSpeak = () => {
    playChime('click');
    onSpeakTotal(totalAmount, totalCount);
  };

  const handleClear = () => {
    playChime('click');
    if (window.confirm('Reset hitungan dompet uang?')) {
      onClearWallet();
    }
  };

  return (
    <div className="wallet-panel">
      <div className="wallet-info">
        <span className="label-hint" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Wallet size={16} /> Total Dompet
        </span>
        <div className="wallet-total">{formatCurrency(totalAmount)}</div>
        <div className="wallet-count">{totalCount} lembar uang tercatat</div>
      </div>

      <div className="wallet-actions">
        <button
          onClick={handleSpeak}
          className="icon-btn-compact"
          title="Dengarkan Total Uang"
          aria-label="Dengarkan total nominal uang"
        >
          <Volume2 size={20} color="var(--accent-cyan)" />
        </button>

        {totalCount > 0 && (
          <button
            onClick={handleClear}
            className="icon-btn-compact"
            title="Reset Hitungan"
            aria-label="Reset hitungan uang"
          >
            <Trash2 size={18} color="var(--accent-red)" />
          </button>
        )}
      </div>
    </div>
  );
}
