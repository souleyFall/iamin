import { useState, type ReactNode } from 'react';

/** Action destructrice en deux temps (pas de `window.confirm` : rien de bloquant, testable). */
export function ConfirmButton({
  children,
  confirmLabel,
  onConfirm,
  disabled,
  className = 'btn btn-danger',
}: {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {children}
      </button>
    );
  }
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      <button
        type="button"
        className="btn btn-danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" className="btn" onClick={() => setAsking(false)}>
        Non
      </button>
    </span>
  );
}
