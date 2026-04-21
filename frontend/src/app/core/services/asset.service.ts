import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { type AssetWidth } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class AssetService {
    private readonly virtualPath = '/cdn-cgi/asset';

    /**
     * Restituisce l'URL dell'immagine per l'ID specificato.
     */
    getUrl(id: string, width?: AssetWidth): Observable<string> {
        let url = `${this.virtualPath}?id=${id}`;
        if (width) url += `&w=${width}`;
        return of(url);
    }
}
