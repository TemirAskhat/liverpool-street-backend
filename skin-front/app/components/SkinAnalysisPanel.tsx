"use client";

import { useEffect, useMemo, useState } from "react";

type SkinAnalysisPanelProps = {
  isActive: boolean;
  isCameraOn: boolean;
  statusMessage: string;
};

const CONCERNS = [
  "Acne",
  "Droopy Lower Eyelid",
  "Eye Bag",
  "Moisture",
  "Pore",
  "Redness",
  "Texture",
  "Dark Circles",
  "Droopy Upper Eyelid",
  "Firmness",
  "Oiliness",
  "Radiance",
  "Spots",
  "Wrinkles",
] as const;

const STATUS_UPDATES = [
  "Mapping wrinkle depth vectors…",
  "Scanning micro-inflammation trails…",
  "Measuring pore density gradients…",
  "Evaluating redness chroma balance…",
  "Scoring hydration and oiliness levels…",
] as const;

export const SkinAnalysisPanel = ({ isActive, isCameraOn, statusMessage }: SkinAnalysisPanelProps) => {
  const [activeConcernIndex, setActiveConcernIndex] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [progress, setProgress] = useState(8);
  const [metrics, setMetrics] = useState({
    texture: 0,
    hydration: 0,
    firmness: 0,
  });

  useEffect(() => {
    if (!isActive) {
      setActiveConcernIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setActiveConcernIndex((index) => (index + 1) % CONCERNS.length);
    }, 2000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setStatusIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setStatusIndex((index) => (index + 1) % STATUS_UPDATES.length);
    }, 2600);

    return () => {
      window.clearInterval(timer);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setProgress(isCameraOn ? 32 : 0);
      return;
    }

    const setRandomProgress = () => {
      setProgress(68 + Math.round(Math.random() * 26));
    };

    setRandomProgress();
    const interval = window.setInterval(setRandomProgress, 520);

    return () => window.clearInterval(interval);
  }, [isActive, isCameraOn]);

  useEffect(() => {
    // Only show metrics when camera is on
    if (!isCameraOn) {
      setMetrics({
        texture: 0,
        hydration: 0,
        firmness: 0,
      });
      return;
    }

    if (!isActive) {
      setMetrics({
        texture: 12,
        hydration: 18,
        firmness: 16,
      });
      return;
    }

    const randomiseMetrics = () => {
      setMetrics({
        texture: 62 + Math.round(Math.random() * 24),
        hydration: 48 + Math.round(Math.random() * 22),
        firmness: 70 + Math.round(Math.random() * 18),
      });
    };

    randomiseMetrics();

    const interval = window.setInterval(randomiseMetrics, 900);
    return () => window.clearInterval(interval);
  }, [isActive, isCameraOn]);

  const primaryBadge = useMemo(() => {
    if (isActive) {
      return "Deep scan live";
    }
    if (isCameraOn) {
      return "Scanner ready";
    }
    return "Standby mode";
  }, [isActive, isCameraOn]);

  const subcopy = useMemo(() => {
    if (isActive) {
      return "Micron-level dermatology inference is running in real time.";
    }
    if (isCameraOn) {
      return "Align your face in frame to launch the deep skin scan.";
    }
    return "Enable your camera to initiate the HD skin concern analysis.";
  }, [isActive, isCameraOn]);

  return (
    <aside className={`skin-analysis-panel ${isActive ? "analysis-live" : ""}`}>
      <div className="analysis-header">
        <span className={`analysis-badge ${isActive ? "analysis-badge-live" : ""}`}>{primaryBadge}</span>
        <h3>HD Skin Concern</h3>
        <p className="analysis-subcopy">{subcopy}</p>
      </div>

      <div className="analysis-progress">
        <div className="analysis-progress-labels">
          <span>Signal fidelity</span>
          <span>{progress}%</span>
        </div>
        <div className="analysis-progress-bar">
          <div className="analysis-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="analysis-metrics">
        <div className="analysis-metric">
          <span className="analysis-metric-label">Texture focus</span>
          <span className="analysis-metric-value">{isCameraOn ? metrics.texture : "—"}</span>
        </div>
        <div className="analysis-metric">
          <span className="analysis-metric-label">Hydration signal</span>
          <span className="analysis-metric-value">{isCameraOn ? metrics.hydration : "—"}</span>
        </div>
        <div className="analysis-metric">
          <span className="analysis-metric-label">Firmness index</span>
          <span className="analysis-metric-value">{isCameraOn ? metrics.firmness : "—"}</span>
        </div>
      </div>

      <div className="analysis-status-ticker">
        <span className="analysis-status-glow" aria-hidden="true" />
        <p>{isActive ? STATUS_UPDATES[statusIndex] : statusMessage}</p>
      </div>

      <ul className="analysis-concern-list">
        {CONCERNS.map((concern, index) => {
          const isHighlighted = isActive && index === activeConcernIndex;

          return (
            <li key={concern} className={`analysis-concern ${isHighlighted ? "is-active" : ""}`}>
              <span className="analysis-concern-dot" aria-hidden="true" />
              <span>{concern}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default SkinAnalysisPanel;
