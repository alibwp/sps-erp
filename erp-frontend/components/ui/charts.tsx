// Small dependency-free SVG charts matching the reference's area and bar
// charts. Values carry <title> tooltips so hovering shows the exact number.

type Series = { key: string; label: string; color: string };

const WIDTH = 600;

export function AreaChart({
  data,
  xKey,
  series,
  height = 200,
  label,
  format = (value) => String(value),
  max: maxOverride,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series;
  height?: number;
  label: string;
  format?: (value: number) => string;
  max?: number;
}) {
  const padBottom = 24;
  const padTop = 8;
  const values = data.map((point) => Number(point[series.key]));
  const max = maxOverride ?? Math.max(...values, 1);
  const min = Math.min(0, ...values);
  const plotHeight = height - padBottom - padTop;
  const step = data.length > 1 ? WIDTH / (data.length - 1) : WIDTH;
  const y = (value: number) => padTop + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
  const points = values.map((value, index) => [index * step, y(value)] as const);
  const line = points.map(([px, py], index) => `${index ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = `${line} L${WIDTH},${padTop + plotHeight} L0,${padTop + plotHeight} Z`;
  const gradientId = `area-${series.key}`;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="h-auto w-full overflow-visible" role="img" aria-label={label} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={series.color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={series.color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={WIDTH}
            y1={padTop + plotHeight * (1 - fraction)}
            y2={padTop + plotHeight * (1 - fraction)}
            className="stroke-border"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={series.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {points.map(([px, py], index) => (
          <circle key={index} cx={px} cy={py} r={3.5} fill={series.color} className="stroke-background" strokeWidth={1.5} vectorEffect="non-scaling-stroke">
            <title>{`${data[index][xKey]}: ${format(values[index])}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {data.map((point) => (
          <span key={String(point[xKey])}>{point[xKey]}</span>
        ))}
      </div>
    </figure>
  );
}

export function BarChart({
  data,
  xKey,
  series,
  height = 200,
  label,
  format = (value) => String(value),
  showLegend = true,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  height?: number;
  label: string;
  format?: (value: number) => string;
  showLegend?: boolean;
}) {
  const max = Math.max(1, ...data.flatMap((point) => series.map((entry) => Number(point[entry.key]))));

  return (
    <figure className="m-0">
      <div className="flex items-end gap-3" style={{ height }} role="img" aria-label={label}>
        {data.map((point) => (
          <div key={String(point[xKey])} className="flex h-full min-w-0 flex-1 items-end justify-center gap-1">
            {series.map((entry) => {
              const value = Number(point[entry.key]);
              return (
                <div
                  key={entry.key}
                  className="w-full max-w-6 rounded-t-sm transition-opacity hover:opacity-80"
                  style={{ height: `${Math.max(2, (value / max) * 100)}%`, backgroundColor: entry.color }}
                  title={`${point[xKey]} · ${entry.label}: ${format(value)}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        {data.map((point) => (
          <span key={String(point[xKey])} className="min-w-0 flex-1 truncate text-center">
            {point[xKey]}
          </span>
        ))}
      </div>
      {showLegend && (
        <figcaption className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map((entry) => (
            <span key={entry.key} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: entry.color }} aria-hidden />
              {entry.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

export function DonutChart({
  segments,
  label,
  centerLabel,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  label: string;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const radius = 15.9155;
  // Each segment starts where the previous ones end, from 12 o'clock.
  const offsets = segments.map(
    (_, index) => 25 - segments.slice(0, index).reduce((sum, segment) => sum + (segment.value / total) * 100, 0),
  );

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-0" role="img" aria-label={label}>
          <circle cx="21" cy="21" r={radius} fill="transparent" className="stroke-muted" strokeWidth="5" />
          {segments.map((segment, index) => {
            const length = (segment.value / total) * 100;
            return (
              <circle
                key={segment.label}
                cx="21"
                cy="21"
                r={radius}
                fill="transparent"
                stroke={segment.color}
                strokeWidth="5"
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={offsets[index]}
              >
                <title>{`${segment.label}: ${segment.value}`}</title>
              </circle>
            );
          })}
        </svg>
        {centerValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-semibold tabular-nums">{centerValue}</span>
            {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
          </div>
        )}
      </div>
      <ul className="grid gap-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: segment.color }} aria-hidden />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="ml-auto pl-4 font-medium tabular-nums">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
