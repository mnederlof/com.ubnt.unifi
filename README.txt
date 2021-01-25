!!

CODE IN THIS REPOSITORY IS OUTDATED. DEVELOPMENT HAS BEEN TRANSFERRED TO https://github.com/steffjenl/com.ubnt.unifi

!!


This app adds support for presence detection based on (wifi) clients connected to the UniFi Controller on your Homey.

Device triggers:
- Wifi device (dis-)connected
- Wifi device roams from one Accesspoint to any another
- Wifi device roams to specific Accesspoint

Device conditions:
- Wifi client is (dis-)connected
- Wifi client is (dis-)connected from accesspoint

Generic triggers:
- A client (dis-)connected
- First device is connected
- First device is connected to specific accesspoint
- Last device has disconnected
- Last device has disconnected from specific accesspoint
- A non-paired device (guest) has (dis-)connected

Please note: only paired devices are being considered as device in all flow contexts. Non-paired devices are only usable for the guest (dis-)connected trigger.


Getting started:
- Configure settings for UniFi Controller via Homey Settings panel.
  - If you have a custom site name, then first try default as site id. Then a list of site ids will be loaded.
- Go to Devices > Add new device wizard
- Select device you want to pair with Homey.
  - It will only show devices known to your controller for the last 24 hours.


Supported devices:
- Wifi devices connected to UniFi accesspoints, connected via UniFi Controller.

For supported accesspoints, see [UniFi download page](https://www.ubnt.com/download/unifi/) for more information.

This version has been tested against version 5.7.x up to 5.12.x of the Ubiquiti UniFi Controller software. Lower versions might work too, but is untested.

The UniFi Dream Machine is _not_ supported. Apparently the API has changed on that box and the API urls are currently unknown.


Supported Languages:
- English
- Dutch
- Spanish
