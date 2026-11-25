/**
 * Deterministic isometric cryptographic lattice emblem derived from a public-key fingerprint.
 * When no fingerprint is supplied (unconfigured state), renders an empty calibration wireframe.
 */
export function LatticeKeyVisual({
  fingerprint,
  size = 56,
  dark = true,
}: {
  fingerprint?: string | null;
  size?: number;
  dark?: boolean;
}) {
  const accent = dark ? '#B8F229' : '#2B59C3';
  const stroke = dark ? '#F4F1EA' : '#141412';

  // Derive deterministic vertex flags from fingerprint characters (pure visual distinction, not cryptographic)
  const nodes = [
    { x: 32, y: 8 },
    { x: 54, y: 20 },
    { x: 54, y: 44 },
    { x: 32, y: 56 },
    { x: 10, y: 44 },
    { x: 10, y: 20 },
    { x: 32, y: 20 },
    { x: 44, y: 27 },
    { x: 44, y: 37 },
    { x: 32, y: 44 },
    { x: 20, y: 37 },
    { x: 20, y: 27 },
  ];

  const activeFlags = nodes.map((_, idx) => {
    if (!fingerprint) return false;
    const ch = fingerprint.charCodeAt(idx % fingerprint.length);
    return (ch + idx) % 3 !== 0;
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className="shrink-0"
      aria-label={
        fingerprint
          ? `Visual lattice fingerprint for key ${fingerprint.slice(0, 12)}`
          : 'Unkeyed cryptographic lattice wireframe'
      }
    >
      <polygon
        points="32,8 54,20 54,44 32,56 10,44 10,20"
        stroke={fingerprint ? accent : stroke}
        strokeOpacity={fingerprint ? 0.9 : 0.3}
        strokeWidth="1.25"
      />
      <polygon
        points="32,20 44,27 44,37 32,44 20,37 20,27"
        stroke={stroke}
        strokeOpacity={fingerprint ? 0.5 : 0.2}
        strokeWidth="1"
      />
      <line x1="32" y1="8" x2="32" y2="56" stroke={stroke} strokeOpacity="0.2" strokeWidth="1" />
      <line x1="10" y1="20" x2="54" y2="44" stroke={stroke} strokeOpacity="0.2" strokeWidth="1" />
      <line x1="54" y1="20" x2="10" y2="44" stroke={stroke} strokeOpacity="0.2" strokeWidth="1" />

      {nodes.map((n, i) =>
        activeFlags[i] ? (
          <circle
            key={`${n.x}-${n.y}`}
            cx={n.x}
            cy={n.y}
            r={i < 6 ? 2.2 : 1.7}
            fill={i % 2 === 0 ? accent : stroke}
          />
        ) : null,
      )}
      <circle
        cx="32"
        cy="32"
        r="2.8"
        fill={fingerprint ? accent : 'none'}
        stroke={fingerprint ? accent : stroke}
        strokeOpacity={fingerprint ? 1 : 0.4}
        strokeWidth="1.2"
      />
    </svg>
  );
}
