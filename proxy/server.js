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

/* --- BOL.COM Retailer API (OAuth client-credentials) ---
   Нужни env: BOL_CLIENT_ID, BOL_CLIENT_SECRET (от продавачкия акаунт в bol.com).
   Снимка по EAN: GET /retailer/products/{ean}/assets?usage=PRIMARY
   Заглавие: GET /retailer/content/catalog-products/{ean} */
let _bolTok=null, _bolExp=0;
async function bolAuth(){
  const id=process.env.BOL_CLIENT_ID, sec=process.env.BOL_CLIENT_SECRET;
  if(!id||!sec) return null;
  if(_bolTok && Date.now()<_bolExp) return _bolTok;
  const r=await fetch('https://login.bol.com/token?grant_type=client_credentials',
    {method:'POST', headers:{Authorization:'Basic '+Buffer.from(id+':'+sec).toString('base64')}});
  if(!r.ok) return null;
  const d=await r.json();
  _bolTok=d.access_token; _bolExp=Date.now()+((d.expires_in||300)*1000)-30000;
  return _bolTok;
}
async function fromBol(ean){
  const tok=await bolAuth(); if(!tok) return null;
  const H={Authorization:'Bearer '+tok, Accept:'application/vnd.retailer.v10+json'};
  let image='', name='';
  try{
    const a=await fetch(`https://api.bol.com/retailer/products/${ean}/assets?usage=PRIMARY`,{headers:H});
    if(a.ok){ const j=await a.json(); const v=(((j.assets||[])[0]||{}).variants)||[];
      const pick=v.find(x=>x.size==='medium')||v.find(x=>x.size==='large')||v[v.length-1]||v[0];
      if(pick) image=pick.url; }
  }catch(e){}
  try{
    const c=await fetch(`https://api.bol.com/retailer/content/catalog-products/${ean}`,{headers:{...H,'Accept-Language':'nl'}});
    if(c.ok){ const j=await c.json();
      name = j.title || (Array.isArray(j.attributes) ? (((j.attributes.find(at=>/^title$/i.test(at.id))||{}).values||[])[0]||{}).value : '') || ''; }
  }catch(e){}
  if(!image && !name) return null;
  return { name, image, source:'bol' };
}

app.get('/lookup', async (req,res)=>{
  const ean = (req.query.ean||'').toString().replace(/\D/g,'');
  if(!ean) return res.status(400).json({error:'no ean'});
  if(cache.has(ean)) return res.json(cache.get(ean));
  let out = null;
  for(const fn of [fromBol, fromIcecat, fromUPC]){
    try{ const r = await fn(ean); if(r && (r.image||r.name)){ out = r; if(r.image) break; } }catch(e){ /* try next */ }
  }
  out = out || { name:'', image:'', source:'none' };
  cache.set(ean, out);
  res.json(out);
});

app.get('/', (req,res)=>res.send('O-CONNECT lookup proxy OK'));
app.listen(PORT, ()=>console.log('lookup proxy on :'+PORT));
