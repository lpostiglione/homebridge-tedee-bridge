import {CommonDeviceEvent} from './common-device-event';
import {LockState} from './lock-state';

export interface LockStatusChangedEvent extends CommonDeviceEvent {
  state: LockState;
  jammed: 0 | 1;
}
