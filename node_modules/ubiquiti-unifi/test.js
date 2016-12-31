'use strict';

import test from 'ava';
import nock from 'nock';
import unifi from './';

const options = {
    url: 'https://172.16.0.10',
    port: 8443,
    username: 'admin',
    password: 'password',
    site: 'default'
};

test('default options', t => {
    const scope = nock('https://127.0.0.1:8443')
        .post('/api/login', {
            username: '',
            password: ''
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi().then(() => {
        t.true(scope.isDone() === true);
    });
});

test('needs all options', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi(options).then(() => {
        t.true(scope.isDone() === true);
    });
});

test('needs all options', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi(options).then(() => {
        t.true(scope.isDone() === true);
    });
});

test('sets ssl agent on ignoreSsl option', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    const optionsSsl = Object.assign({}, options, {
        ignoreSsl: true
    });

    return unifi(optionsSsl).then(() => {
        t.true(scope.isDone() === true);
    });
});

test('fails if no cookie is returned from login', t => {
    nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {});

    t.throws(unifi(options), 'Invalid Login Cookie');
});

test('api #get', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi(options).then((router) => {
        t.true(scope.isDone() === true);

        const scopeAccess = nock('https://172.16.0.10:8443')
            .get('/api/s/default/undefined')
            .reply(201, {data: { test: 'test' }});

        return router.get().then(data => {
            t.deepEqual(data, { test: 'test' });
            t.true(scopeAccess.isDone() === true);
        });
    });
});

test('api #getAccessPoints', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi(options).then((router) => {
        t.true(scope.isDone() === true);

        const scopeAccess = nock('https://172.16.0.10:8443')
            .get('/api/s/default/stat/device')
            .reply(201, {data: { test: 'test' }});

        return router.getAccessPoints().then(data => {
            t.deepEqual(data, { test: 'test' });
            t.true(scopeAccess.isDone() === true);
        });
    });
});

test('api #getClients', t => {
    const scope = nock('https://172.16.0.10:8443')
        .post('/api/login', {
            username: 'admin',
            password: 'password'
        })
        .reply(201, {}, {
            'set-cookie': 'test'
        });

    return unifi(options).then((router) => {
        t.true(scope.isDone() === true);

        const scopeAccess = nock('https://172.16.0.10:8443')
            .get('/api/s/default/stat/sta')
            .reply(201, {data: { test: 'test' }});

        return router.getClients().then(data => {
            t.deepEqual(data, { test: 'test' });
            t.true(scopeAccess.isDone() === true);
        });
    });
});
