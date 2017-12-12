"use strict";

// var http = require('http.min');
var ubiquitiUnifi = require('ubiquiti-unifi');

class unifi {

    constructor(driverId, options) {
        this.driver = findWhere(Homey.manifest.drivers, { id: driverId });

        // Override default options with provided options object
        this.options = Object.assign({
            debug: true,
            beforeInit: false,
            capabilities: {},
            defaultPollInterval: 15,
        }, options);

        this._debug('Driver: ', this.driver);
        this._debug('Options: ', this.options);

        this.initialized = false;
        this.reconnecting = false;
        this.attempt = 0;
        this.settingKey = 'com.ubnt.unifi.settings';
        this.unifi = {};

        this.devices = {};
        this.pairedDevices = [];
        this.firstUpdateDone = null;

        this.init = this.init.bind(this);
        this.added = this.added.bind(this);
        this.deleted = this.deleted.bind(this);
        this.pair = this.pair.bind(this);

        this.capabilities = {};
        this.pollIntervals = [];

        this.accessPointList = {};
        this.onlineClientList = {};
        this.offlineClientList = {};
        this.usergroupList = {};

        this.driver.capabilities.forEach(capabilityId => {
            // Create capability object
            this.capabilities[capabilityId] = {};

            // Define get function for capability
            this.capabilities[capabilityId].get = (deviceData, callback) => {
                this._debug('get', capabilityId, deviceData);

                // Get node from stored nodes array
                const node = this.getNode(deviceData);
                if (node instanceof Error) return callback(node);

                // Get value from node state object
                let value = node.state[capabilityId];
                if (value instanceof Error) return callback(value);
                if (typeof value === 'undefined') value = null;
                return callback(null, value);
            };
        });
        
        Homey.manager('settings').on('set', function(setting) {
            if (setting == this.settingKey) {
                // Got new settings, update our connection.
                this._debug('Got new settings');
                this.initializeApi();
            }
        }.bind(this));
    }

    updateStatus(status) {
        Homey.manager('settings').set('com.ubnt.unifi.status', status);
        Homey.manager('api').realtime('com.ubnt.unifi.status', status);
        this._debug(`Updating status to ${status}`);
    }

    reInitializeApi(err) {
        // If already in the progress of reconnecting, then don't do anything
        if (this.reconnecting) return;

        // Reset initialized state to false
        this.initialized = false;

        this.firstUpdateDone = null;

        // Update status to Offline.
        this.updateStatus('Offline');

        let reconnect = false;
        // Reconnect if it is a recoverable error
        if (typeof err.statusCode !== 'undefined') {
            if (err.statusCode === 503) reconnect = true;
        }
        if (typeof err.code !== 'undefined' && err.code === 'ECONNREFUSED') reconnect = true;

        if (reconnect) {
            this._debug('Reconnecting in 30 seconds')
            this.reconnecting = true;

            // Call initializeApi again
            setTimeout(function() { this.initializeApi(); }.bind(this), (30 * 1000));
            return;
        }

        // Not doing anything, update the user.
        this._debug('Fatal error, not reconnecting...');
    }

    initializeApi() {
        this.initialized = false;

        // Initialize controller connection
        let appSettings = Homey.manager('settings').get(this.settingKey);
        let options = {
            'username': appSettings['user'],
            'password': appSettings['pass'],
            'port': appSettings['port'],
            'url': 'https://' + appSettings['host'],
            'site': appSettings['site'],
            'ignoreSsl': true,
            'timeout': (30 * 1000),
        };
        const attempt = ++this.attempt;

        this._debug('Creating new controller connection');
        this.updateStatus('Connecting...');
        try {
            ubiquitiUnifi(options).then(
                unifiController => {
                    this._debug('Got login session')
                    this.unifi = unifiController;
                    this.initialized = true;
                    this.reconnecting = false;

                    for (var id in this.devices) {
                        if(this.pairedDevices.indexOf(id) !== -1) {
                            module.exports.setAvailable(this.devices[id].data, "Offline");
                        }
                    }

                    this.updateAccessPointList();
                    this.updateClientList();
                    this.updateOfflineClients();

                    this.updateStatus('Connected');
                    this._debug('Login success');
                },
                err => {
                    handleLoginError(attempt, err)
                }
            );
        } catch(err) {
            this.handleLoginError(attempt, err)
        }
    }

