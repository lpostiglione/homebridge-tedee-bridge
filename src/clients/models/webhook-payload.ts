import {BackendConnectionChangedEvent} from './backend-connection-changed-event';
import {DeviceConnectionChangedEvent} from './device-connection-changed-event';
import {DeviceBatteryLevelChangedEvent} from './device-battery-level-changed-event';
import {LockStatusChangedEvent} from './lock-status-changed-event';
import {CommonDeviceEvent} from './common-device-event';

/**
 * Represents the HTTP API model for a single lock.
 */
export interface WebhookPayload {
  event: 'backend-connection-changed' | 'device-connection-changed' | 'device-settings-changed' | 'lock-status-changed' | 'device-battery-level-changed' | 'device-battery-start-charging' | 'device-battery-stop-charging' | 'device-battery-fully-charged';
  timestamp: string,
  data: BackendConnectionChangedEvent | DeviceConnectionChangedEvent | DeviceBatteryLevelChangedEvent | LockStatusChangedEvent | CommonDeviceEvent;
}
