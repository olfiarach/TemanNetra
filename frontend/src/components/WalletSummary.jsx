import React from 'react';
import { Wallet, Volume2, Trash2 } from 'lucide-react';

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
    onSpeakTotal(totalAmount, totalCount);
  };

  const handleClear = () => {
    if (window.confirm('Reset hitungan dompet uang?')) {
      onClearWallet();
    }
  };

  return (
    <details className="wallet-panel">
      <summary>
        <Wallet size={22} aria-hidden="true" /> Dompet (sekunder): {formatCurrency(totalAmount)}
      </summary>
      <div className="wallet-body">
        <div>
          <div className="wallet-total">{formatCurrency(totalAmount)}</div>
          <div className="wallet-count">{totalCount} lembar uang tercatat</div>
        </div>

        <div className="wallet-actions">
          <button onClick={handleSpeak} className="icon-btn" title="Dengarkan Total Uang" aria-label="Dengarkan total nominal uang">
            <Volume2 size={24} aria-hidden="true" />
          </button>

          {totalCount > 0 && (
            <button onClick={handleClear} className="icon-btn" title="Reset Hitungan" aria-label="Reset hitungan uang">
              <Trash2 size={24} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