    handleLoginError(attempt, err) {
        if (attempt !== this.attempt) {
            this._debug('Ignore failed attempt', attempt, 'current attempt', this.attempt);
            return;
        }
        this._debug('Login failed?', err)
        this.initialized = false;
        this.reconnecting = false;

        for (var id in this.devices) {
            if(this.pairedDevices.indexOf(id) !== -1) {
                module.exports.setUnavailable(this.devices[id].data, "Offline");
            }
        }

        this.updateStatus('Offline');
        Homey.manager('api').realtime('com.ubnt.unifi.lastPoll', { lastPoll: Date.now() });
        // {
        //     [HTTPError: Response code 503 (Service Unavailable)]
        //     message: 'Response code 503 (Service Unavailable)',
        //     host: '192.168.1.20:8443',
        //     hostname: '192.168.1.20',
        //     method: 'POST',
        //     path: '/api/login',
        //     statusCode: 503,
        //     statusMessage: 'Service Unavailable'
        // }
        this.reInitializeApi(err);
    }

    unifiCall() {
        if (!this.initialized) {
            return Promise.reject(Error('There is no connection with unifi controller yet... Check settings first.'));
        }
        const args = Array.prototype.slice.call(arguments);
        let method = args.shift();
        return this.unifi[method].apply(null, args)
    }

    updateOfflineClients(callback) {
        // For pairing, also get all known wifi devices
        Promise.resolve(this.unifiCall('get', 'stat/alluser?within=24'))
            .then( clients => {
                this._debug('Updating offline clients');
                let devices = {}
                clients.forEach(client => {
                    if (client.is_wired || this.pairedDevices.indexOf(client.mac) === -1 || typeof this.onlineClientList[ client.mac ] !== 'undefined' ) return;
                    this._debug(`Got offline client back ${client.name}/${client.hostname} with mac ${client.mac}`)

                    let name = client.name
                    if (typeof name === 'undefined') name = client.hostname;

                    devices[client.mac] = {
                        name: name,
                    };
                });
                this.offlineClientList = devices;

                // Update time of last successfull poll
                Homey.manager('api').realtime('com.ubnt.unifi.lastPoll', { lastPoll: Date.now() });
            }, err => { 
                this._debug("Error during getAllUser", err);

                // Retry login again if we were initialized
                if (this.initialized) {
                    this.reInitializeApi(err);
                }
            }
        );
    }

