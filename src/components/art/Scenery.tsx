import { iconUrl } from '../../data/services';

/* Flat, Balance-style landscape pieces shared by the title screen, the level map, and the canvas zones. */

export function House({ x, y, s = 1, roof = 'var(--roof)' }: { x: number; y: number; s?: number; roof?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-22" y="-4" width="44" height="34" rx="3" fill="#fffaf0" />
      <path d="M-28 -2 L0 -26 L28 -2 Z" fill={roof} strokeLinejoin="round" />
      <rect x="-6" y="12" width="12" height="18" rx="2" fill="var(--roof-2)" opacity="0.75" />
      <rect x="-17" y="5" width="8" height="8" rx="1.5" fill="var(--pond)" />
      <rect x="9" y="5" width="8" height="8" rx="1.5" fill="var(--pond)" />
    </g>
  );
}

export function Tree({ x, y, s = 1, tone = 'var(--meadow-deep)' }: { x: number; y: number; s?: number; tone?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="4" width="6" height="16" rx="2" fill="#8a6a4a" />
      <circle cx="0" cy="-4" r="14" fill={tone} />
      <circle cx="-7" cy="2" r="9" fill={tone} />
      <circle cx="8" cy="1" r="10" fill={tone} />
    </g>
  );
}

export function Bakery({ x, y, s = 1, sign = true }: { x: number; y: number; s?: number; sign?: boolean }) {
  const stripes = Array.from({ length: 8 }, (_, i) => i);
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-60" y="-10" width="120" height="70" rx="4" fill="#fff6e6" />
      <path d="M-70 -8 L0 -52 L70 -8 Z" fill="var(--roof)" />
      <rect x="-10" y="-74" width="14" height="26" fill="var(--roof-2)" />
      {stripes.map((i) => (
        <rect key={i} x={-64 + i * 16} y="2" width="16" height="16" fill={i % 2 ? '#fff' : 'var(--coral)'} />
      ))}
      <path d="M-64 18 Q-56 26 -48 18 Q-40 26 -32 18 Q-24 26 -16 18 Q-8 26 0 18 Q8 26 16 18 Q24 26 32 18 Q40 26 48 18 Q56 26 64 18" fill="#fff" />
      <rect x="-12" y="30" width="24" height="30" rx="3" fill="var(--roof-2)" opacity="0.8" />
      <rect x="-48" y="30" width="26" height="18" rx="3" fill="var(--pond)" />
      <rect x="22" y="30" width="26" height="18" rx="3" fill="var(--pond)" />
      {sign && (
        <g>
          <rect x="-46" y="-34" width="92" height="20" rx="10" fill="var(--ink)" />
          <text x="0" y="-20" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="600" fontSize="12" fill="#fff">
            Crumb &amp; Co.
          </text>
        </g>
      )}
    </g>
  );
}

function CloudPuff({ x, y, s = 1, opacity = 1 }: { x: number; y: number; s?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={opacity}>
      <circle cx="-30" cy="6" r="22" />
      <circle cx="0" cy="-6" r="30" />
      <circle cx="32" cy="6" r="20" />
      <rect x="-52" y="6" width="104" height="22" rx="11" />
    </g>
  );
}

