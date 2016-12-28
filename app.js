"use strict";

function init() {
	
	Homey.log("com.ubnt.unifi started...");
	
	let appSettings = Homey.manager('settings').get('com.ubnt.unifi.settings');
	// Homey.log('Current appSettings: ', appSettings);

	if (typeof appSettings === 'undefined') {
		Homey.log('Initializing com.ubnt.unifi.settings with some settings')
		Homey.manager('settings').set('com.ubnt.unifi.settings', {
			'host': 'unifi',
			'port': '8443',
			'user': 'admin',
			'pass': 'password'
		});
	}

}

module.exports.init = init;