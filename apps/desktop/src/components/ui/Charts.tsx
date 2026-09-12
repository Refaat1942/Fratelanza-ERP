/**
 * Small dependency-free chart primitives shared across module detail pages.
 * Inline SVG / CSS only — no charting library — so bundle size stays flat
 * as more modules adopt them.
 */

export function BarChart({
  data,
  valueFormatter,
}: {
  data: Array<{ label: string; value: number }>;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="mini-bar-chart">
      {data.map((d) => (
        <div key={d.label} className="mini-bar-chart__row">
          <span className="mini-bar-chart__label">{d.label}</span>
          <div className="mini-bar-chart__track">
            <div className="mini-bar-chart__fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="mini-bar-chart__value">{valueFormatter ? valueFormatter(d.value) : d.value}</span>
        </div>
      ))}
    </div>
  );
}

export function LineChart({
  points,
  width = 640,
  height = 200,
  formatY,
}: {
  points: Array<{ x: string; y: number; projected?: boolean }>;
  width?: number;
  height?: number;
  formatY?: (value: number) => string;
}) {
  if (points.length === 0) {
    return null;
  }
  const padding = 32;
  const values = points.map((p) => p.y);
  const minY = Math.min(...values, 0);
  const maxY = Math.max(...values, 1);
  const rangeY = maxY - minY || 1;
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padding + i * stepX,
    y: height - padding - ((p.y - minY) / rangeY) * (height - padding * 2),
    projected: p.projected,
  }));

  const actualPath = coords
    .filter((_, i) => !points[i].projected)
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
    .join(' ');

  const firstProjectedIndex = points.findIndex((p) => p.projected);
  const projectedPath =
    firstProjectedIndex > 0
      ? coords
          .slice(firstProjectedIndex - 1)
          .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`)
          .join(' ')
      : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mini-line-chart" role="img" aria-label="Trend chart">
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} className="mini-line-chart__axis" />
      {actualPath && <path d={actualPath} className="mini-line-chart__line mini-line-chart__line--actual" fill="none" />}
      {projectedPath && <path d={projectedPath} className="mini-line-chart__line mini-line-chart__line--projected" fill="none" />}
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={2.5} className={c.projected ? 'mini-line-chart__dot--projected' : 'mini-line-chart__dot'}>
          <title>{`${points[i].x}: ${formatY ? formatY(points[i].y) : points[i].y}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function StepTimeline({
  steps,
}: {
  steps: Array<{ label: string; state: 'done' | 'current' | 'rejected' | 'pending' }>;
}) {
  return (
    <div className="step-timeline">
      {steps.map((step, i) => (
        <div key={i} className={`step-timeline__item step-timeline__item--${step.state}`}>
          <span className="step-timeline__dot" />
          <span className="step-timeline__label">{step.label}</span>
          {i < steps.length - 1 && <span className="step-timeline__connector" />}
        </div>
      ))}
    </div>
  );
}
