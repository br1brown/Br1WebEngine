import express, { type NextFunction, type Request, type Response } from 'express';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
    AngularNodeAppEngine,
    createNodeRequestHandler,
    isMainModule,
    writeResponseToNodeResponse
} from '@angular/ssr/node';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');
const immutableAssetPattern =
    /\.[0-9a-f]{16,}\.(?:js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico)$/i;

const app = express();
const angularApp = new AngularNodeAppEngine();
const port = Number(process.env['PORT'] ?? process.env['FRONTEND_PORT'] ?? 3000);
const backendPort = Number(process.env['BACKEND_PORT'] ?? 8080);
const externalApiOrigin = process.env['API_URL']?.trim().replace(/\/$/, '');
const internalApiOrigin = `http://backend:${backendPort}`;
const apiOrigin = externalApiOrigin || internalApiOrigin;
const proxyTimeoutMs = Number(process.env['PROXY_TIMEOUT_MS'] ?? 30_000);

app.disable('x-powered-by');
app.set('trust proxy', true);

function shouldProxyRequestBody(request: Request): boolean {
    return request.method !== 'GET' && request.method !== 'HEAD';
}

function getForwardedForHeader(request: Request): string | null {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (Array.isArray(forwardedFor)) {
        return forwardedFor.join(', ');
    }

    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
        return forwardedFor;
    }

    return request.ip || request.socket.remoteAddress || null;
}

function buildProxyHeaders(request: Request): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(request.headers)) {
        if (value === undefined || name === 'host') {
            continue;
        }

        if (Array.isArray(value)) {
            value.forEach(item => headers.append(name, item));
            continue;
        }

        headers.set(name, value);
    }

    const forwardedFor = getForwardedForHeader(request);
    const forwardedProto = request.header('x-forwarded-proto') ?? request.protocol;
    const forwardedHost = request.header('x-forwarded-host') ?? request.get('host');

    if (forwardedFor) {
        headers.set('x-forwarded-for', forwardedFor);
    }

    headers.set('x-forwarded-proto', forwardedProto);

    if (forwardedHost) {
        headers.set('x-forwarded-host', forwardedHost);
    }

    return headers;
}

function setProxyResponseHeaders(proxyResponse: globalThis.Response, response: Response): void {
    const responseHeaders = proxyResponse.headers as Headers & {
        getSetCookie?: () => string[];
    };
    const setCookies = responseHeaders.getSetCookie?.();

    if (setCookies?.length > 0) {
        response.setHeader('set-cookie', setCookies);
    }

    proxyResponse.headers.forEach((value, name) => {
        if (name === 'set-cookie') {
            return;
        }

        response.setHeader(name, value);
    });
}

async function proxyApiRequest(request: Request, response: Response, next: NextFunction): Promise<void> {
    const abortController = new AbortController();
    const targetUrl = new URL(request.originalUrl, `${apiOrigin}/`);
    const requestHeaders = buildProxyHeaders(request);
    const hasRequestBody = shouldProxyRequestBody(request);
    const requestBody = hasRequestBody ? Readable.toWeb(request) as BodyInit : undefined;
    const fetchOptions: RequestInit & { duplex?: 'half' } = {
        method: request.method,
        headers: requestHeaders,
        body: requestBody,
        duplex: hasRequestBody ? 'half' : undefined,
        redirect: 'manual',
        signal: AbortSignal.any([abortController.signal, AbortSignal.timeout(proxyTimeoutMs)])
    };

    request.on('close', () => abortController.abort());

    try {
        const proxyResponse = await fetch(targetUrl, fetchOptions);

        response.status(proxyResponse.status);
        setProxyResponseHeaders(proxyResponse, response);

        if (!proxyResponse.body) {
            response.end();
            return;
        }

        const reader = proxyResponse.body.getReader();

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                break;
            }

            if (value) {
                response.write(value);
            }
        }

        response.end();
    } catch (error) {
        if (abortController.signal.aborted) {
            return;
        }

        if (error instanceof DOMException && error.name === 'TimeoutError') {
            if (!response.headersSent) {
                response.status(504).json({ error: 'backend timeout' });
            } else {
                response.end();
            }
            return;
        }

        next(error);
    }
}

app.get('/health', (_request, response) => {
    response.json({
        status: 'ok',
        mode: 'ssr'
    });
});

app.use('/api', (request, response, next) => {
    void proxyApiRequest(request, response, next);
});

app.use(
    express.static(browserDistFolder, {
        maxAge: '1y',
        index: false,
        redirect: false,
        setHeaders(response, filePath) {
            const fileName = filePath.split(/[\\/]/).pop() ?? '';

            if (immutableAssetPattern.test(fileName)) {
                response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return;
            }

            if (fileName === 'ngsw-worker.js' || fileName === 'ngsw.json') {
                response.setHeader('Cache-Control', 'no-store');
                return;
            }

            if (fileName === 'manifest.webmanifest') {
                response.setHeader('Cache-Control', 'public, max-age=86400');
            }
        }
    })
);

app.use((request, response, next) => {
    angularApp
        .handle(request)
        .then(renderedResponse => {
            if (renderedResponse) {
                return writeResponseToNodeResponse(renderedResponse, response);
            }

            next();
            return undefined;
        })
        .catch(next);
});

if (isMainModule(import.meta.url)) {
    app.listen(port, () => {
        console.log(`[frontend] Node SSR server listening on http://localhost:${port}`);
        console.log(
            `[frontend] API mode: ${externalApiOrigin ? `direct (${externalApiOrigin})` : `proxy (${internalApiOrigin})`}`
        );
    });
}

export const reqHandler = createNodeRequestHandler(app);
