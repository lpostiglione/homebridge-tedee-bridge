# Homebridge Tedee Plugin

This project is a homebridge plugin for Tedee smart locks.
The Tedee bridge is required for this plugin to work.

The Tedee smart lock is exposed as a lock in HomeKit with support for:

- Lock/Unlock/Unlatch
- Battery status

Optionally, a second switch is shown in the lock that represents the latch.

## Installation

Please install the plugin with the following command:

```
npm install -g homebridge-tedee-bridge
```

## Configuration

```json
{
  "platforms": [
    {
      "platform": "TedeeBridge",
      "apiKey": "TEDEE-API-KEY",
      "devices": [
        {
          "name": "DEVICE-NAME",
          "unlatchFromUnlockedToUnlocked": false,
          "unlatchLock": false,
          "disableUnlock": false,
          "defaultLockName": "Lock",
          "defaultLatchName": "Latch"
        }
      ],
      "bridgeIp": "TEDEE-BRIDGE-IP",
      "maximumApiRetry": 3,
      "timeout": 10000,
      "webhookPort": 3003
    }
  ]
}
```

### Configuration Parameters

#### Platform

| Parameter         | Required | Description                                                                                 |
|-------------------|----------|---------------------------------------------------------------------------------------------|
| `platform`        | **Yes**  | The platform name, should be "TedeeBridge"                                                  |
| `apiKey`          | **Yes**  | The API key for your Tedee bridge                                                           |
| `devices`         | No       | Array of your devices managed by the bridge                                                 |
| `bridgeIp`        | No       | The IP address of your Tedee bridge                                                         |
| `maximumApiRetry` | No       | The amount of attempts to call the Bridge API. Defaults to `3` attempts (incl. initial one) |
| `timeout`         | No       | The timeout for the API calls in milliseconds. Defaults to `10000` ms                       |
| `webhookPort`     | No       | The port on which the callback server should listen. Defaults to `3003`                     |

##### Device

| Parameter                       | Required | Description                                                                                                                                                                                             |
|---------------------------------|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`                          | **Yes**  | The name of the lock. This name has to match the name that is configured in the Tedee app                                                                                                               |
| `ignored`                       | No       | If set to `true`, the lock will not be controlled by this plugin.                                                                                                                                       |
| `unlatchFromUnlockedToUnlocked` | No       | If set to `true`, the door is unlatched when you switch from "unlocked" to "unlocked" in the Home app. If set to `false`, nothing is done when you switch from "unlocked" to "unlocked" in the Home app |
| `unlatchLock`                   | No       | If set to `true`, a second lock switch is exposed for unlatching the smart lock                                                                                                                         |
| `disableUnlock`                 | No       | If set to `true`, you cannot unlock via HomeKit, only lock actions are executed                                                                                                                         |
| `defaultLockName`               | No       | Lets you customize the name of the lock mechanism. Defaults to `Lock`                                                                                                                                   |
| `defaultLatchName`              | No       | Lets you customize the name of the unlatch mechanism. Defaults to `Latch`                                                                                                                               |

### API Key

To obtain the API key, you need to log in to the Tedee app and navigate to the settings of your bridge.
There you will find the API key.
![Selecting API Token type](https://docs.tedee.com/howtos/images/token_plain.png "Selecting API Token type")

Bear in mind there are **two types** of Authentication Tokens:

1. **Encrypted** - This must be selected for the plugin to work!
2. **Plain** - unsecured, which must be used <span style="color:red">**for development purposes only!**</span> and never
   in production environment.

More information can be found in the [Tedee API documentation](https://docs.tedee.com/bridge-api#tag/Authenticate).

## Usage

* When you change the HomeKit switch to locked, the smart lock with lock the door.
* When you change the HomeKit switch from locked to unlocked, the smart door will unlock the door. If you have "auto
  pull spring" enabled in the Tedee app, it will also unlatch.
* When you change the HomeKit switch from unlocked to unlocked, you have the unlatching enabled ("pull spring" in the
  Tedee app) and the corresponding setting in the `config.json` is enabled (`unlatchFromUnlockedToUnlocked`), then the
  lock will unlatch.
* If you enabled the second switch for the latch in the `config.json` (`unlatchLock`), you can change the switch to
  unlocked in order to unlatch the door. This only works if you have unlatching enabled ("pull spring") in the Tedee
  app.
* Changing the the second switch for the latch to unlocked when the door is locked, nothing is done.

## Thanks

Special thanks to [Tedee](https://tedee.com/) for providing the API and the bridge for this plugin.
Special thanks to [Lukas Rögner](https://github.com/lukasroegner) for the initial implementation of the plugin.
