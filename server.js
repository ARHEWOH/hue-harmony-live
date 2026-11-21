'use strict';
// A tiny Node HTTP server. PostgreSQL is the sole persistent state.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || '';
const secret = process.env.SESSION_SECRET || '';
const dbUrl = process.env.DATABASE_URL || '';
const allowedTones = new Set(['welcome','game','notice','award','break']);
const limits = {segment: 40, title: 90, description: 240, note: 150, badge: 28};
const staticFiles = new Map([
  ['/', ['index.html','text/html; charset=utf-8']],
  ['/index.html', ['index.html','text/html; charset=utf-8']],
  ['/admin', ['admin.html','text/html; charset=utf-8']],
  ['/admin.html', ['admin.html','text/html; charset=utf-8']],
  ['/styles.css', ['styles.css','text/css; charset=utf-8']],
  ['/config.js', ['config.js','application/javascript; charset=utf-8']],
  ['/app.js', ['app.js','application/javascript; charset=utf-8']],
  ['/admin.js', ['admin.js','application/javascript; charset=utf-8']]
]);
const defaults = {
  segment:'WELCOME TO', title:'HUE & HARMONY',
  description:'A celebration of every shade that makes us who we are.',
  note:'Stay close. The next activity is coming up!',
  badge:'THE CELEBRATION', tone:'welcome'
};
const attempts = new Map();
const pool = new Pool({connectionString:dbUrl, max:2, idleTimeoutMillis:15000, connectionTimeoutMillis:10000});

