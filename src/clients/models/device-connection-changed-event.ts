import {CommonDeviceEvent} from './common-device-event';

export interface DeviceConnectionChangedEvent extends CommonDeviceEvent {
  isConnected: 0 | 1;
}