    updateAccessPointList() {
        /*
        { _id: '561ba2fc1170c38a36644b38',
    _uptime: 606846,
    adopted: true,
    atf_enabled: false,
    bandsteering_mode: 'prefer_5g',
    bytes: 1272639411,
    'bytes-d': 0,
    'bytes-r': 0,
    cfgversion: '6e88eace96806a7a',
    config_network: { ip: '192.168.1.29', type: 'dhcp' },
    connect_request_ip: '192.168.1.171',
    connect_request_port: '55541',
    considered_lost_at: 1483211680,
    device_id: '561ba2fc1170c38a36644b38',
    downlink_table: [],
    ethernet_table: [ [Object] ],
    fw_caps: 7,
    'guest-num_sta': 0,
    guest_token: 'F71FBBE60F9F63B3E67B1052D46EBC72',
    has_eth1: false,
    has_speaker: false,
    inform_authkey: 'ca45f4f49768c6c38b1e1c4d07eb4236',
    inform_ip: '192.168.1.20',
    inform_url: 'http://192.168.1.20:8080/inform',
    ip: '192.168.1.171',
    isolated: false,
    known_cfgversion: '6e88eace96806a7a',
    last_seen: 1483211575,
    locating: false,
    mac: '04:18:d6:c0:92:74',
    map_id: '560eb5e11170be6c2c483d0c',
    model: 'U7LT',
    'na-channel': 116,
    'na-eirp': 12,
    'na-extchannel': 1,
    'na-gain': 0,
    'na-guest-num_sta': 0,
    'na-num_sta': 0,
    'na-state': 'RUN',
    'na-tx_power': 12,
    'na-user-num_sta': 0,
    na_ast_be_xmit: 293,
    na_ast_cst: null,
    na_ast_txto: null,
    na_cu_self_rx: 0,
    na_cu_self_tx: 0,
    na_cu_total: 0,
    na_tx_packets: 0,
    na_tx_retries: 0,
    name: 'boven',
    next_heartbeat_at: 1483211610,
    'ng-channel': 1,
    'ng-eirp': 4,
    'ng-extchannel': 0,
    'ng-gain': 0,
    'ng-guest-num_sta': 0,
    'ng-num_sta': 0,
    'ng-state': 'RUN',
    'ng-tx_power': 4,
    'ng-user-num_sta': 0,
    ng_ast_be_xmit: 293,
    ng_ast_cst: null,
    ng_ast_txto: null,
    ng_cu_self_rx: 27,
    ng_cu_self_tx: 1,
    ng_cu_total: 29,
    ng_tx_packets: 0,
    ng_tx_retries: 0,
    num_sta: 0,
    port_stats: [],
    port_table: [],
    radio_na:
     { builtin_ant_gain: 0,
       builtin_antenna: true,
       channel: '116',
       has_dfs: true,
       has_fccdfs: true,
       ht: '80',
       is_11ac: true,
       max_txpower: 20,
       min_rssi_enabled: false,
       min_txpower: 4,
       name: 'wifi1',
       nss: 2,
       radio: 'na',
       tx_power: '0',
       tx_power_mode: 'medium' },
    radio_ng:
     { builtin_ant_gain: 0,
       builtin_antenna: true,
       channel: 'auto',
       ht: '20',
       max_txpower: 20,
       min_rssi_enabled: false,
       min_txpower: 4,
       name: 'wifi0',
       nss: 2,
       radio: 'ng',
       tx_power: '0',
       tx_power_mode: 'low' },
    radio_table: [ [Object], [Object] ],
    rx_bytes: 540080762,
    'rx_bytes-d': 0,
    scanning: false,
    serial: '0418D6C09274',
    site_id: '560d6d4a1170f4932f629511',
    spectrum_scanning: false,
    ssh_session_table: [],
    stat:
     { bytes: 1272639411,
       mac: '04:18:d6:c0:92:74',
       'na-rx_bytes': 495296736,
       'na-rx_crypts': 175,
       'na-rx_dropped': 175,
       'na-rx_errors': 175,
       'na-rx_packets': 315150,
       'na-tx_bytes': 600159459,
       'na-tx_dropped': 3763659,
       'na-tx_errors': 25164,
       'na-tx_packets': 515184,
       'ng-rx_bytes': 44784026,
       'ng-rx_crypts': 80,
       'ng-rx_dropped': 91,
       'ng-rx_errors': 91,
       'ng-rx_packets': 103611,
       'ng-tx_bytes': 132399190,
       'ng-tx_dropped': 3483368,
       'ng-tx_packets': 369072,
       'ng-tx_retries': 7440,
       rx_bytes: 540080762,
       rx_crypts: 255,
       rx_dropped: 266,
       rx_errors: 266,
       rx_packets: 418761,
       tx_bytes: 732558649,
       tx_dropped: 7247027,
       tx_errors: 25164,
       tx_packets: 884256,
       tx_retries: 7440,
       'uplink-rx_bytes': 1322923659,
       'uplink-rx_dropped': 300833,
       'uplink-rx_packets': 5361005,
       'uplink-tx_bytes': 394717431,
       'uplink-tx_packets': 1040126,
       'user-na-rx_bytes': 495296736,
       'user-na-rx_crypts': 175,
       'user-na-rx_dropped': 175,
       'user-na-rx_errors': 175,
       'user-na-rx_packets': 315150,
       'user-na-tx_bytes': 600159459,
       'user-na-tx_dropped': 3763659,
       'user-na-tx_errors': 25164,
       'user-na-tx_packets': 515184,
       'user-ng-rx_bytes': 44784026,
       'user-ng-rx_crypts': 80,
       'user-ng-rx_dropped': 91,
       'user-ng-rx_errors': 91,
       'user-ng-rx_packets': 103611,
       'user-ng-tx_bytes': 132399190,
       'user-ng-tx_dropped': 3483368,
       'user-ng-tx_packets': 369072,
       'user-ng-tx_retries': 7440,
       'user-rx_bytes': 540080762,
       'user-rx_crypts': 255,
       'user-rx_dropped': 266,
       'user-rx_errors': 266,
       'user-rx_packets': 418761,
       'user-tx_bytes': 732558649,
       'user-tx_dropped': 7247027,
       'user-tx_errors': 25164,
       'user-tx_packets': 884256,
       'user-tx_retries': 7440 },
    state: 1,
    sys_stats: {},
    tx_bytes: 732558649,
    'tx_bytes-d': 0,
    type: 'uap',
    upgradable: true,
    uplink:
     { full_duplex: true,
       ip: '0.0.0.0',
       mac: '04:18:d6:c0:92:74',
       max_speed: 1000,
       name: 'eth0',
       netmask: '0.0.0.0',
       num_port: 1,
       rx_bytes: 237486384,
       'rx_bytes-r': 340,
       rx_dropped: 101106,
       rx_errors: 0,
       rx_multicast: 0,
       rx_packets: 1725784,
       speed: 1000,
       tx_bytes: 83629228,
       'tx_bytes-r': 131,
       tx_dropped: 0,
       tx_errors: 0,
       tx_packets: 218993,
       type: 'wire',
       up: true },
    uplink_table: [],
    uptime: 606846,
    'user-num_sta': 0,
    vap_table: [ [Object], [Object] ],
    version: '3.7.7.4997',
    vwireEnabled: true,
    vwire_table: [],
    wifi_caps: 117,
    wlan_overrides: [],
    wlangroup_id_na: '562fbcef1170b9647f3434d3',
    wlangroup_id_ng: '562fbcef1170b9647f3434d3',
    x: 51.52891,
    x_authkey: 'ca45f4f49768c6c38b1e1c4d07eb4236',
    x_fingerprint: '9a:6b:b5:3a:26:b5:10:20:c9:6a:90:ee:e1:f0:d1:40',
    x_has_ssh_hostkey: true,
    x_ssh_hostkey_fingerprint: '9a:6b:b5:3a:26:b5:10:20:c9:6a:90:ee:e1:f0:d1:40',
    x_vwirekey: '75975029a9112a0e1959cb1992c22d16',
    y: 4.47164 },
        */
        this._debug('Fetching accesspoint list.');
        Promise.resolve(this.unifiCall('getAccessPoints'))
            .then( accessPoints => {
                this._debug('Accesspoints received');
                accessPoints.forEach(accessPoint => {
                    if (!accessPoint.adopted || accessPoint.type !== 'uap') return;
                    this.accessPointList[accessPoint.mac] = {
                        name: accessPoint.name,
                        mac: accessPoint.mac,
                        num_clients: null,
                    };
                })

                // Update time of last successfull poll
                Homey.manager('api').realtime('com.ubnt.unifi.lastPoll', { lastPoll: Date.now() });
            }, err => { 
                this._debug('Error while updating accesspoint list', err);

                // Retry login again if we were initialized
                if (this.initialized) {
                    this.reInitializeApi(err);
                }
            }
        );

        this._debug('Fetching user group list.');
        // For usergroup resolving, also get all user groups
        Promise.resolve(this.unifiCall('get', 'list/usergroup'))
            .then( groups => {
                groups.forEach(group => {
                    this._debug(`Got usergroup back ${group.name}/${group._id}`)
                    this.usergroupList[group._id] = group.name;
                });
            }, err => {
                this._debug("Error while updating user group list", err);

                // Retry login again if we were initialized
                if (this.initialized) {
                    this.reInitializeApi(err);
                }
            }
        );
    }

