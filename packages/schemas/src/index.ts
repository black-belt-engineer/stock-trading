export type LivenessResponse = {
  status: "ok";
};

export type ReadinessCheck = {
  db?: boolean;
  redis?: boolean;
};

export type ReadinessResponse = {
  status: "ok" | "unavailable";
  checks: ReadinessCheck;
};
