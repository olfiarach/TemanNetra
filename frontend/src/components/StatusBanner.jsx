import React from 'react';
import { Eye, AlertTriangle, PauseCircle } from 'lucide-react';

const ICONS = { searching: Eye, error: AlertTriangle, paused: PauseCircle };

// Single polite live region for scanner state and errors. Confirmed results live in their own region in App
// by the app and shown in the result card (not live) so they are not announced twice.
export default function StatusBanner({ status }) {
  const Icon = ICONS[status.tone] || Eye;
  return (
    <div className="status-banner" role="status">
      <div key={status.text} className={`state-badge ${status.tone}`}>
        <Icon size={26} aria-hidden="true" />
        <span>{status.text}</span>
      </div>
    </div>
  );
}
