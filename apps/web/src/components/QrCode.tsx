import QRCode from 'qrcode';
import { useMemo } from 'react';

/**
 * QR code dessiné en SVG dans la page, calculé ici : le secret ne part vers aucun service de QR et
 * la CSP (aucune image en `data:`) n'a pas besoin d'être assouplie.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, cells } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const dark: { x: number; y: number }[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) dark.push({ x, y });
    }
    return { size: n, cells: dark };
  }, [value]);
  const margin = 4; // zone calme exigée par la norme, pour que tous les lecteurs le lisent

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size + margin * 2} ${size + margin * 2}`}
      shapeRendering="crispEdges"
      style={{ width: '100%', maxWidth: 240, background: '#fff', borderRadius: 8 }}
    >
      {cells.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x + margin} y={y + margin} width="1" height="1" fill="#000" />
      ))}
    </svg>
  );
}
