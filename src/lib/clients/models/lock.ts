import {DeviceSettings} from './device-settings';
import {LockState} from "./lock-state";

/**
 * Represents the HTTP API model for a single lock.
 */
export interface Lock {
    /**
     * Lock type: 2 - Lock PRO, 4 - Lock GO
     */
    type: 2 | 4;
    id: number;
    name: string;
    serialNumber: string;
    isConnected: 0 | 1;
    rssi: number;
    deviceRevision: number;
    version: string;
    state: LockState;
    jammed: 0 | 1;

    /**
     * Battery percentage or 255 if unknown
     */
    batteryLevel: number;
    isCharging: 0 | 1;
    deviceSettings: DeviceSettings;
}
