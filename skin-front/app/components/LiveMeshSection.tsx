"use client";

import { useCallback, useState } from "react";
import FaceMeshView from "./FaceMeshView";
import SkinAnalysisPanel from "./SkinAnalysisPanel";

type FaceMeshState = {
  isCameraOn: boolean;
  hasAnimationStarted: boolean;
  statusMessage: string;
};

const LiveMeshSection = () => {
  const [analysisState, setAnalysisState] = useState<FaceMeshState>({
    isCameraOn: false,
    hasAnimationStarted: false,
    statusMessage: "Loading face mesh...",
  });

  const handleAnalysisStateChange = useCallback((state: FaceMeshState) => {
    setAnalysisState((previous) => {
      if (
        previous.isCameraOn === state.isCameraOn &&
        previous.hasAnimationStarted === state.hasAnimationStarted &&
        previous.statusMessage === state.statusMessage
      ) {
        return previous;
      }

      return state;
    });
  }, []);

  return (
    <section id="live-face-mesh" className="mesh-section">
      <FaceMeshView onAnalysisStateChange={handleAnalysisStateChange} />
      <SkinAnalysisPanel
        isActive={analysisState.hasAnimationStarted}
        isCameraOn={analysisState.isCameraOn}
        statusMessage={analysisState.statusMessage}
      />
    </section>
  );
};

export default LiveMeshSection;
