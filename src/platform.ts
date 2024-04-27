import {HomebridgePlatform} from 'homebridge-framework';
import {Configuration} from './configuration/configuration';
import {TedeeLockController} from './controllers/tedee-lock-controller';
import {TedeeLocalApiClient} from './clients/tedee-local-api-client';
import {Lock} from './clients/models/lock';
import find from 'local-devices'
import {createServer, IncomingMessage, Server, ServerResponse} from "http";
import {WebhookPayload} from "./clients/models/webhook-payload";
import {CommonDeviceEvent} from "./clients/models/common-device-event";
import {DeviceBatteryLevelChangedEvent} from "./clients/models/device-battery-level-changed-event";
import {LockStatusChangedEvent} from "./clients/models/lock-status-changed-event";
import * as os from "os";


/**
 * Represents the platform of the plugin.
 */
export class Platform extends HomebridgePlatform<Configuration> {

    /**
     * Gets or sets the list of all locks.
     */
    public locks = new Array<Lock>();

    /**
     * Gets or sets the list of all controllers that represent physical lock devices in HomeKit.
     */
    public controllers = new Array<TedeeLockController>();


    private server: Server | undefined;

    private callbackId: number | undefined;

    /**
     * Gets the name of the plugin.
     */
    public get pluginName(): string {
        return 'homebridge-tedee-bridge';
    }

    /**
     * Gets the name of the platform which is used in the configuration file.
     */
    public get platformName(): string {
        return 'TedeeBridge';
    }

    /**
     * Contains the client that is used to communicate via HTTP API.
     */
    private _apiClient: TedeeLocalApiClient | null = null;

    /**
     * Gets the client that is used to communicate via HTTP API.
     */
    public get apiClient(): TedeeLocalApiClient {
        if (!this._apiClient) {
            throw new Error('Platform not initialized yet.');
        }
        return this._apiClient;
    }

    /**
     * Is called when the platform is initialized.
     */
    public async initialize(): Promise<void> {

        this.logger.info(`Initializing platform...`);

        this.logger.info(`Discovering tedee bridge...`);

        this.configuration.timeout = this.configuration.timeout || 10000;
        this.configuration.maximumApiRetry = this.configuration.maximumApiRetry || 3;
        this.configuration.webhookPort = this.configuration.webhookPort || 3003;

        let response;
        if (!this.configuration.bridgeIp) {
            // Find all local network devices.
            let devices = await find({skipNameResolution: true});
            for (var i = 0; i < devices.length; i++) {
                let elem = devices[i];
                this.logger.debug('Testing: ' + elem.ip);
                let testClient = new TedeeLocalApiClient(
                    elem.ip,
                    this.configuration.apiKey,
                    this.configuration.timeout,
                    0
                );
                try {
                    response = await testClient.checkApiHealth();
                } catch (e) {
                    this.logger.debug('Fail!');
                    continue;
                }

                if (response) {
                    this.configuration.bridgeIp = elem.ip;
                    this.logger.debug('Pass!');
                    break;
                }
            }
        } else {
            let testClient = new TedeeLocalApiClient(
                this.configuration.bridgeIp,
                this.configuration.apiKey,
                this.configuration.timeout,
                0,
                (e) => this.logger.error(e),
                (d) => this.logger.debug(d)
            );
            try {
                response = await testClient.checkApiHealth();
            } catch (e) {
                this.logger.debug('Fail!');
            }
        }

        if (!response) {
            this.logger.warn('Found no accessible bridge, did you enable API access?');
            return;
        }

        this.logger.info(`Found bridge under ${this.configuration.bridgeIp}!`);

        // Initializes the client
        this._apiClient = new TedeeLocalApiClient(
            this.configuration.bridgeIp,
            this.configuration.apiKey,
            this.configuration.timeout,
            this.configuration.maximumApiRetry
        );

        this.logger.debug(`Initialized API client with IP ${this.configuration.bridgeIp} and API key ${this.configuration.apiKey}`);

        try {
            // Gets the locks from the API
            this.locks = await this.apiClient.getLockList();
        } catch (e) {
            this.logger.warn('Failed to get locks from the API');
            this.logger.debug(JSON.stringify(e));
            return;
        }
        this.logger.debug(`Found ${this.locks.length} locks.`);
        this.logger.debug(`Locks: ${JSON.stringify(this.locks)}`);

        let hasLocks = false;
        for (let lock of this.locks) {
            let deviceConfiguration = this.configuration.devices.find(l => l.name === lock.name);
            if (!deviceConfiguration) {
                deviceConfiguration = {
                    name: lock.name,
                    ignored: false,
                    unlatchFromUnlockedToUnlocked: true,
                    unlatchLock: false,
                    disableUnlock: false,
                    defaultLockName: lock.name,
                    defaultLatchName: lock.name + ' Latch'
                }
            }

            if (deviceConfiguration.ignored) {
                continue;
            }

            // Creates the new controller for the device and stores it
            const tedeeLockController = new TedeeLockController(this, deviceConfiguration, lock);
            this.controllers.push(tedeeLockController);
            hasLocks = true;
        }

        if (!hasLocks) {
            return;
        }

        this.logger.info(`Starting webhook server on port ${this.configuration.webhookPort}...`);
        this.server = createServer((req, res) => this.handleWebhook(req, res))
            .listen(this.configuration.webhookPort);
        this.logger.info(`Webhook server started successfully!`);

        this.logger.info(`Registering webhook callback...`);
        const webhookUrl = `http://${this.getHomebridgeIpAddress()}:${this.configuration.webhookPort}/`;
        this.logger.debug(`Webhook URL: ${webhookUrl}`);

        let callback;
        try {
            callback = await this.apiClient.setMultipleCallbacks([{
                url: webhookUrl,
                method: 'POST',
                headers: [],
            }]);
            this.logger.debug(`Callback response: ${JSON.stringify(callback)}`);
        } catch (e) {
            this.logger.error('Failed to register webhook callback');
            this.logger.debug(JSON.stringify(e));
            return;
        }
        this.logger.info(`Webhook callback registered successfully!`);
        this.logger.debug(`Callback ID: ${callback[0]}`);
        this.callbackId = callback[0];
    }

