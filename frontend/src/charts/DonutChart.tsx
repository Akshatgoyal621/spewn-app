/* --------------------------- DonutChart --------------------------------
   Very small SVG donut showing relative portions.
   props:
     - data: array of { key, value } where value is percent (0-100)
     - size: px square (default 140)
*/

export function DonutChart({ data, size = 140 }: { data: { key: string; value: number }[]; size?: number }) {
  const radius = size / 2;
  const thickness = Math.max(10, Math.round(size * 0.18));
  const circumference = 2 * Math.PI * (radius - thickness / 2);

  let offset = 0;
  const arcs = data.map((d) => {
    const len = (d.value / 100) * circumference;
    const arc = { ...d, len, offset };
    offset += len;
    return arc;
  });

  const colors = ["#06b6a4", "#0ea5a3", "#f59e0b", "#ec4899", "#3b82f6"];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut chart">
      {/* subtle background ring */}
      <circle cx={radius} cy={radius} r={radius - thickness / 2} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />
      {/* arcs */}
      {arcs.map((a, i) => (
        <circle
          key={a.key}
          cx={radius}
          cy={radius}
          r={radius - thickness / 2}
          fill="none"
          stroke={colors[i % colors.length]}
          strokeWidth={thickness}
          strokeDasharray={`${a.len} ${circumference - a.len}`}
          strokeDashoffset={-a.offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${radius} ${radius})`}
        />
      ))}

      {/* center label */}
      <g transform={`translate(${radius}, ${radius})`} aria-hidden>
        <text textAnchor="middle" dy="-6" className="font-semibold" style={{ fontSize: 14, fill: "#0f172a" }}>
          Total
        </text>
        <text textAnchor="middle" dy="16" className="font-bold" style={{ fontSize: 18, fill: "#06b6a4" }}>
          {data.reduce((s, d) => s + d.value, 0)}%
        </text>
      </g>
    </svg>
  );
}