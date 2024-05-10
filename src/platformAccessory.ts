import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {HomebridgeTedeePlatform} from './platform';
import {Lock} from './clients/models/lock';
import {LockState} from './clients/models/lock-state';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class LockAccessory {
  private service: Service;
  private battery: Service;
  private readonly id: number;
  private readonly name: string;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private state = {
    isOperating: false,
    isJammed: false,
    state: 9,
    batteryLevel: 100,
    isCharging: false,
  };

  constructor(
    private readonly platform: HomebridgeTedeePlatform,
    readonly accessory: PlatformAccessory,
  ) {
    this.id = accessory.context.device.id;
    this.name = accessory.context.device.name;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'tedee')
      .setCharacteristic(this.platform.Characteristic.Model, this.accessory.context.device.type == 2 ? 'Lock PRO' : 'Lock GO')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.accessory.context.device.serialNumber)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.accessory.context.device.version)
      .setCharacteristic(this.platform.Characteristic.HardwareRevision, this.accessory.context.device.deviceRevision.toString());

    this.state.isJammed = this.accessory.context.device.jammed == 1 || this.accessory.context.device.state == 0 || this.accessory.context.device.state == 1;
    this.state.state = this.accessory.context.device.state;
    this.state.isOperating = !(this.state.state == 0 || this.state.state == 2 || this.state.state == 3 || this.state.state == 6 || this.state.state == 9);

    // get the LockMechanism service if it exists, otherwise create a new LockMechanism service
    this.service = this.accessory.getService(this.platform.Service.LockMechanism) || this.accessory.addService(this.platform.Service.LockMechanism);

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.name);

    this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.handleLockCurrentStateGet.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.handleLockTargetStateGet.bind(this))
      .onSet(this.handleLockTargetStateSet.bind(this));

    this.state.batteryLevel = this.accessory.context.device.batteryLevel;
    this.state.isCharging = this.accessory.context.device.isCharging == 1;

    this.battery = this.accessory.getService(this.platform.Service.Battery) || this.accessory.addService(this.platform.Service.Battery);
    this.battery.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.handleStatusLowBatteryGet.bind(this));
    this.battery.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.handleStatusBatteryLevelGet.bind(this));
    this.battery.getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(this.handleStatusChargingStateGet.bind(this));
  }

  /**
   * Handle requests to set the "Lock Target State" characteristic
   */
  async handleLockTargetStateSet(newValue: CharacteristicValue) {
    if (this.state.isOperating) {
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.RESOURCE_BUSY);
    }

    if (newValue === this.platform.Characteristic.LockTargetState.UNSECURED) {
      // Sends the open command to the API
      this.platform.log.info(`[${this.name}] Open via HomeKit requested.`);
      this.state.isOperating = true;

      try {
        await this.platform.apiClient.unlockDevice(this.id);
      } catch (e) {
        this.state.isOperating = false;
        this.platform.log.warn(`[${this.name}] Failed to open via HomeKit`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    } else if (newValue === this.platform.Characteristic.LockTargetState.SECURED) {
      // Sends the close command to the API
      this.platform.log.info(`[${this.name}] Close via HomeKit requested.`);
      this.state.isOperating = true;

      try {
        await this.platform.apiClient.lockDevice(this.id);
      } catch (e) {
        this.state.isOperating = false;
        this.platform.log.warn(`[${this.name}] Failed to close via HomeKit`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    } else {
      this.platform.log.warn(`[${this.name}] Invalid Operation requested.`);
      this.platform.log.debug(`[${this.name}] Invalid LockTargetState requested: ${newValue}.`)
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
    }
  }


  /**
   * Handle requests to get the current value of the "Status Low Battery" characteristic
   */
  async handleStatusLowBatteryGet() {
    this.platform.log.debug('Triggered GET StatusLowBattery');

    return (this.state.batteryLevel < 10 && !this.state.isCharging) ?
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  async handleStatusBatteryLevelGet() {
    return this.state.batteryLevel;
  }

  async handleStatusChargingStateGet() {
    return this.state.isCharging ?
      this.platform.Characteristic.ChargingState.CHARGING :
      this.platform.Characteristic.ChargingState.NOT_CHARGING;
  }

  async handleLockCurrentStateGet() {
    if (this.state.isJammed) {
      return this.platform.Characteristic.LockCurrentState.JAMMED;
    }

    switch (this.state.state) {
      case 0: // Uncalibrated
      case 1: // Calibrating
        return this.platform.Characteristic.LockCurrentState.JAMMED;
      case 2: // Open
      case 5: // Closing
      case 7: // Unlatched
      case 8: // Unlatching
      case 255: // Latching
        return this.platform.Characteristic.LockCurrentState.UNSECURED;
      case 3: // Half-closed
      case 4: // Opening
      case 6: // Closed
        return this.platform.Characteristic.LockCurrentState.SECURED;
      case 9: // Unknown
      default:
        return this.platform.Characteristic.LockCurrentState.UNKNOWN;
    }
  }

  async handleLockTargetStateGet() {
    if (this.state.isJammed) {
      return this.platform.Characteristic.LockCurrentState.JAMMED;
    }

    switch (this.state.state) {
      case 0: // Uncalibrated
      case 1: // Calibrating
        return this.platform.Characteristic.LockCurrentState.JAMMED;
      case 2: // Open
      case 4: // Opening
      case 7: // Unlatched
      case 8: // Unlatching
      case 255: // Latching
        return this.platform.Characteristic.LockCurrentState.UNSECURED;
      case 3: // Half-closed
      case 5: // Closing
      case 6: // Closed
        return this.platform.Characteristic.LockCurrentState.SECURED;
      case 9: // Unknown
      default:
        return this.platform.Characteristic.LockCurrentState.UNKNOWN;
    }
  }

  /**
   * Updates the device from the API.
   */
  public async updateAsync() {
    if (!this.id) {
      return;
    }

    try {
      this.platform.log.debug(`Syncing lock with ID ${this.id} from the API...`);

      // Gets sync information for the lock from the API
      const lock = await this.platform.apiClient.getLockById(this.id);

      // Updates the locks
      this.update(lock);

      this.platform.log.debug(`Lock with ID ${this.id} synced from the API.`);
    } catch (e) {
      this.platform.log.warn(`Failed to sync lock with ID ${this.id} from API.`);
    }
  }


  /**
   * Updates the state of the lock.
   * @param lock
   */
  public update(lock: Lock) {
    this.platform.log.debug(`[${this.name}] Update received.`);
    this.accessory.context.device = lock;

    this.updateState(lock.state, lock.jammed);

    // Updates the battery state
    this.updateBattery(lock.batteryLevel);
    this.updateCharging(lock.isCharging);
  }

  public updateBattery(batteryLevel: number) {
    this.state.batteryLevel = batteryLevel;
  }

  public updateCharging(isCharging: 0 | 1) {
    this.state.isCharging = isCharging == 1;
  }

  public updateState(state: LockState, jammed: 0 | 1) {
    if (state == 0 || state == 2 || state == 3 || state == 6 || state == 9) {
      this.state.isOperating = false;
    }

    this.state.state = state;

    this.state.isJammed = jammed == 1 || state == 0 || state == 1;
  }
}
