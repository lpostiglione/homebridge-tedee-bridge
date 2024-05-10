/**
 * Represents the HTTP API model for device settings.
 */
export interface DeviceSettings {
  autoLockEnabled: number;
  autoLockDelay: number;
  autoLockImplicitEnabled: number;
  autoLockImplicitDelay: number;
  pullSpringEnabled: number;
  pullSpringDuration: number;
  autoPullSpringEnabled: number;
  postponedLockEnabled: number;
  postponedLockDelay: number;
  buttonLockEnabled: number;
  buttonUnlockEnabled: number;
}
