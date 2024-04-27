import axios, {AxiosError, AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import {createHash} from 'crypto';
import {CallbackData} from "./models/callback-data";

interface CustomInternalAxiosRequestConfig extends InternalAxiosRequestConfig {
    retriesCount?: number; // Optional property to track retries
}

export class TedeeLocalApiClient {
    private client: AxiosInstance;
    private apiKey: string;
    private maxRetries: number

    private error: ((d: any) => void);
    private debug: ((d: any) => void);

    constructor(
        ip: string,
        apiKey: string,
        timeout: number = 10000,
        maxRetries: number = 3,
        error?: (d: any) => void,
        debug?: (d: any) => void
    ) {
        this.apiKey = apiKey;
        this.maxRetries = maxRetries;
        this.client = axios.create({
            baseURL: 'http://' + ip + '/v1.0',
            headers: {
                accept: 'application/json'
            },
            timeout: timeout
        });

        this.error = error ?? ((e) => {
            void (e)
        });

        this.debug = debug ?? ((e) => {
            void (e)
        });

        this.client.interceptors.request.use((config) => this.appendAuthHeader(config));
        this.client.interceptors.response.use((response) => response, (error) => this.handleErrorWithRetry(error));
    }

    private generateApiToken(): string {
        const timestamp = Date.now();
        const hash = createHash('sha256').update(this.apiKey + timestamp).digest('hex');
        return `${hash}${timestamp}`;
    }

    private appendAuthHeader(config: InternalAxiosRequestConfig<any>): InternalAxiosRequestConfig<any> {
        config.headers['api_token'] = this.generateApiToken();
        return config;
    }

    private handleResponse(response: any) {
        return response.data;
    }

    private handleErrorWithRetry(error: AxiosError): Promise<any> {
        const config = error.config as CustomInternalAxiosRequestConfig;
        if (!config) {
            return Promise.reject(error);
        }

        config.retriesCount = config.retriesCount || 0;

        // Check if we should retry the request
        if (!config || config.retriesCount >= this.maxRetries) {
            return Promise.reject(error);
        }

        function pause(milliseconds: number) {
            const dt = Date.now();
            while (Date.now() - dt <= milliseconds) {
                /* Do nothing */
            }
        }

        pause(500);

        this.debug(`Request failed with status code ${error.response?.status}. Retrying...`);
        this.debug(`Retry attempt ${config.retriesCount + 1} of ${this.maxRetries}`);
        this.debug(JSON.stringify(error.response));

        // Increase the retry count
        config.retriesCount += 1;

        // Retry the request
        return this.client(config);
    }

    private handleError(error: any) {
        this.error(error.response?.data || error.message);
        this.debug(JSON.stringify(error));
        return Promise.reject(error.response?.data || error.message);
    }

    async getBridgeDetails(): Promise<any> {
        try {
            const response = await this.client.get('/bridge');
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async checkApiHealth(): Promise<boolean> {
        try {
            const response = await this.client.get('/bridge');

            // Return false if status is OK but content not to spec
            return response.status === 200 && this.isValidBridgeDetails(response.data);
        } catch (error) {
            return false; // Returns false if the request fails
        }
    }

    // Validation function to check if response matches the BridgeDetails schema
    private isValidBridgeDetails(data: any): boolean {
        return typeof data === 'object' &&
            typeof data.name === 'string' &&
            typeof data.currentTime === 'string' &&
            typeof data.serialNumber === 'string' &&
            typeof data.ssid === 'string' &&
            (data.isConnected === 0 || data.isConnected === 1) &&
            typeof data.version === 'string' &&
            typeof data.wifiVersion === 'string';
    }

    async getLockList(): Promise<any> {
        try {
            const response = await this.client.get('/lock');
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async getLockById(deviceId: number): Promise<any> {
        try {
            const response = await this.client.get(`/lock/${deviceId}`);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async lockDevice(deviceId: number): Promise<void> {
        try {
            const response = await this.client.post(`/lock/${deviceId}/lock`);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async unlockDevice(deviceId: number, mode?: number | undefined): Promise<void> {
        if (typeof mode === 'undefined') {
            mode = 0;
        }
        try {
            const response = await this.client.post(`/lock/${deviceId}/unlock`, {
                mode: mode
            });
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async pullDevice(deviceId: number): Promise<void> {
        try {
            const response = await this.client.post(`/lock/${deviceId}/pull`);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    // Callback methods
    async listCallbacks(): Promise<any> {
        try {
            const response = await this.client.get('/callback');
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async addCallback(callbackData: CallbackData): Promise<any> {
        try {
            const response = await this.client.post('/callback', callbackData);
            return this.handleResponse(response);
        } catch (error) {
            console.error(error);
            return this.handleError(error);
        }
    }

    async setMultipleCallbacks(callbacks: CallbackData[]): Promise<any> {
        try {
            const response = await this.client.put('/callback', callbacks);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async deleteCallback(callbackId: number): Promise<void> {
        try {
            const response = await this.client.delete(`/callback/${callbackId}`);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }

    async updateCallback(callbackId: number, callbackDetails: any): Promise<void> {
        try {
            const response = await this.client.put(`/callback/${callbackId}`, callbackDetails);
            return this.handleResponse(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
}
