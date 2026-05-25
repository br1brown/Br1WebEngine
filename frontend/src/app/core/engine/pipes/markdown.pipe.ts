import { Pipe, PipeTransform } from '@angular/core';
import { Renderer, marked } from 'marked';

/** Renderer sicuro: blocca qualsiasi HTML grezzo nel Markdown (protezione XSS). */
const safeRenderer = new Renderer();
safeRenderer.html = () => '';

const MARKDOWN_OPTIONS = {
    breaks: true,
    gfm: true,
    renderer: safeRenderer
} as const;

/**
 * MarkdownPipe — Converte testo Markdown in HTML sicuro.
 *
 * USO NEI TEMPLATE:
 *   <div [innerHTML]="testoMarkdown | markdown"></div>
 *
 * PROTEZIONE XSS:
 *   L'HTML grezzo inserito nel Markdown viene completamente ignorato
 *   (renderer.html restituisce stringa vuota). Questo impedisce attacchi
 *   di tipo Cross-Site Scripting: anche se un utente scrive tag <script>
 *   nel testo, questi non verranno renderizzati.
 *
 * Supporta GitHub Flavored Markdown (tabelle, checklist, ecc.) e
 * conversione automatica degli "a capo" in <br>.
 *
 * Per usare la conversione anche da codice TypeScript (fuori dai template),
 * chiamare il metodo statico MarkdownPipe.render(value).
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
    transform(value: string): string {
        return MarkdownPipe.render(value);
    }

    /** Converte Markdown in HTML sicuro. Utilizzabile anche fuori dai template. */
    static render(value: string): string {
        if (!value) return '';
        return marked.parse(value, MARKDOWN_OPTIONS) as string;
    }
}
