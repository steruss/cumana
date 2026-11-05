# Cumana Ste

Prossima Cumana da La Trencia a Montesanto e coincidenza con la Linea 2 per Garibaldi, andata e ritorno.

- Pagina: https://steruss.github.io/cumana/
- Gli orari stanno tutti in `data.js`.
- Dopo ogni modifica, aumenta la versione (es. 2.0 → 2.1) sia in `app.js` (`VERSIONE`) sia in `sw.js` (`CACHE`): il telefono scarica i file nuovi e la versione si vede in fondo alla pagina.

## Test
- `npm install` una volta, poi `npm test`: 11 controlli con casi veri (andata, uscita, domani, festivi, soppresse, "al volo", in corso, versione, dati).
- Girano anche su GitHub a ogni modifica: se qualcosa si rompe compare una ❌ nella scheda Actions e arriva una mail.
