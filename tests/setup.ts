import { setPlanningWindowOrigin } from '../src/validation';

/**
 * The inventory window rolls with the real clock in production. Tests pin its origin so that
 * date-sensitive assertions stay deterministic forever: with this origin the supported window
 * is exactly 2026-09-03 .. 2026-09-16, which is what the date-pinned fixtures expect.
 */
setPlanningWindowOrigin('2026-09-01');