    updateClientList(callback) {
        // [{ _id: '561aabe61170c38a36644b07',
        // _is_guest_by_uap: false,
        // _is_guest_by_ugw: false,
        // _last_seen_by_uap: 1483038674,
        // _last_seen_by_ugw: 1483038665,
        // _uptime_by_uap: 11442,
        // _uptime_by_ugw: 8,
        // ap_mac: '04:18:d6:c0:93:fc',
        // assoc_time: 1482923115,
        // bssid: '06:18:d6:c2:93:fc',
        // 'bytes-r': 36997,
        // ccq: 333,
        // channel: 36,
        // dev_cat: 6,
        // dev_family: 3,
        // dev_id: 376,
        // dev_vendor: 8,
        // dpi_stats: [ [Object] ],
        // dpi_stats_last_updated: 1483038665,
        // essid: 'Luminous_N',
        // first_seen: 1444588517,
        // gw_mac: '04:18:d6:f0:b7:0b',
        // hostname: 'android-abffdc7abca62e86',
        // idletime: 0,
        // ip: '192.168.1.108',
        // is_guest: false,
        // is_wired: false,
        // last_seen: 1483038674,
        // latest_assoc_time: 1483038657,
        // mac: 'f8:a9:d0:02:12:9d',
        // name: 'nienke-telefoon',
        // network: 'LAN',
        // network_id: '560d6d641170f4932f629516',
        // noise: -99,
        // note: '',
        // noted: false,
        // os_class: 5,
        // os_name: 57,
        // oui: 'LgElectr',
        // powersave_enabled: false,
        // qos_policy_applied: true,
        // radio: 'na',
        // radio_proto: 'ac',
        // roam_count: 5,
        // rssi: 44,
        // rx_bytes: 292032018,
        // 'rx_bytes-r': 14226,
        // rx_packets: 151171,
        // rx_rate: 433300,
        // signal: -55,
        // site_id: '560d6d4a1170f4932f629511',
        // tx_bytes: 261410740,
        // 'tx_bytes-r': 22771,
        // tx_packets: 230942,
        // tx_power: 40,
        // tx_rate: 433300,
        // uptime: 115559,
        // user_id: '561aabe61170c38a36644b07',
        // usergroup_id: '',
        // vlan: 0 } ]
        Promise.resolve(this.unifiCall('getClients'))
            .then( clients => {
                let devices = {}
                clients.forEach(client => {
                    if (client.is_wired) return;
                    this._debug(`Got client back ${client.name}/${client.hostname} with mac ${client.mac}, idle:`, client.idletime)

                    let name = client.name
                    if (typeof name === 'undefined') name = client.hostname;

                    /*
                      rssi: 24,
                      signal: -76,
                      noise: -100,
                      results in : 47% (-71 dBm)

                    rssi function(a) {
                        return a = parseFloat(a),
                        a ? (a = Math.min(45, Math.max(a, 5)),
                        a = (a - 5) / 40 * 99,
                        (0 === a ? "0" : a.toPrecision(2)) + "%") : ""
                    }
                    rssiToDbm function(rssi) {
                        if (void 0 !== rssi && null !== rssi) {
                            var c = rssi - 95;
                            return c + " " + a.instant("DEVICE_RADIO_TRANSMIT_POWER_DBM")
                        }
                        return ""
                    }
                    */
                    // Update RSSI according to calculations found in controller software.
                    let signal = Math.min(45, Math.max(parseFloat(client.rssi), 5));
                    signal = (signal - 5) / 40 * 99;

                    let rssi = parseFloat(client.rssi) - 95;

                    devices[client.mac] = {
                        'name': name,
                        'rssi': parseInt(rssi.toPrecision(2)),
                        'signal': parseInt(signal),
                        'ap_mac': client.ap_mac, 
                        'roam_count': client.roam_count, 
                        'radio_proto': client.radio_proto, 
                        'idletime': client.idletime,
                        'guest': client.is_guest,
                        'essid': client.essid,
                        'group': this.usergroupList[client.usergroup_id] || client.usergroup_id
                    };
                });

                // Set the clientlist to current device list
                this.onlineClientList = devices;

                // Add yet unregistered devices
                for (var id in devices) {
                    if(!(id in this.devices) && this.pairedDevices.indexOf(id) === -1) {
                        this.initNode({id: id});
                    }
                }

                // Run updates for paired on and offline devices
                for (var id in this.devices) {
                    this.updateNode(id);
                }

                if(!this.firstUpdateDone) {
                    this.firstUpdateDone = true;
                }

                if (this.accessPointList) {
                    // this._debug('Checking accesspoint triggers');
                    // Check if we need to trigger first_device_connected for some accesspoint
                    for (var ap_mac in this.accessPointList) {
                        // this._debug(`Checking AP ${ap_mac}`);
                        let num_clients = 0;

                        for (var id in this.devices) {
                            if (typeof devices[id] === 'undefined') continue;
                            if (devices[id].ap_mac === ap_mac) num_clients++;
                        }

                        // this._debug(`Got ${num_clients} for accesspoint`, this.getAccessPointName(ap_mac), `, prev:`, this.accessPointList[ap_mac].num_clients)
                        // Number of clients changed
                        if (num_clients !== this.accessPointList[ap_mac].num_clients && this.accessPointList[ap_mac].num_clients !== null) {
                            let state = {
                                accessPoint: this.getAccessPointName(ap_mac),
                                last_num: this.accessPointList[ap_mac].num_clients,
                                curr_num: num_clients,
                            };

                            if (state.last_num === 0 && state.curr_num >= 0) {
                                this._debug("Triggering first_device_connected with state", state);
                                Homey.manager('flow').trigger(
                                    'first_device_connected',
                                    {},
                                    state,
                                    function(err, result){
                                        if( err ) return Homey.error(err);
                                    }
                                );
                            }
                            if (state.last_num > 0 && state.curr_num === 0) {
                                this._debug("Triggering last_device_disconnected with state", state);
                                Homey.manager('flow').trigger(
                                    'last_device_disconnected',
                                    {},
                                    state,
                                    function(err, result){
                                        if( err ) return Homey.error(err);
                                    }
                                );
                            }
                        }
                        this.accessPointList[ap_mac].num_clients = num_clients;
                    }
                }

                // Update time of last successfull poll
                Homey.manager('api').realtime('com.ubnt.unifi.lastPoll', { lastPoll: Date.now() });
            }, err => {
                this._debug('Got error while updating client list', err);

                // Retry login again if we were initialized
                if (this.initialized) {
                    this.reInitializeApi(err);
                }
            }
        );
    }

