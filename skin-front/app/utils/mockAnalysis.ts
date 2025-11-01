"use client";

type RawConcernScore = {
  raw_score: number;
  ui_score: number;
  output_mask_name: string;
};

type RawScoreInfo = {
  redness: RawConcernScore;
  pore: RawConcernScore;
  droopy_lower_eyelid: RawConcernScore;
  acne: RawConcernScore;
  all: {
    score: number;
  };
  skin_age: number;
};

const RAW_SCORE_INFO: RawScoreInfo = {
  redness: {
    raw_score: 74.04264831542969,
    ui_score: 78,
    output_mask_name: "redness_output.png",
  },
  pore: {
    raw_score: 99.9281793832779,
    ui_score: 99,
    output_mask_name: "pore_output.png",
  },
  droopy_lower_eyelid: {
    raw_score: 49.384915828704834,
    ui_score: 67,
    output_mask_name: "droopy_lower_eyelid_output.png",
  },
  acne: {
    raw_score: 100,
    ui_score: 99,
    output_mask_name: "acne_output.png",
  },
  all: {
    score: 85.75,
  },
  skin_age: 23,
};

const CONCERN_LABELS: Record<keyof RawScoreInfo, string> = {
  redness: "Redness",
  pore: "Pore",
  droopy_lower_eyelid: "Lower Eyelid",
  acne: "Acne",
  all: "Overall",
  skin_age: "Skin Age",
};

export type SimulatedAnalysisConcern = {
  id: string;
  name: string;
  uiScore: number;
  rawScore: number;
  outputMaskName: string;
};

export type SimulatedAnalysisResult = {
  concerns: SimulatedAnalysisConcern[];
  overallScore: number;
  skinAge: number | null;
};

const formatConcernId = (key: keyof RawScoreInfo) => key.replace(/_/g, "-");

export const simulateSkinAnalysis = (delayMs = 5000): Promise<SimulatedAnalysisResult> => {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      const concerns: SimulatedAnalysisConcern[] = Object.entries(RAW_SCORE_INFO)
        .filter(([key]) => key !== "all" && key !== "skin_age")
        .map(([key, value]) => {
          const raw = value as RawConcernScore;
          const concernKey = key as keyof RawScoreInfo;
          return {
            id: formatConcernId(concernKey),
            name: CONCERN_LABELS[concernKey] ?? concernKey,
            uiScore: raw.ui_score,
            rawScore: raw.raw_score,
            outputMaskName: raw.output_mask_name,
          };
        });

      resolve({
        concerns,
        overallScore: RAW_SCORE_INFO.all.score,
        skinAge: RAW_SCORE_INFO.skin_age ?? null,
      });

      window.clearTimeout(timer);
    }, delayMs);
  });
};
