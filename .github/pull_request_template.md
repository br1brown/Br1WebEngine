## Cosa cambia

<!-- Descrivi brevemente cosa fa questa PR -->

## Tipo di modifica

- [ ] Bug fix
- [ ] Nuova feature
- [ ] Refactor
- [ ] Aggiornamento dipendenze
- [ ] Documentazione

---

## Checklist accessibilità

> Spunta ogni punto applicabile. Per i componenti UI è obbligatorio completare questa sezione.
> Se non applicabile, scrivi `n/a` accanto al punto.

### Semantic HTML
- [ ] Usati elementi semantici corretti (`<button>` per azioni, `<a>` per link, heading in gerarchia)
- [ ] Tutti i `<label>` hanno `for` associato all'`id` del controllo
- [ ] Tutti i `<img>` hanno `alt` (descrittivo o `""` se decorativo)
- [ ] Icone decorative hanno `aria-hidden="true"`

### Tastiera e focus
- [ ] Tutti gli elementi interattivi sono raggiungibili e attivabili da tastiera
- [ ] Il focus visibile è garantito (nessun `outline: none` senza alternativa)
- [ ] Gli overlay/modal usano `appFocusTrap` e ripristinano il focus alla chiusura

### ARIA
- [ ] `aria-label` usato **solo** quando non c'è testo visibile
- [ ] Tutti i testi ARIA usano `| translate` (nessuna stringa hardcoded)
- [ ] Nessun componente del Design System duplicato senza motivazione documentata

### Lint e CI
- [ ] `npm run lint` passa con 0 errori in locale
- [ ] Il build production (`npx ng build --configuration production`) non introduce nuovi errori

---

## Note per il reviewer

<!-- Informazioni aggiuntive, screenshot, link a design, ecc. -->