    /**
     * Method that will be called on driver initialisation.
     * @param devicesData
     * @param callback
     * @returns {*}
     */
    init( devicesData, callback ) {
        this.initializeApi();

        // Start a poller, to check the device status every 30 secs.
        this.pollIntervals.push(setInterval(() => {
            if (!this.initialized) return this._debug('There is no connection yet, please check your settings!');
            this._debug(`Polling clients (every ${this.options.defaultPollInterval} secs)`);
            this.updateClientList();
        }, this.options.defaultPollInterval * 1000))
        // Start a poller, to check the device status every 12 hrs.
        this.pollIntervals.push(setInterval(() => {
            if (!this.initialized) return this._debug('There is no connection yet, please check your settings!');
            this._debug('Polling offline clients and AP\'s (once every 12 hrs)');
            this.updateOfflineClients();
            this.updateAccessPointList();
        }, (12 * 3600 * 1000)))

        // Device condition to check if a device is connected
        Homey.manager('flow').on('condition.wifi_client_connected', function( callback, args ){
            let node = this.getNode(args.device);
            if (node) {
                this._debug('Checking condition "wifi_client_connected", state: ', node.state.alarm_connected)
                return callback(null, node.state.alarm_connected);
            }

            callback(new Error('Node not found in driver'), false);
        }.bind(this));

        // Device condition to check if it is connected to the given accesspoint
        Homey.manager('flow').on('condition.wifi_client_connected_with_ap', function( callback, args ){
            let node = this.getNode(args.device);
            if (node) {
                this._debug('Checking condition "wifi_client_connected_with_ap", state: ', node.state.connected_ap, args)
                return callback(null, node.state.connected_ap === args.accessPoint.name);
            }
            callback(new Error('Node not found in driver'), false);
        }.bind(this));
        

        if (devicesData.length < 1) return callback(null, true);

        let done = 0;

        // when the driver starts, Homey rebooted. Initialise all previously paired devices.
        devicesData.forEach((deviceData) => {
            // Initialize the nodes
            this.initNode(deviceData, () => {
                Homey.log('init', deviceData);

                // let Homey know the driver is ready
                if (++done === devicesData.length) return callback(null, true);
            });
        });

    }

