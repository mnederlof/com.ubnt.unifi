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

    initSettings() {
        let settingsInitialized = false;
        Settings.getKeys().forEach(key => {
            if (key == _settingsKey) {
                settingsInitialized = true;
            }
        });

        if (settingsInitialized) {
            this.log('Found settings key', _settingsKey)
            this.appSettings = Settings.get(_settingsKey);
            return;
        }

        this.log('Freshly initializing com.ubnt.unifi.settings with some defaults')
        this.updateSettings({
            'host': 'unifi',
            'port': '8443',
            'user': 'ubnt',
            'pass': 'ubnt',
            'site': 'default'
        });
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
