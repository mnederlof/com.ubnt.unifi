# Ubiquiti UniFi Controller
This app adds support for presence detection based on (wifi) clients connected to the UniFi Controller on your Homey.

Device triggers:
* Wifi device (dis-)connected
* Wifi device roams from one Accesspoint to any another
* Wifi device roams to specific Accesspoint

Device conditions:
* Wifi client is (dis-)connected
* Wifi client is (dis-)connected from accesspoint

Generic triggers:
* A client (dis-)connected
* First device is connected
* First device is connected to specific accesspoint
* Last device has disconnected
* Last device has disconnected from specific accesspoint
* A non-paired device (guest) has (dis-)connected

Please note: only paired devices are being considered as device in all flow contexts. Non-paired devices are only usable for the guest (dis-)connected trigger.

## Geting started:
* Configure settings for UniFi Controller via Homey Settings panel.
  * If you have a custom site name, then first try default as site id. Then a list of site ids will be loaded.
* Go to Devices > Add new device wizard
* Select device you want to pair with Homey.
  * It will only show devices known to your controller for the last 24 hours.

## Supported devices:
* Wifi devices connected to UniFi accesspoints, connected via UniFi Controller.

For supported accesspoints, see [UniFi download page](https://www.ubnt.com/download/unifi/) for more information.

This version has been tested against version 5.7.x of the Ubiquiti UniFi Controller software. Lower versions might work too, but is untested.

## Supported Languages:
* English
* Dutch
* Spanish

## Change Log:
**2.0.3**
* Bugfix: Fix triggers 'first device online' and 'last device offline'

**2.0.2**
* Bugfix release. Upon initial installation, it failed to start the app, due to uninitialized settings.

**2.0.1**
* Added triggers for non-paired devices (guests).
  * Usergroup token is provided too (if known)
* Added SSID to connected triggers

**2.0.0**
* Rewrite of app for SDKv2. Now using another library for unifi connectivity, hopefully fixing reconnects.

**1.0.1**
* Bugfix: autosuggest was not working for flow card 'last_device_disconnected'

**1.0.0**
* Added thread that reconnects every 60 seconds if possible
* Bump to v1.0

**0.0.3**
* Added Spanish Translations.

**0.0.2:**
* Bugfix: When a connection failed initially, the app crashed. This is now fixed.
* Feature: It is now possible to show up to 100 debug messages in the App Settings page.

**0.0.1:**
Initial release for Ubiquiti UniFi app
