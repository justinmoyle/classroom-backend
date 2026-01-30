import arcjet, { detectBot, shield, slidingWindow } from '@arcjet/node';

let aj: ReturnType<typeof arcjet> | undefined;

if (process.env.ARCJET_KEY) {
    aj = arcjet({
        key: process.env.ARCJET_KEY,
        rules: [
            shield({mode: 'LIVE'}),
            detectBot({
                mode: 'LIVE',
                allow: [
                    'CATEGORY:SEARCH_ENGINE',
                    'CATEGORY:PREVIEW',
                ],
            }),
            slidingWindow({
                mode: 'LIVE',
                interval: '1m',
                max: 60,
            }),
        ],
    });
} else if (process.env.NODE_ENV !== 'test') {
    throw new Error('ARCJET_KEY env is required');
}

export default aj;