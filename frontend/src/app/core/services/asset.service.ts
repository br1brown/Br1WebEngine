import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';

/**
 * Formato di una voce in mapping.json:
 * - stringa semplice: il nome del file (es. "favicon.png")
 * - oggetto con metadati (es. { file: "hero.jpg" })
 */
type MappingEntry = string | { file: string };

/**
 * Registry centralizzato delle immagini del sito.
 *
 * Ogni immagine ha un ID logico (es. "hero", "logo") associato a un file fisico
 * tramite assets/file/mapping.json. Nei componenti si usa NgOptimizedImage
 * con l'URL restituito da questo servizio.
 *
 * --- Come aggiungere una nuova immagine ---
 * 1. Metti il file nella cartella assets/file/
 * 2. Aggiungi una voce in assets/file/mapping.json con ID e nome file
 * 3. Nel componente: assetService.getUrl('tuoId')
 */
@Injectable({ providedIn: 'root' })
export class AssetService {
    private readonly http = inject(HttpClient);
    private readonly mappingUrl = 'assets/mapping.json';
    private readonly basePath = 'assets/file/';

    /** Cache dell'Observable del mapping — viene caricato una sola volta (shareReplay) */
    private mapping$: Observable<Record<string, MappingEntry>> | null = null;

    /**
     * Restituisce l'URL dell'immagine associata all'ID specificato.
     * @param id Chiave nel mapping.json (es. 'hero', 'logo', 'favIcon')
     */
    getUrl(id: string): Observable<string> {
        return this.getMapping().pipe(
            map(mapping => {
                const entry = mapping[id];
                if (!entry) return '';
                const file = typeof entry === 'string' ? entry : entry.file;
                if (file.startsWith('http://') || file.startsWith('https://')) return file;
                return this.basePath + file;
            })
        );
    }

    /**
     * Carica e restituisce il contenuto di mapping.json.
     * Il risultato è condiviso tra tutte le chiamate (shareReplay):
     * la richiesta HTTP avviene una sola volta, poi viene riusata.
     */
    getMapping(): Observable<Record<string, MappingEntry>> {
        if (!this.mapping$) {
            this.mapping$ = this.http
                .get<Record<string, MappingEntry>>(this.mappingUrl)
                .pipe(
                    catchError(() => of({} as Record<string, MappingEntry>)),
                    shareReplay(1)
                );
        }
        return this.mapping$;
    }
}
