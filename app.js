"use strict";

function init() {
	
	Homey.log("com.ubnt.unifi started...");
	
	// Reset status to offline (until the driver is connected)
	Homey.manager('settings').set('com.ubnt.unifi.status', 'Offline');

	let appSettings = Homey.manager('settings').get('com.ubnt.unifi.settings');
	// Homey.log('Current appSettings: ', appSettings);

	if (typeof appSettings === 'undefined') {
		Homey.log('Initializing com.ubnt.unifi.settings with some settings')
		appSettings = {
			'host': 'unifi',
			'port': '8443',
			'user': 'ubnt',
			'pass': 'ubnt',
			'site': 'default'
		};
		Homey.manager('settings').set('com.ubnt.unifi.settings', appSettings);
	}

	let getAccessPointList = function( callback, args ){
		let driver = Homey.manager( 'drivers' ).getDriver('wifi-client');

		// Homey.log(driver);
		let devices = [];
		for (var id in driver.accessPointList) {
			let name = driver.getAccessPointName(id);
			if (args.hasOwnProperty('query') && args.query && name.indexOf(args.query) === -1)
				continue;

			devices.push({
				'name': name,
				'icon': '/app/com.ubnt.unifi/assets/accesspoint.svg',
				'id': id
			})
		}
		devices.sort((a,b) => { return a.name > b.name; })

		// Homey.log(devices);
		callback(null, devices);
	}
	Homey.manager('flow').on('trigger.first_device_connected.accessPoint.autocomplete', getAccessPointList);
	Homey.manager('flow').on('trigger.wifi_client_roamed_to_ap.accessPoint.autocomplete', getAccessPointList);
	Homey.manager('flow').on('condition.wifi_client_connected_with_ap.accessPoint.autocomplete', getAccessPointList);
	Homey.manager('flow').on('condition.ap_has_clients_connected.accessPoint.autocomplete', getAccessPointList);

	// Check if trigger accesspoint arg is equal to state connected_ap
	Homey.manager('flow').on('trigger.wifi_client_roamed_to_ap', function( callback, args, state ) {
		console.log(`Trigger wifi_client_roamed_to_ap, checking if ${args.accessPoint.name} === ${state.connected_ap}`);
		if( args.accessPoint.name === state.connected_ap ) {
			callback( null, true ); // If true, this flow should run. The callback is (err, result)-style.
		} else {
			callback( null, false );
		}
	});

	let checkAccessPointArgState = function (callback, args, state) {
		console.log(`Trigger first_device_connected, checking if ${args.accessPoint.name} === ${state.accessPoint}`, state);
		if( args.accessPoint.name === state.accessPoint) {
			console.log('  - Trigger success')
			callback( null, true ); // If true, this flow should run. The callback is (err, result)-style.
		} else {
			callback( null, false );
		}
	}
	// Check if trigger accesspoint arg is equal to state connected_ap
	Homey.manager('flow').on('trigger.first_device_connected', checkAccessPointArgState);
	Homey.manager('flow').on('trigger.last_device_disconnected', checkAccessPointArgState);

	// Condition checks
	Homey.manager('flow').on('condition.ap_has_clients_connected', function (callback, args) {
		console.log(`Condition ap_has_clients_connected, checking if ${args.accessPoint.name} has clients`, args);
		let driver = Homey.manager( 'drivers' ).getDriver( 'wifi-client' );

		// If the accesspoint is not known anymore, then return false.
		if (typeof driver.accessPointList[ args.accessPoint.id ] === 'undefined')
			return callback(null, false);

		console.log(`  - num clients:`, driver.accessPointList[args.accessPoint.id].num_clients);
		callback(null, driver.accessPointList[ args.accessPoint.id ].num_clients > 0);
	});
	Homey.manager('flow').on('condition.clients_connected', function (callback, args) {
		console.log(`Condition clients_connected`);

		// If any of the accesspoints have clients, then return true.
		let driver = Homey.manager( 'drivers' ).getDriver( 'wifi-client' )
		for (var id in driver.accessPointList) {
			if (driver.accessPointList[id].num_clients > 0) {
				console.log('  - Got at least one connection on accesspoint', driver.accessPointList[id].name);
				callback(null, true);
				return true;
			}
		}
		console.log('  - Found no clients yet...'); // Could still be initializing though (just after app start)
		callback(null, false);
	});
}

module.exports.init = init;