    getAccessPointName(accessPointId) {
        if (typeof this.accessPointList[ accessPointId ] === 'undefined') return null;
        return this.accessPointList[ accessPointId ].name;
    }

    getNodeState(deviceDataId) {
        let state = {};
        if (typeof this.onlineClientList[deviceDataId] === 'undefined') {
            state = {
                'alarm_connected': false,
                'measure_rssi': null,
                'measure_signal': null,
                'connected_ap': null,
            }
        } else {
            state = {
                'alarm_connected': true,
                'measure_rssi': this.onlineClientList[deviceDataId]['rssi'],
                'measure_signal': this.onlineClientList[deviceDataId]['signal'],
                'connected_ap': this.getAccessPointName(this.onlineClientList[deviceDataId]['ap_mac']),
            }
        }
        return state;
    }
    getNodeName(deviceDataId) {
        let name = '';
        if (typeof this.offlineClientList[deviceDataId] !== 'undefined') name = this.offlineClientList[deviceDataId].name;
        if (typeof this.onlineClientList[deviceDataId] !== 'undefined') name = this.onlineClientList[deviceDataId].name;
        return name;
    }
    getNodeGuest(deviceDataId) {
        let guest = '';
        if (typeof this.offlineClientList[deviceDataId] !== 'undefined') guest = this.offlineClientList[deviceDataId].guest;
        if (typeof this.onlineClientList[deviceDataId] !== 'undefined') guest = this.onlineClientList[deviceDataId].guest;
        return guest;
    }
    getNodeGroup(deviceDataId) {
        let group = '';
        if (typeof this.offlineClientList[deviceDataId] !== 'undefined') group = this.offlineClientList[deviceDataId].group;
        if (typeof this.onlineClientList[deviceDataId] !== 'undefined') group = this.onlineClientList[deviceDataId].group;
        return group;
    }
    getNodeEssid(deviceDataId) {
        let essid = '';
        if (typeof this.offlineClientList[deviceDataId] !== 'undefined') essid = this.offlineClientList[deviceDataId].essid;
        if (typeof this.onlineClientList[deviceDataId] !== 'undefined') essid = this.onlineClientList[deviceDataId].essid;
        return essid;
    }

