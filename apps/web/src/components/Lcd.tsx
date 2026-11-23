/** Chiffres de l'écran LCD : les segments éteints (« 88 ») en fond, la valeur allumée par-dessus. */
export function Lcd({
  value,
  ghost = '88',
  size = 46,
  color,
}: {
  value: string | number;
  ghost?: string;
  size?: 46 | 56;
  color?: string;
}) {
  return (
    <span className={`lcd lcd-${size}`}>
      <span className="ghost" aria-hidden="true">
        {ghost}
      </span>
      <span className="live" style={color ? { color } : undefined}>
        {value}
      </span>
    </span>
  );
}
