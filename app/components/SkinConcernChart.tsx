"use client";

import { useMemo, useState } from "react";

type ConcernScore = {
  id: string;
  name: string;
  uiScore: number;
  rawScore: number;
};

type SkinConcernChartProps = {
  concerns: ConcernScore[];
  overallScore: number;
  skinAge: number | null;
};

const CHART_SIZE = 340;
const CHART_RADIUS = 140;
const CHART_CENTER = CHART_SIZE / 2;

const polarToCartesian = (center: number, radius: number, angle: number) => {
  const x = center + radius * Math.cos(angle);
  const y = center + radius * Math.sin(angle);
  return { x, y };
};

const formatScore = (value: number) => Math.round(value);

const SkinConcernChart = ({ concerns, overallScore, skinAge }: SkinConcernChartProps) => {
  const [hoveredPoint, setHoveredPoint] = useState<string | null>(null);

  const derived = useMemo(() => {
    if (!concerns.length) {
      return null;
    }

    const axisCount = concerns.length;
    const axisStep = (Math.PI * 2) / axisCount;

    const axisPoints = concerns.map((concern, index) => {
      const angle = index * axisStep - Math.PI / 2;
      const magnitude = Math.max(0, Math.min(1, concern.uiScore / 100));
      const position = polarToCartesian(CHART_CENTER, CHART_RADIUS * magnitude, angle);
      const axisEnd = polarToCartesian(CHART_CENTER, CHART_RADIUS, angle);
      const labelPosition = polarToCartesian(CHART_CENTER, CHART_RADIUS + 35, angle);

      return {
        ...concern,
        angle,
        magnitude,
        position,
        axisEnd,
        labelPosition,
      };
    });

    const path = axisPoints
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.position.x.toFixed(1)} ${point.position.y.toFixed(1)}`
      )
      .join(" ")
      .concat(" Z");

    const ringLevels = [0.25, 0.5, 0.75, 1];
    const rings = ringLevels.map((level) => {
      const ringPath = Array.from({ length: 36 }, (_, i) => {
        const angle = (i * Math.PI * 2) / 36;
        const ringPosition = polarToCartesian(CHART_CENTER, CHART_RADIUS * level, angle);
        return `${i === 0 ? "M" : "L"} ${ringPosition.x.toFixed(1)} ${ringPosition.y.toFixed(1)}`;
      }).join(" ") + " Z";

      return { level, path: ringPath, score: level * 100 };
    });

    const dominantConcern = axisPoints.reduce((previous, current) => {
      return current.uiScore > previous.uiScore ? current : previous;
    }, axisPoints[0]);

    return {
      path,
      rings,
      points: axisPoints,
      dominantConcern,
    };
  }, [concerns]);

  if (!derived) {
    return null;
  }

  const { rings, path, points, dominantConcern } = derived;

  return (
    <div className="concern-chart-container">
      <div className="concern-chart-main">
        <svg className="concern-chart-svg" viewBox={`0 0 ${CHART_SIZE} ${CHART_SIZE}`} role="img">
          <title>Skin Analysis Results</title>
          <defs>
            <radialGradient id="chart-fill-gradient" cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor="rgba(147, 51, 234, 0.4)" />
              <stop offset="50%" stopColor="rgba(139, 92, 246, 0.3)" />
              <stop offset="100%" stopColor="rgba(168, 85, 247, 0.1)" />
            </radialGradient>
            <linearGradient id="chart-stroke-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9333ea" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#c084fc" />
            </linearGradient>
            <filter id="glow-filter">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background rings */}
          {rings.map((ring, index) => (
            <g key={ring.level}>
              <path
                d={ring.path}
                className="concern-chart-ring"
                strokeDasharray={index === rings.length - 1 ? "none" : "3 5"}
                opacity={0.15 + index * 0.1}
              />
              {/* Ring labels */}
              <text
                x={CHART_CENTER + CHART_RADIUS * ring.level + 10}
                y={CHART_CENTER + 4}
                className="concern-chart-ring-label"
                opacity={0.3}
              >
                {ring.score}
              </text>
            </g>
          ))}

          {/* Axis lines */}
          {points.map((point) => (
            <line
              key={`axis-${point.id}`}
              x1={CHART_CENTER.toFixed(1)}
              y1={CHART_CENTER.toFixed(1)}
              x2={point.axisEnd.x.toFixed(1)}
              y2={point.axisEnd.y.toFixed(1)}
              className="concern-chart-axis"
              opacity={0.15}
            />
          ))}

          {/* Data shape */}
          <path
            d={path}
            className="concern-chart-shape"
            style={{
              filter: "url(#glow-filter)"
            }}
          />

          {/* Data points */}
          {points.map((point) => (
            <g key={`point-${point.id}`}>
              {/* Hover area */}
              <circle
                cx={point.position.x.toFixed(1)}
                cy={point.position.y.toFixed(1)}
                r={20}
                fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredPoint(point.id)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              {/* Visible point */}
              <circle
                cx={point.position.x.toFixed(1)}
                cy={point.position.y.toFixed(1)}
                r={hoveredPoint === point.id ? 8 : 6}
                className="concern-chart-point"
                style={{
                  transform: hoveredPoint === point.id ? "scale(1.2)" : "scale(1)",
                  transformOrigin: `${point.position.x}px ${point.position.y}px`,
                  transition: "all 0.3s ease",
                }}
              />
              {/* Hover tooltip */}
              {hoveredPoint === point.id && (
                <g className="concern-chart-tooltip">
                  <rect
                    x={point.position.x - 30}
                    y={point.position.y - 35}
                    width={60}
                    height={24}
                    rx={4}
                    fill="rgba(15, 23, 42, 0.95)"
                    stroke="rgba(168, 85, 247, 0.5)"
                    strokeWidth={1}
                  />
                  <text
                    x={point.position.x}
                    y={point.position.y - 19}
                    textAnchor="middle"
                    className="concern-chart-tooltip-text"
                  >
                    {formatScore(point.uiScore)}%
                  </text>
                </g>
              )}
            </g>
          ))}

          {/* Labels */}
          {points.map((point) => {
            const isTop = point.angle > -Math.PI && point.angle < 0;
            const labelY = isTop
              ? point.labelPosition.y - 8
              : point.labelPosition.y + 8;

            return (
              <text
                key={`label-${point.id}`}
                x={point.labelPosition.x.toFixed(1)}
                y={labelY.toFixed(1)}
                textAnchor="middle"
                className="concern-chart-label"
                style={{
                  opacity: hoveredPoint === point.id ? 1 : 0.7,
                  transition: "opacity 0.3s ease",
                }}
              >
                <tspan x={point.labelPosition.x.toFixed(1)} dy="0">
                  {point.name}
                </tspan>
                <tspan
                  x={point.labelPosition.x.toFixed(1)}
                  dy="1.2em"
                  className="concern-chart-label-score"
                >
                  {formatScore(point.uiScore)}
                </tspan>
              </text>
            );
          })}
        </svg>

        {/* Center score display */}
        <div className="concern-chart-center-score">
          <span className="concern-chart-center-label">Overall</span>
          <span className="concern-chart-center-value">{formatScore(overallScore)}</span>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="concern-chart-stats">
        <div className="concern-chart-stat">
          <span className="concern-chart-stat-label">Skin Age</span>
          <span className="concern-chart-stat-value">{skinAge ?? "—"}</span>
        </div>
        <div className="concern-chart-stat concern-chart-stat-highlight">
          <span className="concern-chart-stat-label">Primary Concern</span>
          <span className="concern-chart-stat-value">
            {dominantConcern.name}
            <span className="concern-chart-stat-badge">{formatScore(dominantConcern.uiScore)}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

export default SkinConcernChart;