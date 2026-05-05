import { describe, it, expect } from 'vitest';
import { normalizeStreakScalingMultipliers, DEFAULT_STREAK_SCALING_MULTIPLIERS } from './streakScaling.js';

describe('normalizeStreakScalingMultipliers', () => {
  it('не-массив → дефолт', () => {
    expect(normalizeStreakScalingMultipliers(null)).toEqual([...DEFAULT_STREAK_SCALING_MULTIPLIERS]);
  });

  it('фильтрует мусор и границы (0; 1]', () => {
    expect(normalizeStreakScalingMultipliers([0.5, 0, 1.5, 'x', 0.3])).toEqual([0.5, 0.3]);
  });

  it('пусто → дефолт', () => {
    expect(normalizeStreakScalingMultipliers([])).toEqual([...DEFAULT_STREAK_SCALING_MULTIPLIERS]);
  });
});
