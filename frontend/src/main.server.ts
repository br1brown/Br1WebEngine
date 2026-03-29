import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideClientHydration } from '@angular/platform-browser';

const serverConfig: ApplicationConfig = {
    providers: [
        provideServerRendering(),
        provideClientHydration()
    ]
};

const bootstrap = () => bootstrapApplication(AppComponent, mergeApplicationConfig(appConfig, serverConfig));

export default bootstrap;
