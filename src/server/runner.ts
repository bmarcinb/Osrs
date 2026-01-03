import 'source-map-support/register';

import { initErrorHandling } from '@engine/util/error-handling';
import { activeWorld } from '@engine/world';
import { logger } from '@runejs/common';
import { launchLoginServer } from '@runejs/login-server';
import { launchUpdateServer } from '@runejs/update-server';
import { launchGameServer } from '@server/game/game-server';
import { launchWebApiServer } from '@server/web-api-server';

const shutdownEvents = [
    'SIGHUP',
    'SIGINT',
    'SIGQUIT',
    'SIGILL',
    'SIGTRAP',
    'SIGABRT',
    'SIGBUS',
    'SIGFPE',
    'SIGUSR1',
    'SIGSEGV',
    'SIGUSR2',
    'SIGTERM',
];

let running: boolean = true;
let type: 'game' | 'login' | 'update' | 'webapi' = 'game';

if (process.argv.indexOf('-login') !== -1) {
    type = 'login';
} else if (process.argv.indexOf('-update') !== -1) {
    type = 'update';
} else if (process.argv.indexOf('-webapi') !== -1) {
    type = 'webapi';
}

shutdownEvents.forEach(signal =>
    process.on(signal as any, () => {
        if (!running) {
            return;
        }
        running = false;

        logger.warn(`${signal} received.`);

        if (type === 'game') {
            activeWorld?.shutdown();
        }

        logger.info(`${type.charAt(0).toUpperCase()}${type.substring(1)} Server shutting down...`);
        process.exit(0);
    }),
);

initErrorHandling();

if (type === 'game') {
    launchGameServer();
} else if (type === 'login') {
    launchLoginServer();
} else if (type === 'update') {
    launchUpdateServer();
} else if (type === 'webapi') {
    launchWebApiServer();
}
