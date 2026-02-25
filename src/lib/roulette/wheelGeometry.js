export const ROULETTE_WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const SLOT_COUNT = 37;
export const SLOT_ANGLE = 360 / SLOT_COUNT;

export function normalizeAngle(angle) {
  const n = Number(angle || 0) % 360;
  return n < 0 ? n + 360 : n;
}

export function numberToSlotIndex(number) {
  return ROULETTE_WHEEL_ORDER.indexOf(Number(number));
}

export function slotIndexToCenterAngle(index) {
  return normalizeAngle(Number(index) * SLOT_ANGLE);
}

export function angleToSlotIndex(angle) {
  const epsilon = 1e-9;
  const normalized = normalizeAngle(angle);
  const shifted = normalizeAngle(normalized + SLOT_ANGLE / 2 - epsilon);
  return Math.floor(shifted / SLOT_ANGLE) % SLOT_COUNT;
}

export function getRelativeBallPocketAngle(wheelRotationAngle, ballAngle) {
  return normalizeAngle(ballAngle - wheelRotationAngle);
}

export function getWinningNumberAtPointer(wheelRotationAngle, ballAngle) {
  const relative = getRelativeBallPocketAngle(wheelRotationAngle, ballAngle);
  const slotIndex = angleToSlotIndex(relative);
  return ROULETTE_WHEEL_ORDER[slotIndex];
}

export function getBallFinalAngleForWinningNumber(number, wheelRotationAngle, pocketOffsetDegrees = 0) {
  const slotIndex = numberToSlotIndex(number);
  if (slotIndex < 0) return Number(wheelRotationAngle || 0);
  return Number(wheelRotationAngle || 0) + slotIndexToCenterAngle(slotIndex) + pocketOffsetDegrees;
}

export function buildDeterministicSpinTarget({
  currentWheelRotation,
  currentBallRotation,
  winningNumber,
  wheelSpins = 6,
  ballReverseSpins = 10,
  wheelDirection = 1,
  ballDirection = -1,
  finalPocketOffsetDegrees = 0
}) {
  const wheelTurns = Math.max(1, Math.floor(Number(wheelSpins) || 0));
  const ballTurns = Math.max(1, Math.floor(Number(ballReverseSpins) || 0));
  const wheelDir = Number(wheelDirection) === -1 ? -1 : 1;
  const ballDir = Number(ballDirection) === -1 ? -1 : 1;

  const startWheel = Number(currentWheelRotation || 0);
  const startBall = Number(currentBallRotation || 0);
  const nextWheel = startWheel + wheelDir * 360 * wheelTurns;
  const maxPocketOffset = SLOT_ANGLE / 2 - 1e-6;
  const pocketOffset = Math.max(-maxPocketOffset, Math.min(maxPocketOffset, Number(finalPocketOffsetDegrees || 0)));
  const alignedBallAngle = getBallFinalAngleForWinningNumber(winningNumber, nextWheel, pocketOffset);

  // Keep the chosen travel direction while still landing on the exact winning slot.
  const preliminaryBall = startBall + ballDir * 360 * ballTurns;
  const alignmentOffset =
    ballDir === 1
      ? normalizeAngle(alignedBallAngle - preliminaryBall)
      : -normalizeAngle(preliminaryBall - alignedBallAngle);
  const targetBall = preliminaryBall + alignmentOffset;

  return {
    targetWheelRotation: nextWheel,
    targetBallRotation: targetBall,
    resolvedNumber: getWinningNumberAtPointer(nextWheel, targetBall),
    wheelDirection: wheelDir,
    ballDirection: ballDir,
    finalPocketOffsetDegrees: pocketOffset
  };
}
