/**
 * Lock state:
 *  0-uncalibrated
 *  1-calibration
 *  2-open
 *  3-partially_open
 *  4-opening
 *  5-closing
 *  6-closed
 *  7-pull_spring
 *  8-pulling
 *  9-unknown
 *  255-unpulling
 */
export type LockState = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 255;