    updateNode(deviceDataId) {
        let state = this.getNodeState(deviceDataId);

        // Also update the name of the local device list.
        let nodeName = this.getNodeName(deviceDataId);
        if (nodeName) {
            this.devices[ deviceDataId ].name = nodeName;
            this._debug('Updating node ', { id: deviceDataId, name: nodeName });
        }

        let nodeGroup = this.getNodeGroup(deviceDataId);
        if (nodeGroup) {
            this.devices[ deviceDataId ].group = nodeGroup;
        }

        let nodeGuest = this.getNodeGuest(deviceDataId);
        if (nodeGuest) {
            this.devices[ deviceDataId ].guest = nodeGuest;
        }

        let nodeEssid = this.getNodeEssid(deviceDataId);
        if (nodeEssid) {
            this.devices[ deviceDataId ].essid = nodeEssid;
        }

        let forceUpdate = false;
        if(this.pairedDevices.indexOf(deviceDataId) === -1 && this.firstUpdateDone) {
            forceUpdate = true;
        }

        for (var capabilityId in state) {
            if (state[ capabilityId ] != this.devices[ deviceDataId ].state[ capabilityId ]) {
                if(this.pairedDevices.indexOf(deviceDataId) !== -1) {
                    this._debug(`Updating capabilityId ${capabilityId} with value "${state[capabilityId]}"`, this.devices[ deviceDataId ].data);
                    if (capabilityId == 'connected_ap' && (forceUpdate || this.devices[deviceDataId].state[capabilityId] !== null)) {
                        let tokens = {
                            'accessPoint': state[capabilityId],
                        };

                        this._debug(`Running device trigger "wifi_client_roamed", tokens: `, tokens)
                        Homey.manager('flow').triggerDevice(
                            'wifi_client_roamed',
                            tokens,
                            state,
                            this.devices[deviceDataId].data,
                            function (err, result) {
                                if (err) return Homey.error(err);
                            }
                        );

                        tokens['accessPoint'] = this.devices[deviceDataId].state[capabilityId]; // change to previous AP
                        this._debug(`Running device trigger "wifi_client_roamed_to_ap", tokens: `, tokens)
                        Homey.manager('flow').triggerDevice(
                            'wifi_client_roamed_to_ap',
                            tokens,
                            state,
                            this.devices[deviceDataId].data,
                            function (err, result) {
                                if (err) return Homey.error(err);
                            }
                        );
                    }
                }

                // Run triggers, if changed during runtime, initial state of null is being skipped.
                if (capabilityId == 'alarm_connected' && (forceUpdate || this.devices[deviceDataId].state[capabilityId] !== null)) {
                    this._debug('TRIGGERED Node connection change', { id: deviceDataId, name: nodeName });

                    let deviceTrigger = 'wifi_client_disconnected';
                    let appTrigger = 'a_client_disconnected';
                    let tokens = {};
                    let appTokens = {
                        'mac': deviceDataId,
                        'name': this.devices[ deviceDataId ].name,
                        'guest': this.devices[ deviceDataId ].guest,
                        'group': this.devices[ deviceDataId ].group
                    };

                    if (state[ capabilityId ] === true) {
                        deviceTrigger = 'wifi_client_connected';
                        appTrigger = 'a_client_connected';
                        tokens = {
                            rssi: state['measure_rssi'],
                            signal: state['measure_signal']
                        };
                    }

                    if(this.pairedDevices.indexOf(deviceDataId) !== -1) {
                        // Trigger the device flow 'wifi_client_(dis)connected'
                        this._debug(`Running device trigger "${deviceTrigger}", tokens: `, tokens)
                        Homey.manager('flow').triggerDevice(
                            deviceTrigger,
                            tokens,
                            state,
                            this.devices[deviceDataId].data,
                            function (err, result) {
                                if (err) return Homey.error(err);
                            }
                        );
                    }

                    this._debug(`Running app trigger "${appTrigger}", tokens:`, appTokens)
                    // Trigger the app flow 'a_client_(dis)connected'
                    Homey.manager('flow').trigger(
                        appTrigger,
                        appTokens,
                        state,
                        function(err, result){
                            if( err ) return Homey.error(err);
                        }
                    );
                }

                if(this.pairedDevices.indexOf(deviceDataId) !== -1) {
                    // Send the new value to Homey.
                    if (typeof this.capabilities[capabilityId] !== 'undefined') {
                        this._debug('   - Sending to Homey');
                        this.realtime(this.devices[deviceDataId].data, capabilityId, state[capabilityId]);
                    }
                }

                this._debug('   - Updating in device state');
                this.devices[deviceDataId].state[capabilityId] = state[capabilityId];
            }
        }
    }