/** Title-screen hero: the town sending glowing requests up to the cloud. */
export function TownScene() {
  const flows = [
    'M190 452 C 220 330, 360 300, 470 236',
    'M560 360 C 560 300, 600 270, 600 240',
    'M930 470 C 900 340, 820 300, 730 236',
    'M360 500 C 380 380, 450 320, 520 244',
  ];
  return (
    <svg className="town-scene" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe7f2" />
          <stop offset="0.75" stopColor="#f7f2e8" />
        </linearGradient>
        <radialGradient id="cloud-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="640" fill="url(#sky)" />
      <circle cx="1040" cy="110" r="46" fill="var(--sun-soft)" />
      <CloudPuff x={160} y={110} s={0.8} opacity={0.7} />
      <CloudPuff x={1000} y={210} s={0.6} opacity={0.6} />

      <path d="M0 420 Q200 340 420 400 T840 380 T1200 396 V640 H0 Z" fill="#c6e0ae" />
      <path d="M0 470 Q300 420 600 462 T1200 452 V640 H0 Z" fill="var(--meadow-2)" />
      <path d="M-20 640 C 200 560, 420 600, 560 430" stroke="var(--road)" strokeWidth="26" fill="none" strokeLinecap="round" />
      <ellipse cx="1010" cy="580" rx="110" ry="30" fill="var(--pond)" />
      <ellipse cx="990" cy="574" rx="60" ry="10" fill="#fff" opacity="0.4" />

      <Tree x={90} y={470} s={1.1} />
      <Tree x={300} y={440} s={0.9} tone="#86b86f" />
      <Tree x={760} y={430} s={1} />
      <Tree x={1130} y={460} s={1.2} tone="#86b86f" />
      <Tree x={680} y={500} s={0.8} />
      <House x={190} y={474} s={1.1} />
      <House x={360} y={520} s={0.9} roof="#e9a05f" />
      <House x={930} y={492} s={1.15} roof="#7c9bc4" />
      <House x={1070} y={420} s={0.8} />
      <Bakery x={560} y={400} s={1.05} />

      {/* the AWS Cloud */}
      <ellipse cx="600" cy="170" rx="300" ry="110" fill="url(#cloud-glow)" />
      <g fill="#fff">
        <circle cx="470" cy="180" r="62" />
        <circle cx="560" cy="128" r="80" />
        <circle cx="670" cy="140" r="70" />
        <circle cx="740" cy="190" r="50" />
        <rect x="420" y="170" width="370" height="76" rx="38" />
      </g>
      {(['s3', 'lambda', 'dynamodb', 'cloudfront', 'apigw'] as const).map((id, i) => (
        <image
          key={id}
          className="float-icon"
          style={{ animationDelay: `${i * 0.6}s` }}
          href={iconUrl(id)}
          x={468 + i * 54}
          y={i % 2 ? 128 : 162}
          width="44"
          height="44"
        />
      ))}

      {flows.map((d, i) => (
        <g key={i}>
          <path d={d} className="flow-dash" stroke="var(--flow)" strokeWidth="4" fill="none" strokeLinecap="round" />
          {[0, 1, 2].map((k) => (
            <circle key={k} r="6" fill="var(--sun)" stroke="#fff" strokeWidth="2">
              <animateMotion dur="2.6s" begin={`${k * 0.87 + i * 0.3}s`} repeatCount="indefinite" path={d} />
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}

/** Smooth path through points (Catmull–Rom → cubic Bézier). */
export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Level-map backdrop: meadow, pond, trees, and the winding road through every stop. */
export function MapScene({ stops, progress }: { stops: { x: number; y: number }[]; progress: number }) {
  const road = smoothPath(stops);
  const done = smoothPath(stops.slice(0, Math.max(1, progress + 1)));
  return (
    <svg className="map-scene" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect width="1000" height="600" rx="40" fill="var(--meadow)" />
      <path d="M0 120 Q160 60 300 110 T620 90 T1000 120 V0 H0 Z" fill="#d9ecc6" />
      <ellipse cx="560" cy="520" rx="120" ry="40" fill="var(--pond)" />
      <ellipse cx="540" cy="512" rx="60" ry="10" fill="#fff" opacity="0.4" />
      <ellipse cx="90" cy="150" rx="70" ry="24" fill="var(--pond)" />
      {[
        [60, 360, 1.1], [420, 120, 0.9], [470, 380, 1], [700, 90, 1.2], [960, 520, 1], [300, 560, 0.9], [930, 260, 0.8], [640, 560, 0.8], [250, 120, 0.9],
      ].map(([x, y, s], i) => (
        <Tree key={i} x={x} y={y} s={s} tone={i % 2 ? '#86b86f' : 'var(--meadow-deep)'} />
      ))}
      <House x={40} y={540} s={0.8} />
      <House x={380} y={480} s={0.7} roof="#e9a05f" />
      <House x={980} y={400} s={0.7} roof="#7c9bc4" />
      <path d={road} stroke="var(--road)" strokeWidth="34" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={road} stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 14" fill="none" strokeLinecap="round" />
      <path d={done} className="flow-dash" stroke="var(--flow)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <Bakery x={stops[stops.length - 1].x + 70} y={stops[stops.length - 1].y - 20} s={0.6} />
    </svg>
  );
}

/** Canvas backdrop for the AWS Cloud: a puffy plateau with the AWS Cloud tag. */
export function CloudZone({ width, height }: { width: number; height: number }) {
  // Overlapping puffs of varied size along the top edge read as one soft cloud.
  const sizes = [58, 44, 52, 40, 60, 46];
  const puffs: { cx: number; cy: number; r: number }[] = [];
  for (let x = 80, i = 0; x < width - 60; x += 92, i++) {
    const r = sizes[i % sizes.length];
    puffs.push({ cx: x, cy: 60 + (62 - r) * 0.6, r });
  }
  return (
    <div className="zone zone-cloud" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <linearGradient id="zone-cloud-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#eaf2f9" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <g fill="url(#zone-cloud-fill)">
          {puffs.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
          ))}
          <rect x="0" y="56" width={width} height={height - 56} rx="56" />
        </g>
      </svg>
      <div className="zone-tag">
        <img src={iconUrl('aws-cloud')} alt="" width={22} height={22} />
        AWS Cloud
      </div>
    </div>
  );
}

export function TownZone({ width, height }: { width: number; height: number }) {
  return (
    <div className="zone zone-town" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <rect x="0" y="0" width={width} height={height} rx="44" fill="var(--meadow)" />
        <path d={`M0 ${height - 90} Q${width / 2} ${height - 140} ${width} ${height - 80} V${height} H0 Z`} fill="var(--meadow-2)" opacity="0.6" />
        <Tree x={width - 34} y={height - 52} s={0.9} />
        <Tree x={28} y={height - 40} s={0.7} tone="#86b86f" />
        <House x={width / 2} y={height - 44} s={0.8} roof="#e9a05f" />
      </svg>
      <div className="zone-tag zone-tag-town">Town</div>
    </div>
  );
}
