# EAN lookup proxy (снимка + име)

Малък сървър, който приема `GET /lookup?ean=...` и връща `{ "name": "...", "image": "https://..." }`.
Нужен е, защото bol.com/UPCitemdb не позволяват директна заявка от браузъра (CORS).

## Деплой на Render (най-лесно)
1. Качи папката `proxy/` в отделно репо (или цялото `priemane` репо).
2. Render → New → Web Service → свържи репото → Root Directory: `proxy` →
   Build: `npm install` · Start: `npm start` · Instance: Free.
3. Env vars (по избор):
   - `ALLOW_ORIGIN` = `https://lyuboooo.github.io`  (по-сигурно от *)
   - `ICECAT_USER`  = твоят Icecat потребител (за снимки по GTIN)
   - `UPCDB_KEY`    = платен UPCitemdb ключ (по-висок лимит)
4. Render дава адрес напр. `https://oconnect-lookup.onrender.com`.
5. В приложението: бутон „⚙ Адрес за снимки“ → сложи `https://oconnect-lookup.onrender.com/lookup`.

## Деплой на DigitalOcean droplet
`npm install && PORT=3000 ALLOW_ORIGIN=https://lyuboooo.github.io ICECAT_USER=... node server.js`
(зад nginx/pm2). После сложи `https://твоят-домейн/lookup` в приложението.

## Източници
- Icecat (ако зададеш `ICECAT_USER`) — добри снимки по GTIN.
- UPCitemdb (по подразбиране, trial 100/ден; с `UPCDB_KEY` повече).
- Bol.com — има подготвена кука `fromBol()` в `server.js`; попълни Retailer API ключове.
