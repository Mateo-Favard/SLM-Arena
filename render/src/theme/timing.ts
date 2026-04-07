/** All durations in frames at 30fps */
export const FPS = 30;

export const TIMING = {
  /** Frames per game turn (1-1.5s) */
  turnDuration: 35,
  /** Card/piece appearance animation */
  appearDuration: 5, // 0.15s
  /** Flash on played element */
  flashDuration: 3, // 0.08s
  /** Pause after a move */
  pauseAfterMove: 9, // 0.3s
  /** Victory flash */
  victoryFlash: 15, // 0.5s
  /** Outro scene */
  outroDuration: 75, // 2.5s
  /** TTS overlay on first turns */
  ttsDuration: 90, // 3s
} as const;

export const VIDEO = {
  width: 1080,
  height: 1920,
  fps: FPS,
} as const;
