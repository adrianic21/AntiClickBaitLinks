## AntiClickBaitLinks Browser Extension

Extension ligera para Chrome, Edge o Brave.

### Instalacion local

1. Abre `chrome://extensions`, `edge://extensions` o `brave://extensions`.
2. Activa `Developer mode`.
3. Pulsa `Load unpacked`.
4. Selecciona la carpeta `browser-extension`.

### Funcion

- Detecta la URL de la pestana actual desde el popup.
- Abre `https://anticlickbaitlinks.com/?shared=...` para que la app genere el resumen automaticamente.
- Anade menu contextual con clic derecho para:
  - resumir un enlace concreto,
  - resumir la pagina actual.
  - resumir texto seleccionado si tiene suficiente contenido.

### Nota

Si cambias el dominio final de produccion, actualiza `APP_URL` en `shared.js`.
