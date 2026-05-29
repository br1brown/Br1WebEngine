import type { Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { serverEnv } from '../server-env';

/** Alias sulla sezione server (timeout proxy), valutata al caricamento del modulo. */
const { server: nodeCfg } = serverEnv;

/**
 * Istanza http-proxy-middleware creata pigramente alla prima richiesta.
 *
 * createProxyMiddleware legge `target` al momento della costruzione: crearla a
 * runtime (non all'import) preserva il contratto lazy di server-env, così la
 * route-extraction del build può importare server.ts senza BACKEND_ORIGIN.
 * A quel punto assertRequiredEnv() ha già garantito che l'origin sia presente.
 */
let proxy: RequestHandler | undefined;

function buildProxy(): RequestHandler {
    return createProxyMiddleware({
        target: serverEnv.backend.origin,
        // changeOrigin riscrive l'Host verso il backend (come faceva fetch leggendo l'URL).
        changeOrigin: true,
        // Timeout sulla risposta del backend → on.error → 504.
        proxyTimeout: nodeCfg.proxyTimeout,
        // xfwd:false: NON lasciamo che la libreria appenda l'IP socket all'eventuale
        // x-forwarded-for del client. La catena XFF la controlliamo noi in on.proxyReq.
        xfwd: false,
        on: {
            proxyReq: (proxyReq, req) => {
                // req è l'IncomingMessage arricchito da Express: lo trattiamo come Request.
                const r = req as unknown as Request;

                // BFF: la chiave API è un segreto server-side, iniettata qui e mai esposta al browser.
                proxyReq.setHeader('x-api-key', serverEnv.backend.apiKey);

                // X-Forwarded-For: SEMPRE req.ip (risolto da Express via `trust proxy`, fidandosi
                // dell'header solo dagli hop fidati). http-proxy copia di default gli header in ingresso,
                // quindi un eventuale x-forwarded-for del client sarebbe inoltrato verbatim: setHeader lo
                // sovrascrive, removeHeader lo elimina quando req.ip manca. Inoltrarlo verbatim
                // permetterebbe lo spoofing dell'IP e l'aggiramento del rate limiter del backend.
                if (r.ip) proxyReq.setHeader('x-forwarded-for', r.ip);
                else proxyReq.removeHeader('x-forwarded-for');

                // Proto/host: usa l'header del client se presente (siamo dietro NPM), altrimenti i valori locali.
                const proto = (r.headers['x-forwarded-proto'] as string) || r.protocol;
                const host = (r.headers['x-forwarded-host'] as string) || r.get('host');
                if (proto) proxyReq.setHeader('x-forwarded-proto', proto);
                if (host) proxyReq.setHeader('x-forwarded-host', host);
            },
            error: (err, _req, res) => {
                console.error('[proxy /api]', err);
                const response = res as Response;
                if (!response.headersSent) {
                    response.status(504).json({
                        status: 504,
                        title: 'Gateway Timeout',
                        detail: 'Il backend non ha risposto in tempo.',
                    });
                }
            },
        },
    });
}

/**
 * Proxy /api/* → backend. Montato su API_PREFIX in server.ts: Express strippa il
 * prefisso da req.url, quindi http-proxy-middleware inoltra il path già pulito al backend.
 * Delega all'istanza lazy creata alla prima richiesta.
 */
export const apiProxyHandler: RequestHandler = (req, res, next) => {
    (proxy ??= buildProxy())(req, res, next);
};