    private getHomebridgeIpAddress() {
        const networkInterfaces = os.networkInterfaces();
        for (const name of Object.keys(networkInterfaces)) {
            for (const net of networkInterfaces[name]) {
                // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
        return null;
    }

    /**
     * Handles incoming webhook requests for partial updates to a lock.
     */
    public async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
        // Parse the incoming request
        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }

        const payload: WebhookPayload = JSON.parse(body);
        if (payload.event == "backend-connection-changed" || payload.event == "device-connection-changed") {
            if (payload.event == "backend-connection-changed") {
                // @ts-ignore
                this.logger.info('Webhook: Backend ' + (payload.data.isConnected ? 'connected' : 'disconnected'));
            } else {
                // @ts-ignore
                this.logger.info('Webhook: Device with id ' + payload.data.deviceId + ' ' + (payload.data.isConnected ? 'connected' : 'disconnected'));

            }
            res.statusCode = 200;
            res.end('Nevermind ;)');
            return;
        }

        // @ts-ignore
        const data: DeviceBatteryLevelChangedEvent | LockStatusChangedEvent | CommonDeviceEvent = payload.data;

        // Identify the lock that needs to be updated
        const controller = this.controllers.find(controller => controller.id === data.deviceId);
        if (!controller) {
            this.logger.warn('Webhook: Device not found with id ' + data.deviceId);
            res.statusCode = 404;
            res.end('Lock not found');
            return;
        }

        switch (payload.event) {
            case "device-settings-changed":
                this.logger.info('Webhook: Device settings changed for device with id ' + data.deviceId);
                await controller.updateAsync();
                break;
            case "device-battery-fully-charged":
                this.logger.info('Webhook: Battery fully charged for device with id ' + data.deviceId);
                controller.updateBattery(100);
                controller.updateCharging(0);
                break;
            case "device-battery-start-charging":
                this.logger.info('Webhook: Battery started charging for device with id ' + data.deviceId);
                controller.updateCharging(1);
                break;
            case "device-battery-level-changed":
                this.logger.info('Webhook: Battery level changed for device with id ' + data.deviceId);
                // @ts-ignore
                controller.updateBattery(data.batteryLevel);
                break;
            case "lock-status-changed":
                this.logger.info('Webhook: Lock status changed for device with id ' + data.deviceId);
                // @ts-ignore
                controller.updateState(data.state, data.jammed);
                break;
            default:
                this.logger.warn('Webhook: Unknown event type ' + payload.event);
                res.statusCode = 400;
                res.end('Unknown event type');
                return;
        }

        res.statusCode = 200;
        res.end('Lock updated successfully');
    }

    /**
     * Is called when homebridge is shut down.
     */
    public async destroy() {
        if (this.callbackId) {
            this.logger.info(`Deleting webhook callback...`);
            await this.apiClient.deleteCallback(this.callbackId);
        }
        // Close the server
        if (this.server) {
            this.logger.info(`Shutting down webhook server...`);
            await new Promise((resolve, reject) => {
                // @ts-ignore
                this.server.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(null);
                    }
                });
            });
        }
    }
}