function json(res, status, body, extra={}) {
  res.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer',
    'X-Frame-Options':'DENY',
    ...extra
  });
  res.end(JSON.stringify(body));
}
function cookie(req, name) {
  const str = String(req.headers.cookie || '');
  const part = str.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return part ? part.slice(name.length+1) : '';
}
function sign(payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function token() {
  const payload = Buffer.from(JSON.stringify({exp:Date.now()+12*60*60*1000, v:1, nonce:crypto.randomBytes(8).toString('hex')})).toString('base64url');
  return payload+'.'+sign(payload);
}
function authorized(req) {
  const t = cookie(req,'hue_session');
  const idx = t.lastIndexOf('.');
  if (idx<=0) return false;
  const a = Buffer.from(t.slice(idx+1));
  const b = Buffer.from(sign(t.slice(0,idx)));
  if (a.length!==b.length || !crypto.timingSafeEqual(a,b)) return false;
  try {
    const obj = JSON.parse(Buffer.from(t.slice(0,idx),'base64url').toString());
    return obj.v===1 && Number.isFinite(obj.exp) && obj.exp>Date.now();
  } catch (_) { return false; }
}
function setCookie(req, value, age) {
  const secure = process.env.RENDER === 'true' || req.headers['x-forwarded-proto']==='https';
  return `hue_session=${value}; HttpOnly; ${secure?'Secure; ':''}SameSite=Strict; Path=/; Max-Age=${age}`;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  try { const u = new URL(origin); return u.host === host && (u.protocol === 'https:' || (u.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(u.host))); }
  catch (_) { return false; }
}
async function readJson(req) {
  if (!String(req.headers['content-type']||'').startsWith('application/json')) throw Object.assign(new Error('JSON required'),{status:415});
  let bytes = 0, body = '';
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 4096) throw Object.assign(new Error('Request too large'), {status:413});
    body += chunk.toString('utf8');
  }
  try { return JSON.parse(body); } catch (_) {throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
function validate(x) {
  if (!x || typeof x!=='object' || Array.isArray(x)) throw Object.assign(new Error('Invalid activity'),{status:400});
  const scene = {};
  for (const [k,max] of Object.entries(limits)) {
    if (typeof x[k]!=='string' || x[k].length>max) throw Object.assign(new Error('Invalid '+k),{status:400});
    scene[k] = x[k].trim();
  }
  if (!scene.segment || !scene.title || !scene.description || !scene.badge) throw Object.assign(new Error('Fill the required fields'),{status:400});
  if (!allowedTones.has(x.tone)) throw Object.assign(new Error('Invalid scene type'),{status:400});
  scene.tone = x.tone;
  return scene;
}
function throttle(req) {
  // Basic safety net against brute-force login; no third-party dependency.
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now=Date.now(); const old=attempts.get(ip) || [];
  const recent=old.filter(t=>now-t<15*60*1000);
  if (recent.length>=8) return true;
  recent.push(now); attempts.set(ip,recent);
  if (attempts.size>2000) attempts.clear();
  return false;
}
async function handle(req,res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method==='GET' && pathname==='/health') return json(res,200,{status:'ok'});
  if (req.method==='GET' && pathname==='/api/live') {
    try {
      const result=await pool.query('SELECT segment,title,description,note,badge,tone,updated_at FROM event_live WHERE id=1');
      return json(res,200,result.rows[0]||defaults,{'Access-Control-Allow-Origin':'*'});
    } catch (_) { return json(res,503,{error:'Live feed temporarily unavailable'},{'Access-Control-Allow-Origin':'*'}); }
  }
  if (req.method==='GET' && pathname==='/api/me') return json(res,200,{authenticated:authorized(req)});
  if (req.method==='POST' && ['/api/login','/api/logout','/api/live'].includes(pathname)) {
    if (!sameOrigin(req)) return json(res,403,{error:'Please use the organizer panel on the Render website.'});
    if (pathname==='/api/logout') return json(res,200,{ok:true},{'Set-Cookie':setCookie(req,'',0)});
    if (pathname==='/api/login') {
      if (throttle(req)) return json(res,429,{error:'Too many attempts. Try again later.'});
      const body=await readJson(req);
      const a=crypto.createHash('sha256').update(String(body.email||'').trim().toLowerCase()+'\0'+String(body.password||'')).digest();
      const b=crypto.createHash('sha256').update(adminEmail+'\0'+adminPassword).digest();
      if (!crypto.timingSafeEqual(a,b)) return json(res,401,{error:'Incorrect email or password'});
      return json(res,200,{ok:true},{'Set-Cookie':setCookie(req,token(),12*60*60)});
    }
    if (!authorized(req)) return json(res,401,{error:'Sign in as the organizer first'});
    const scene=validate(await readJson(req));
    try {
      const args=['segment','title','description','note','badge','tone'].map(k=>scene[k]);
      const result=await pool.query(`UPDATE event_live SET segment=$1,title=$2,description=$3,note=$4,badge=$5,tone=$6,updated_at=now() WHERE id=1 RETURNING segment,title,description,note,badge,tone,updated_at`,args);
      return json(res,200,result.rows[0]);
    } catch (_) {return json(res,503,{error:'Database unavailable; nothing was published'});}
  }
  if (req.method==='GET' && staticFiles.has(pathname)) {
    const [file,type]=staticFiles.get(pathname);
    const headers={
      'Content-Type':type,
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',
      'X-Frame-Options':'DENY',
      'Cache-Control':file.endsWith('.css')?'public, max-age=3600':'no-cache',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' https:; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    };
    res.writeHead(200,headers);
    return fs.createReadStream(path.join(root,file)).pipe(res);
  }
  json(res,404,{error:'Not found'});
}
async function initialize() {
  if (!dbUrl || !adminEmail || adminPassword.length<12 || secret.length<32) throw new Error('Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD (12+ characters), and SESSION_SECRET (32+ characters) in Render Environment.');
  await pool.query(`CREATE TABLE IF NOT EXISTS event_live (
    id integer PRIMARY KEY CHECK (id=1),
    segment varchar(40) NOT NULL,
    title varchar(90) NOT NULL,
    description varchar(240) NOT NULL,
    note varchar(150) NOT NULL,
    badge varchar(28) NOT NULL,
    tone varchar(8) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`INSERT INTO event_live(id,segment,title,description,note,badge,tone)
    VALUES (1,$1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,Object.values(defaults));
}
if (require.main===module) {
  initialize().then(()=>http.createServer((req,res)=>{
    handle(req,res).catch(err=>json(res,err.status||500,{error:err.status?err.message:'Unexpected server error'}));
  }).listen(port,'0.0.0.0',()=>console.log('Hue & Harmony LIVE ready on port '+port)))
  .catch(err=>{console.error('Startup failed:',err.message);process.exit(1);});
}
module.exports={handle,initialize,validate,authorized,sameOrigin,defaults};
