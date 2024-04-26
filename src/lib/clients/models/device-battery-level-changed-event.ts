import {CommonDeviceEvent} from "./common-device-event";

export interface DeviceBatteryLevelChangedEvent extends CommonDeviceEvent {
    batteryLevel: number;
}
