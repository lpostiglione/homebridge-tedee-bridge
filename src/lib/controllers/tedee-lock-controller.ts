import {Platform} from '../platform';
import {DeviceConfiguration} from '../configuration/device-configuration';
import {Characteristic, Homebridge} from 'homebridge-framework';
import {Lock} from '../clients/models/lock';
import {LockState} from "../clients/models/lock-state";

/**
 * Represents a controller for a Tedee lock device. Controllers represent physical devices in HomeKit.
 */
export class TedeeLockController {

    /**
     * Gets or sets the ID of the lock.
     */
    public id: number | undefined;

    /**
     * Gets or sets the name of the lock.
     */
    public name: string | undefined;

    /**
     * Gets or sets the lock information.
     */
    private lock: Lock | undefined;

    /**
     * Contains a value that determines whether the lock is currently operating.
     */
    private isOperating: boolean = false;

    /**
     * Contains the current state characteristic of the lock.
     */
    private lockCurrentStateCharacteristic: Characteristic<number> | undefined;

    /**
     * Contains the target state characteristic of the lock.
     */
    private lockTargetStateCharacteristic: Characteristic<number> | undefined;

    /**
     * Contains the current state characteristic of the latch.
     */
    private latchCurrentStateCharacteristic: Characteristic<number> | null = null;

    /**
     * Contains the target state characteristic of the latch.
     */
    private latchTargetStateCharacteristic: Characteristic<number> | null = null;

    /**
     * Contains the low battery characteristic of the lock.
     */
    private statusLowBatteryCharacteristic: Characteristic<number> | undefined;

    /**
     * Contains the charging state characteristic of the lock.
     */
    private chargingStateCharacteristic: Characteristic<number> | undefined;

    /**
     * Contains the battery level characteristic of the lock.
     */
    private batteryLevelCharacteristic: Characteristic<number> | undefined;

