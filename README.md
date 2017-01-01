# Ubiquiti Unifi Controller
This app adds support for presence detection based on (wifi) clients connected to the Unifi Controller on your Homey.

Device triggers:
* Wifi device (dis-)connected
* Wifi device roams from one Accesspoint to any another
* Wifi device roams to specific Accesspoint

Device conditions:
* Wifi client is (dis-)connected
* Wifi client is (dis-)connected from accesspoint

Generic triggers:
* A client (dis-)connected
* First device is connected to specific accesspoint
* Last device has disconnected from specific accesspoint

Please note: only paired devices are being considered as device in all flow contexts. Non-paired devices are not being considered.

## Geting started:
* Configure settings for Unifi Controller via Homey Settings panel.
* Go to Devices > Add new device wizard
* Select device you want to pair with Homey.
  * It will only show devices known to your controller for the last 24 hours.

## Supported devices:
* Wifi devices connected to Unifi accesspoints, connected via Unifi Controller.

For supported accesspoints, see [Unifi download page](https://www.ubnt.com/download/unifi/) for more information.

This version has been tested against version 5.3.x of the Ubiquiti Unifi Controller software.

## Supported Languages:
* English
* Dutch

## Change Log:
**0.0.1:**
Initial release for Ubiquiti Unifi controller
