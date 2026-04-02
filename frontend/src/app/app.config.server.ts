import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerRouting, RenderMode, type ServerRoute } from '@angular/ssr';
import { appConfig } from './app.config';
import { ContestoSito } from './site';
import type { SiteRenderMode } from './siteBuilder';

const toAngularServerPath = (path: string): string =>
    path === '/' ? '' : path.replace(/^\/+/, '');

function toServerRoute(path: string, renderMode: SiteRenderMode): ServerRoute {
    const normalizedPath = toAngularServerPath(path);

    switch (renderMode) {
        case 'prerender':
            return {
                path: normalizedPath,
                renderMode: RenderMode.Prerender
            };
        case 'server':
            return {
                path: normalizedPath,
                renderMode: RenderMode.Server
            };
        default:
            return {
                path: normalizedPath,
                renderMode: RenderMode.Client
            };
    }
}

const serverRoutes: ServerRoute[] = [
    ...ContestoSito.serverRenderEntries.map(({ path, renderMode }) =>
        toServerRoute(path, renderMode)
    ),
    {
        path: '**',
        renderMode: RenderMode.Client
    }
];

const serverConfig: ApplicationConfig = {
    providers: [
        provideServerRendering(),
        provideServerRouting(serverRoutes)
    ]
};

export const config: ApplicationConfig =
    mergeApplicationConfig(appConfig, serverConfig);
