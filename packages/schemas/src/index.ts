export type LivenessResponse = {
  status: "ok";
};

export type ReadinessCheck = {
  db?: boolean;
  redis?: boolean;
  /** The SSE service's shared price stream reader (false: disconnected too long). */
  streamReader?: boolean;
};

export type ReadinessResponse = {
  status: "ok" | "unavailable";
  checks: ReadinessCheck;
};
