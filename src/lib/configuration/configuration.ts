import {DeviceConfiguration} from './device-configuration';

/**
 * Represents the homebridge configuration for the plugin.
 */
export interface Configuration {
    /**
     * Gets or sets the IP of the bridge.
     */
    bridgeIp: string;

    /**
     * Gets or sets the Api Key of the bridge
     */
    apiKey: string;

    /**
     * Gets or sets the api client timeout in milliseconds
     */
    timeout: number;

    /**
     * Gets or sets the number of retries before repoorting failure.
     */
    maximumApiRetry: number;

    /**
     * Gets or sets the devices that should be exposed to HomeKit.
     */
    devices: Array<DeviceConfiguration>;

    /**
     * Gets or sets the update interval for device data in seconds.
     */
    updateInterval: number;


    /**
     * Gets or sets the Port for the Webhook.
     */
    webhookPort: number;
}