    /**
     * Initializes a new TedeeLockController instance.
     * @param platform The plugin platform.
     * @param deviceConfiguration The configuration of the Tedee lock device that is represented by this controller.
     * @param lock The lock information received from the API.
     */
    constructor(private platform: Platform, private deviceConfiguration: DeviceConfiguration, lock: Lock) {
        platform.logger.info(`[${deviceConfiguration.name}] Initializing...`);
        if (!lock) {
            return;
        }
        // Sets the ID and name
        this.lock = lock;
        this.id = this.lock.id;
        this.name = deviceConfiguration.name;

        // Creates the accessory
        const lockAccessory = platform.useAccessory(deviceConfiguration.name, deviceConfiguration.name, 'lock');
        lockAccessory.setInformation({
            manufacturer: 'tedee',
            model: this.lock.type == 2 ? 'Lock PRO' : 'Lock GO',
            serialNumber: this.lock.serialNumber,
            firmwareRevision: this.lock.version,
            hardwareRevision: this.lock.deviceRevision.toString()
        });

        // Creates the lock service for the device
        platform.logger.info(`[${deviceConfiguration.name}] Adding lock service`);
        let lockService = lockAccessory.useService(Homebridge.Services.LockMechanism, deviceConfiguration.defaultLockName || 'Lock', 'lock');

        // Adds the characteristics for the lock service
        this.lockCurrentStateCharacteristic = lockService.useCharacteristic<number>(Homebridge.Characteristics.LockCurrentState);
        this.lockTargetStateCharacteristic = lockService.useCharacteristic<number>(Homebridge.Characteristics.LockTargetState);
        this.lockTargetStateCharacteristic.valueChanged = async newValue => {
            if (!this.lock) {
                return;
            }
            // Checks if the operation is unsecured or secured
            if (newValue === Homebridge.Characteristics.LockTargetState.UNSECURED) {
                if (this.lockCurrentStateCharacteristic && this.lockCurrentStateCharacteristic.value === Homebridge.Characteristics.LockCurrentState.SECURED) {
                    // Checks if unlocking is enabled
                    if (this.deviceConfiguration.disableUnlock) {
                        platform.logger.info(`[${deviceConfiguration.name}] Unlock via HomeKit requested but not enabled in the configuration.`);
                        setTimeout(() => {
                            // @ts-ignore
                            this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.SECURED;
                        }, 500);
                        return;
                    }

                    // Starts the operation
                    this.isOperating = true;

                    // Sets the target state of the unlatch switch to unsecured, as both should be displayed as open
                    if (this.lock.deviceSettings && this.lock.deviceSettings.pullSpringEnabled && this.lock.deviceSettings.autoPullSpringEnabled && this.latchTargetStateCharacteristic) {
                        this.latchTargetStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.UNSECURED;
                    }

                    // Sends the open command to the API
                    platform.logger.info(`[${deviceConfiguration.name}] Open via HomeKit requested.`);
                    try {
                        await platform.apiClient.unlockDevice(this.lock.id);
                    } catch (e) {
                        platform.logger.warn(`[${deviceConfiguration.name}] Failed to open via HomeKit`);
                    }
                } else {
                    // Checks if unlocking is enabled
                    if (this.deviceConfiguration.disableUnlock) {
                        platform.logger.info(`[${deviceConfiguration.name}] Unlock via HomeKit requested but not enabled in the configuration.`);
                        return;
                    }

                    // If the door is half-closed, it can always be opened
                    if (this.lock.state === 3) {
                        // Starts the operation
                        this.isOperating = true;

                        // Sends the open command to the API
                        platform.logger.info(`[${deviceConfiguration.name}] Open via HomeKit requested.`);
                        try {
                            await platform.apiClient.unlockDevice(this.lock.id);
                        } catch (e) {
                            platform.logger.warn(`[${deviceConfiguration.name}] Failed to open via HomeKit`);
                        }
                    } else {
                        // As the door is open, it has to be determines whether the door should be unlatched
                        if (deviceConfiguration.unlatchFromUnlockedToUnlocked && this.lock.deviceSettings && this.lock.deviceSettings.pullSpringEnabled) {

                            // Starts the operation
                            this.isOperating = true;

                            // Sets the target state of the unlatch switch to unsecured, as both should be displayed as open
                            if (this.latchTargetStateCharacteristic) {
                                this.latchTargetStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.UNSECURED;
                            }

                            // Sends the pull spring command to the API
                            platform.logger.info(`[${deviceConfiguration.name}] Pull spring via HomeKit requested.`);
                            try {
                                await platform.apiClient.pullDevice(this.lock.id);
                            } catch (e) {
                                platform.logger.warn(`[${deviceConfiguration.name}] Pull spring via HomeKit`);
                            }
                        } else {
                            platform.logger.info(`[${deviceConfiguration.name}] Pull spring via HomeKit requested but not enabled in the configuration.`);
                        }
                    }
                }
            } else {

                // Starts the operation
                this.isOperating = true;

                // Sends the close command to the API
                platform.logger.info(`[${deviceConfiguration.name}] Close via HomeKit requested.`);
                try {
                    await platform.apiClient.lockDevice(this.lock.id);
                } catch (e) {
                    platform.logger.warn(`[${deviceConfiguration.name}] Failed to close via HomeKit`);
                }
            }
        };

        // Checks if the latch service should be exposed
        if (deviceConfiguration.unlatchLock) {

            // Creates the latch service for the device
            platform.logger.info(`[${deviceConfiguration.name}] Adding latch service`);
            let latchService = lockAccessory.useService(Homebridge.Services.LockMechanism, deviceConfiguration.defaultLatchName || 'Latch', 'latch');

            // Adds the characteristics for the lock service
            this.latchCurrentStateCharacteristic = latchService.useCharacteristic<number>(Homebridge.Characteristics.LockCurrentState);
            this.latchTargetStateCharacteristic = latchService.useCharacteristic<number>(Homebridge.Characteristics.LockTargetState);
            this.latchTargetStateCharacteristic.valueChanged = async newValue => {
                if (!this.lock) {
                    return;
                }
                // Checks if the pull spring is enabled
                if (!this.lock.deviceSettings || !this.lock.deviceSettings.pullSpringEnabled) {
                    setTimeout(() => {
                        this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                        this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    }, 500);
                    return;
                }

                // Checks if the operation is unsecured, as the latch cannot be secured
                if (newValue !== Homebridge.Characteristics.LockTargetState.UNSECURED) {
                    return;
                }

                // Checks if unlocking is enabled
                if (this.deviceConfiguration.disableUnlock) {
                    platform.logger.info(`[${deviceConfiguration.name}] Unlatch via HomeKit requested but not enabled in the configuration.`);
                    setTimeout(() => {
                        this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                        this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    }, 500);
                    return;
                }

                // As the lock is locked, the spring cannot be pulled
                // @ts-ignore
                if (this.lockCurrentStateCharacteristic.value === Homebridge.Characteristics.LockCurrentState.SECURED) {
                    setTimeout(() => {
                        this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                        this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    }, 500);
                    return;
                }

                // Starts the operation
                this.isOperating = true;

                // Sets the target state of the lock to unsecured, as both should be displayed as open
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.UNSECURED;


                // Sends the pull spring command to the API
                platform.logger.info(`[${deviceConfiguration.name}] Pull spring via HomeKit requested.`);
                try {
                    //
                    await platform.apiClient.unlockDevice(this.lock.id, 4);
                } catch (e) {
                    platform.logger.warn(`[${deviceConfiguration.name}] Pull spring via HomeKit`);
                }
            };
        }

        // Creates the battery service
        platform.logger.info(`[${deviceConfiguration.name}] Adding battery service`);
        let batteryService = lockAccessory.useService(Homebridge.Services.BatteryService, 'Battery', 'battery');
        this.statusLowBatteryCharacteristic = batteryService.useCharacteristic<number>(Homebridge.Characteristics.StatusLowBattery);
        this.chargingStateCharacteristic = batteryService.useCharacteristic<number>(Homebridge.Characteristics.ChargingState);
        this.batteryLevelCharacteristic = batteryService.useCharacteristic<number>(Homebridge.Characteristics.BatteryLevel);

        // Updates the lock
        this.update(lock);
    }