    initNode(deviceData, callback) {
        callback = callback || function () {};
        this.devices[ deviceData.id ] = {};
        this.devices[ deviceData.id ].state = {
            'alarm_connected': null,
            'measure_rssi': null,
            'measure_signal': null,
            'connected_ap': null,
        };
        this.devices[ deviceData.id ].data = deviceData;
        this.devices[ deviceData.id ].name = '<pending>';
        this.devices[ deviceData.id ].group = '<pending>';
        this.devices[ deviceData.id ].essid = '<pending>';
        this.devices[ deviceData.id ].guest = false;
        callback();
    }

    pair( socket ) {

        // this method is run when Homey.emit('list_devices') is run on the front-end
        // which happens when you use the template `list_devices`
        socket.on('list_devices', function( data, callback ){
            // Homey.log('Initializing ubiquitiUnifi with options', options)
            let devices = []

            for (var id in this.onlineClientList) {
                devices.push({
                    name: this.onlineClientList[id]['name'],
                    // capabilities: [ "alarm_connected", "measure_rssi",  "measure_signal" ],
                    data: {
                        id: id,
                    }
                })
            }

            let done = () => {
                if (devices.length == 0) {
                    callback({
                        'en': 'No clients were found, please check your credentials and/or controller',
                        'nl': 'Er zijn nog geen wifi clients gedetecteerd, controlleer login gegevens en/of controller.'
                    }, null);
                }

                callback(null, devices);
            };

            // For pairing, also get all known wifi devices
            Promise.resolve(this.unifiCall('get', 'stat/alluser?within=24'))
                .then( clients => {
                    clients.forEach(client => {
                        if (client.is_wired || typeof this.onlineClientList[ client.mac ] !== 'undefined' ) return;
                        this._debug(`Got offline client back ${client.name}/${client.hostname} with mac ${client.mac}`)

                        let name = client.name
                        if (typeof name === 'undefined') name = client.hostname;

                        devices.push({
                            name: name,
                            data: {
                                id: client.mac,
                            }
                        });
                    });
                }, err => {
                    this._debug("Error during getAllUser", err);

                    // Retry login again if we were initialized
                    if (this.initialized) {
                        this.reInitializeApi(err);
                    }

                    done();
                }
            );
        }.bind(this))
    }

    /**
     * Method that will be called when a user
     * adds a device/node.
     * @param deviceData
     * @param callback
     * @returns {*}
     */
    added(deviceData, callback) {
        callback = callback || function () {
            };

        this.initNode(deviceData);
        return callback(null, true);
    }

    /**
     * Method that will be called when a user
     * deletes a device/node.
     * @param deviceData
     * @param callback
     */
    deleted(deviceData, callback) {
        callback = callback || function () {
            };

        this.deleteNode(deviceData);
        return callback(null, true);
    }

    /**
     * Returns node from internal nodes list.
     * @param deviceData
     * @returns {*}
     */
    getNode(deviceData) {

        if (!(deviceData && deviceData.id)) return new Error('invalid_device_data');
        if(this.pairedDevices.indexOf(deviceData.id) === -1) this.pairedDevices.push(deviceData.id);

        return this.devices[deviceData.id] || new Error('invalid_node');
    }

    /**
     * Method called when a user
     * deletes a device/node from Homey.
     * @param deviceData
     * @returns {Error}
     */
    deleteNode(deviceData) {
        if (!(deviceData && deviceData.id)) return new Error('invalid_device_data');

        const node = this.getNode(deviceData);
        if (node instanceof Error) return node;

        // Remove it from the nodes list
        delete this.devices[deviceData.id];
    }

    /**
     * Debug method that will enable logging when
     * debug: true is provided in the main options
     * object.
     * @private
     */
    _debug() {
        if (this.options.debug || true) {
            const args = Array.prototype.slice.call(arguments);
            args.unshift('[debug]');
            Homey.manager('api').realtime('com.ubnt.unifi.debug', args.join(' '));
            console.log.apply(null, args);
        }
    }
}

/**
 * Plain js implementation of underscore's findWhere.
 * @param array
 * @param criteria
 * @returns {*}
 */
function findWhere(array, criteria) {
    return array.find(item => Object.keys(criteria).every(key => item[key] === criteria[key]));
}

// module.exports.settings = function( device_data, newSettingsObj, oldSettingsObj, changedKeysArr, callback ) {
//     // see settings
// }

// a helper method to get a device from the devices list by it's device_data object
function getDeviceByData( device_data ) {
    var device = devices[ device_data.id ];
    if( typeof device === 'undefined' ) {
        return new Error("invalid_device");
    } else {
        return device;
    }
}

module.exports = new unifi( 'wifi-client', {});
