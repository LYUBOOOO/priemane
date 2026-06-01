/* O-CONNECT — EAN → {name, image} lookup proxy
   Деплой на Render/DigitalOcean. Сайтът (GitHub Pages) вика GET /lookup?ean=...
   Източници (по приоритет): Icecat (ако е зададен ICECAT_USER) → UPCitemdb.
   Bol.com може да се добави като източник с Retailer API ключове (виж BOL по-долу). */
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const ALLOW = process.env.ALLOW_ORIGIN || '*'; // напр. https://lyuboooo.github.io
const cache = new Map(); // ean -> {name,image,source}

app.use((req,res,next)=>{
  res.set('Access-Control-Allow-Origin', ALLOW);
  res.set('Access-Control-Allow-Headers','*');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});

async function fromIcecat(ean){
  const user = process.env.ICECAT_USER;
  const appkey = process.env.ICECAT_APP_KEY;
  if(!user || !appkey) return null;
  const url = `https://live.icecat.biz/api?UserName=${encodeURIComponent(user)}&Language=EN&GTIN=${encodeURIComponent(ean)}&Content=Image,General&app_key=${encodeURIComponent(appkey)}`;
  const r = await fetch(url);
  if(!r.ok) return null;
  const d = await r.json();
  const data = d && d.data ? d.data : {};
  const gen = data.GeneralInfo || {};
  const img = (data.Image && (data.Image.HighPic || data.Image.Pic500x500 || data.Image.LowPic))
           || (data.Gallery && data.Gallery[0] && data.Gallery[0].Pic) || '';
  const name = gen.Title || gen.ProductName || (gen.BrandInfo && gen.BrandInfo.BrandName) || '';
  if(!img && !name) return null;
  return { name, image: img, source:'icecat' };
}

async function fromUPC(ean){
  const key = process.env.UPCDB_KEY; // optional paid key (по-висок лимит)
  const base = key ? 'https://api.upcitemdb.com/prod/v1/lookup' : 'https://api.upcitemdb.com/prod/trial/lookup';
  const r = await fetch(`${base}?upc=${encodeURIComponent(ean)}`, key ? {headers:{'user_key':key,'key_type':'3scale'}} : {});
  if(!r.ok) return null;
  const d = await r.json();
  const it = (d.items||[])[0];
  if(!it) return null;
  return { name: it.title||'', image:(it.images||[])[0]||'', source:'upcitemdb' };
}

/* --- BOL.COM (по избор) ---
   Bol Retailer API: OAuth client-credentials → /retailer/products/{ean} или catalog.
   Сложи BOL_CLIENT_ID и BOL_CLIENT_SECRET в env и попълни fetch-овете тук.
async function fromBol(ean){
  const id=process.env.BOL_CLIENT_ID, sec=process.env.BOL_CLIENT_SECRET;
  if(!id||!sec) return null;
  const tok=await fetch('https://login.bol.com/token?grant_type=client_credentials',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(id+':'+sec).toString('base64')}}).then(r=>r.json());
  // ... извикай продуктовия endpoint с tok.access_token и върни {name,image}
  return null;
}
*/

app.get('/lookup', async (req,res)=>{
  const ean = (req.query.ean||'').toString().replace(/\D/g,'');
  if(!ean) return res.status(400).json({error:'no ean'});
  if(cache.has(ean)) return res.json(cache.get(ean));
  let out = null;
  for(const fn of [fromIcecat, fromUPC]){
    try{ const r = await fn(ean); if(r && (r.image||r.name)){ out = r; if(r.image) break; } }catch(e){ /* try next */ }
  }
  out = out || { name:'', image:'', source:'none' };
  cache.set(ean, out);
  res.json(out);
});

app.get('/', (req,res)=>res.send('O-CONNECT lookup proxy OK'));
app.listen(PORT, ()=>console.log('lookup proxy on :'+PORT));
