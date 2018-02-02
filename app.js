"use strict";

const Homey = require('homey')
const Settings = Homey.ManagerSettings;

const _settingsKey = 'com.ubnt.unifi.settings'

class UnifiApp extends Homey.App {

    onInit() {
        this.log('com.ubnt.unifi started...');
        this.setStatus('Offline');
        this.initSettings();

        this.log('- Loaded settings', this.appSettings)
    }

    initSettings(key) {
        this.appSettings = Settings.get(_settingsKey);
        if (typeof this.appSettings === 'undefined') {
            this.log('Freshly initializing com.ubnt.unifi.settings with some defaults')
            this.appSettings = {
                'host': 'unifi',
                'port': '8443',
                'user': 'ubnt',
                'pass': 'ubnt',
                'site': 'default'
            };
            this.saveSettings();
        }
    }

    updateSettings(settings) {
        this.log('Got new settings:', settings)
        this.appSettings = settings;
        this.saveSettings();
        Homey.ManagerDrivers.getDriver('wifi-client').getSettings(_settingsKey);
    }

    saveSettings() {
        if (typeof this.appSettings === 'undefined') {
            this.log('Not saving settings; settings empty!');
            return;
        }

        this.log('Save settings.');
        Settings.set(_settingsKey, this.appSettings)
    }

    setStatus(status) {
        Settings.set('com.ubnt.unifi.status', status);
    }
}

module.exports = UnifiApp;