    /**
     * Updates the device from the API.
     */
    public async updateAsync() {
        if (!this.id) {
            return;
        }

        try {
            this.platform.logger.debug(`Syncing lock with ID ${this.id} from the API...`);

            // Gets sync information for the lock from the API
            const lock = await this.platform.apiClient.getLockById(this.id);

            // Updates the locks
            this.update(lock);

            this.platform.logger.debug(`Lock with ID ${this.id} synced from the API.`);
        } catch (e) {
            this.platform.logger.warn(`Failed to sync lock with ID ${this.id} from API.`);
        }
    }


    /**
     * Updates the state of the lock.
     * @param lock
     */
    public update(lock: Lock) {
        this.platform.logger.debug(`[${this.name}] Update received.`);
        this.lock = lock;
        if (!this.lock) {
            return;
        }

        // If the lock is operating, nothing should be updated
        if (this.isOperating) {
            return;
        }

        // Checks if the lock properties can be read
        if (!this.lock) {
            this.platform.logger.debug(`[${this.name}] Lock properties not available, no update possible.`);
            return;
        }

        this.updateState(this.lock.state, this.lock.jammed);

        // Updates the battery state
        this.updateBattery(this.lock.batteryLevel);
        this.updateCharging(this.lock.isCharging);
    }

    public updateBattery(batteryLevel: number) {
        this.batteryLevelCharacteristic!.value = batteryLevel;
        this.statusLowBatteryCharacteristic!.value = batteryLevel >= 10 ? Homebridge.Characteristics.StatusLowBattery.BATTERY_LEVEL_NORMAL : Homebridge.Characteristics.StatusLowBattery.BATTERY_LEVEL_LOW;
    }

    public updateCharging(isCharging: 0 | 1) {
        this.chargingStateCharacteristic!.value = isCharging ? Homebridge.Characteristics.ChargingState.CHARGING : Homebridge.Characteristics.ChargingState.NOT_CHARGING;
    }

    public updateState(state: LockState, jammed: 0 | 1) {
        if (state == 2 || state == 3 || state == 6 || state == 7) {
            this.isOperating = false;
        }

        // Sets the current and target state
        switch (state) {
            case 0:
            case 1:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.JAMMED;
                break;

            // Open
            case 2:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.UNSECURED;
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                break;

            // Half-closed
            case 3:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.SECURED;
                break;

            // Opening
            case 4:
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                break;

            // Closing
            case 5:
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.SECURED;
                break;

            // Closed
            case 6:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.SECURED;
                break;

            // Unlatched
            case 7:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.UNSECURED;
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                break;

            // Unlatching
            case 8:
            case 255:
                // @ts-ignore
                this.lockTargetStateCharacteristic.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                break;

            // Unknown
            case  9:
                // @ts-ignore
                this.lockCurrentStateCharacteristic.value = Homebridge.Characteristics.LockCurrentState.UNKNOWN;
                break;
        }

        // Checks if the unlatch lock is enabled
        if (this.deviceConfiguration.unlatchLock) {
            // Sets the current and target state
            switch (state) {
                case 0:
                case 1:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.JAMMED;
                    break;

                // Open
                case 2:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;

                // Half-closed
                case 3:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;

                // Opening
                case 4:
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;

                // Closing
                case 5:
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;

                // Closed
                case 6:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.SECURED;
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;

                // Unlatched
                case 7:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.UNSECURED;
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                    break;

                // Unlatching
                case 8:
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.UNSECURED;
                    break;

                // Unknown
                case  9:
                    this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.UNKNOWN;
                    break;

                // Latching
                case 255:
                    this.latchTargetStateCharacteristic!.value = Homebridge.Characteristics.LockTargetState.SECURED;
                    break;
            }
        }

        if (jammed) {
            this.latchCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.JAMMED;
            this.lockCurrentStateCharacteristic!.value = Homebridge.Characteristics.LockCurrentState.JAMMED;
        }
    }
}
