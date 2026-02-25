import assert from 'node:assert/strict';
import {
  ROULETTE_WHEEL_ORDER,
  SLOT_ANGLE,
  normalizeAngle,
  numberToSlotIndex,
  slotIndexToCenterAngle,
  angleToSlotIndex,
  getWinningNumberAtPointer,
  buildDeterministicSpinTarget
} from './wheelGeometry.js';

function runWheelGeometryTests() {
  assert.equal(normalizeAngle(0), 0);
  assert.equal(normalizeAngle(360), 0);
  assert.equal(normalizeAngle(-10), 350);
  assert.equal(normalizeAngle(725), 5);

  ROULETTE_WHEEL_ORDER.forEach((number, index) => {
    assert.equal(numberToSlotIndex(number), index);
    const angle = slotIndexToCenterAngle(index);
    assert.equal(angleToSlotIndex(angle), index);

    const lowerEdge = angle - SLOT_ANGLE / 2 + 1e-5;
    const upperEdge = angle + SLOT_ANGLE / 2 - 1e-5;
    assert.equal(angleToSlotIndex(lowerEdge), index);
    assert.equal(angleToSlotIndex(upperEdge), index);
  });

  ROULETTE_WHEEL_ORDER.forEach((number) => {
    const { targetWheelRotation, targetBallRotation, resolvedNumber } = buildDeterministicSpinTarget({
      currentWheelRotation: 0,
      currentBallRotation: 0,
      winningNumber: number
    });
    assert.equal(resolvedNumber, number);
    assert.equal(getWinningNumberAtPointer(targetWheelRotation, targetBallRotation), number);
  });

  ROULETTE_WHEEL_ORDER.forEach((number) => {
    const edgeOffset = SLOT_ANGLE * 0.49;
    const plusOffset = buildDeterministicSpinTarget({
      currentWheelRotation: 0,
      currentBallRotation: 0,
      winningNumber: number,
      finalPocketOffsetDegrees: edgeOffset
    });
    const minusOffset = buildDeterministicSpinTarget({
      currentWheelRotation: 0,
      currentBallRotation: 0,
      winningNumber: number,
      finalPocketOffsetDegrees: -edgeOffset
    });
    assert.equal(getWinningNumberAtPointer(plusOffset.targetWheelRotation, plusOffset.targetBallRotation), number);
    assert.equal(getWinningNumberAtPointer(minusOffset.targetWheelRotation, minusOffset.targetBallRotation), number);
  });

  console.log('wheelGeometry tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWheelGeometryTests();
}

export { runWheelGeometryTests };
