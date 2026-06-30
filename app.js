(function(){
"use strict";

/* =================================================================
   STORAGE KEYS
================================================================= */
const K = {
  pwhash: 'tps_pwhash',
  salt: 'tps_salt',
  fails: 'tps_fails',
  lockuntil: 'tps_lockuntil',
  apikey: 'tps_apikey',
  snapshots: 'tps_snapshots',
  travel: 'tps_travel',
  settings: 'tps_settings',
  travelSettings: 'tps_travelsettings',
  session: 'tps_session' // sessionStorage
};
const GOAL = 4000000;

/* ---- Travel optimizer reference data ---- */
const TRAVEL_TIMES = {mex:26,cay:35,can:41,haw:134,uni:159,arg:167,swi:176,jap:225,chi:242,uae:271,sou:297};
const COUNTRY_META = {
  mex:{name:'México',flag:'🇲🇽'}, cay:{name:'Ilhas Caimão',flag:'🇰🇾'}, can:{name:'Canadá',flag:'🇨🇦'},
  haw:{name:'Hawaii',flag:'🌺'}, uni:{name:'Reino Unido',flag:'🇬🇧'}, arg:{name:'Argentina',flag:'🇦🇷'},
  swi:{name:'Suíça',flag:'🇨🇭'}, jap:{name:'Japão',flag:'🇯🇵'}, chi:{name:'China',flag:'🇨🇳'},
  uae:{name:'EAU',flag:'🇦🇪'}, sou:{name:'África do Sul',flag:'🇿🇦'}
};
const METHOD_FACTORS = {standard:1, airstrip:0.7, business:0.3, both:0.21};
const FLOWER_NAMES = ['Dahlia','Cherry Blossom','Ceibo Flower','Crocus','Orchid','Edelweiss','Peony','African Violet','Banana Orchid','Heather','Tribulus Omanense'];
function isFlowerItem(name){ return FLOWER_NAMES.some(f=>f.toLowerCase()===String(name).toLowerCase()); }
function isPlushieItem(name){ return /plushie/i.test(name); }
function itemEmoji(name){
  if(/plushie/i.test(name)) return '🧸';
  if(isFlowerItem(name)) return '🌸';
  return '📦';
}

function lsGet(k, fallback){
  try{ const v = localStorage.getItem(k); return v===null ? fallback : JSON.parse(v); }
  catch(e){ return fallback; }
}
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }

function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtN(n){ return Math.round(n).toLocaleString('pt-PT'); }
function fmtDate(s){
  const d = new Date(s+'T00:00:00');
  return d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short'});
}
function daysBetween(a,b){
  return Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000);
}
async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* =================================================================
   STATE
================================================================= */
let state = {
  apikey: lsGet(K.apikey, ''),
  snapshots: lsGet(K.snapshots, []),
  travel: lsGet(K.travel, []),
  settings: lsGet(K.settings, { edvdsAnchor:null, stackLead:1 }),
  travelSettings: lsGet(K.travelSettings, {
    method:'airstrip', totalCap:5, extraFlowerCap:0, extraPlushieCap:0,
    cashLimit:0, windowEnd:'23:00', marketTaxPct:5
  }),
  travelSubTab: 'optimizer',
  yata: { stocks:null, timestamp:null, loading:false, error:null },
  tornItems: {},
  player: null,
  loading:false,
  lastError:null
};

/* =================================================================
   AUTH
================================================================= */
const authCard = document.getElementById('authCard');

function renderAuth(){
  const hasPw = !!lsGet(K.pwhash,null);
  const lockUntil = lsGet(K.lockuntil, 0);
  const now = Date.now();

  if(lockUntil > now){
    const secs = Math.ceil((lockUntil-now)/1000);
    authCard.innerHTML = `
      <div class="logo-ring">4M</div>
      <h1>Acesso Bloqueado</h1>
      <p class="sub">Demasiadas tentativas falhadas.</p>
      <div class="lock-box">Tenta novamente em <b id="lockTimer">${secs}</b>s</div>
    `;
    const iv = setInterval(()=>{
      const left = Math.ceil((lsGet(K.lockuntil,0)-Date.now())/1000);
      if(left<=0){ clearInterval(iv); renderAuth(); }
      else { const el=document.getElementById('lockTimer'); if(el) el.textContent=left; }
    },1000);
    return;
  }

  if(!hasPw){
    authCard.innerHTML = `
      <div class="logo-ring">4M</div>
      <h1>Configurar Acesso</h1>
      <p class="sub">Define uma password local para proteger esta app. Uso pessoal exclusivo.</p>
      <div class="field"><label>Nova Password</label><input type="password" id="pwSet1" placeholder="••••••••" autocomplete="new-password"></div>
      <div class="field"><label>Confirmar Password</label><input type="password" id="pwSet2" placeholder="••••••••" autocomplete="new-password"></div>
      <div class="auth-err" id="authErr"></div>
      <button class="btn btn-primary" id="setPwBtn">Criar Password e Entrar</button>
    `;
    document.getElementById('setPwBtn').onclick = async ()=>{
      const p1 = document.getElementById('pwSet1').value;
      const p2 = document.getElementById('pwSet2').value;
      const err = document.getElementById('authErr');
      if(p1.length < 4){ err.textContent='Password deve ter pelo menos 4 caracteres.'; return; }
      if(p1 !== p2){ err.textContent='As passwords não coincidem.'; return; }
      const salt = crypto.getRandomValues(new Uint8Array(8)).join('');
      const hash = await sha256(salt+p1);
      lsSet(K.salt, salt); lsSet(K.pwhash, hash); lsSet(K.fails,0); lsSet(K.lockuntil,0);
      sessionStorage.setItem(K.session,'1');
      bootApp();
    };
    return;
  }

  authCard.innerHTML = `
    <div class="logo-ring">4M</div>
    <h1>Torn Pro Stats</h1>
    <p class="sub">Insere a password para aceder à tua conta.</p>
    <div class="field"><label>Password</label><input type="password" id="pwLogin" placeholder="••••••••" autocomplete="current-password"></div>
    <div class="auth-err" id="authErr"></div>
    <button class="btn btn-primary" id="loginBtn">Entrar</button>
    <div class="auth-foot"><a id="resetLink">Esqueci-me da password (reset total)</a></div>
  `;
  const pwInput = document.getElementById('pwLogin');
  const doLogin = async ()=>{
    const p = pwInput.value;
    const salt = lsGet(K.salt,'');
    const hash = await sha256(salt+p);
    const stored = lsGet(K.pwhash,null);
    if(hash === stored){
      lsSet(K.fails,0); lsSet(K.lockuntil,0);
      sessionStorage.setItem(K.session,'1');
      bootApp();
    } else {
      const fails = lsGet(K.fails,0)+1;
      lsSet(K.fails, fails);
      const err = document.getElementById('authErr');
      if(fails >= 5){
        lsSet(K.lockuntil, Date.now()+5*60*1000);
        renderAuth();
      } else {
        err.textContent = `Password incorreta. Tentativa ${fails}/5.`;
      }
    }
  };
  document.getElementById('loginBtn').onclick = doLogin;
  pwInput.addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
  document.getElementById('resetLink').onclick = ()=>{
    authCard.innerHTML = `
      <div class="logo-ring">⚠</div>
      <h1>Reset Total</h1>
      <p class="sub">Isto apaga a password, API key e todo o histórico guardado neste iPhone. Não pode ser desfeito.</p>
      <button class="btn btn-danger" id="confirmReset">Confirmar Reset</button>
      <div class="auth-foot"><a id="cancelReset">Cancelar</a></div>
    `;
    document.getElementById('confirmReset').onclick = ()=>{
      Object.values(K).forEach(k=>{ if(k!==K.session) lsDel(k); });
      renderAuth();
    };
    document.getElementById('cancelReset').onclick = renderAuth;
  };
}

document.getElementById('lockBtn').onclick = ()=>{
  sessionStorage.removeItem(K.session);
  document.getElementById('app').classList.remove('active');
  document.getElementById('authScreen').style.display='flex';
  renderAuth();
};

/* =================================================================
   TORN API
================================================================= */
async function fetchTorn(apikey){
  const url = `https://api.torn.com/user/?selections=battlestats,bars,profile,travel&key=${encodeURIComponent(apikey)}`;
  const res = await fetch(url);
  const data = await res.json();
  if(data.error){
    const map = {1:'Key não foi inserida.',2:'API Key inválida.',5:'Demasiados pedidos — espera um pouco.',
      6:'Selection inválida.',7:'Sem acesso a essa informação (verifica permissões da key).',8:'IP bloqueado temporariamente.',
      10:'Key com acesso insuficiente. Usa uma key Limited/Full com acesso a stats.',13:'A key foi pausada/eliminada pelo dono.'};
    throw new Error(map[data.error.code] || (data.error.error || 'Erro desconhecido da API Torn.'));
  }
  return data;
}

async function fetchYataStocks(){
  state.yata.loading = true; render();
  try{
    const res = await fetch('https://yata.yt/api/v1/travel/export/');
    if(!res.ok) throw new Error('offline');
    const data = await res.json();
    state.yata.stocks = data.stocks || {};
    state.yata.timestamp = data.timestamp || Date.now()/1000;
    state.yata.error = null;
  }catch(e){
    state.yata.error = 'Não foi possível obter stocks ao vivo (serviço comunitário YATA). Tenta novamente em instantes.';
  }
  state.yata.loading = false; render();
}

async function fetchTornItemPrices(){
  if(!state.apikey) return;
  try{
    const res = await fetch(`https://api.torn.com/torn/?selections=items&key=${encodeURIComponent(state.apikey)}`);
    const data = await res.json();
    if(data.error) throw new Error(data.error.error);
    state.tornItems = data.items || {};
  }catch(e){ /* keep previous cache silently */ }
}

async function loadTravelOptimizerData(){
  await Promise.all([fetchYataStocks(), fetchTornItemPrices()]);
  render();
}

async function refreshData(showToast){
  if(!state.apikey){ render(); return; }
  state.loading = true; render();
  try{
    const d = await fetchTorn(state.apikey);
    const total = (d.strength||0)+(d.defense||0)+(d.speed||0)+(d.dexterity||0);
    state.player = {
      name: d.name, level: d.level,
      strength: d.strength, defense: d.defense, speed: d.speed, dexterity: d.dexterity,
      total: total,
      energy_cur: d.energy ? d.energy.current : null,
      energy_max: d.energy ? d.energy.maximum : null,
      energy_fulltime: d.energy ? d.energy.fulltime : null,
      energy_increment: d.energy ? d.energy.increment : null,
      energy_interval: d.energy ? d.energy.interval : null,
      nerve_cur: d.nerve ? d.nerve.current : null,
      nerve_max: d.nerve ? d.nerve.maximum : null,
      nerve_fulltime: d.nerve ? d.nerve.fulltime : null,
      nerve_increment: d.nerve ? d.nerve.increment : null,
      nerve_interval: d.nerve ? d.nerve.interval : null,
      happy_cur: d.happy ? d.happy.current : null,
      life_cur: d.life ? d.life.current : null,
      life_max: d.life ? d.life.maximum : null,
      status: d.status ? d.status.description : 'Desconhecido',
      travel: d.travel ? {
        destination: d.travel.destination, timestamp: d.travel.timestamp,
        timeLeft: d.travel.time_left, method: d.travel.method
      } : null
    };
    maybeSaveSnapshot(total);
    document.getElementById('connDot').classList.remove('off');
    state.lastError = null;
    if(showToast) toast('Dados atualizados ✓');
  }catch(e){
    state.lastError = e.message;
    document.getElementById('connDot').classList.add('off');
    if(showToast) toast('Erro: '+e.message);
  }
  state.loading = false;
  render();
}

function maybeSaveSnapshot(total){
  const t = todayStr();
  const last = state.snapshots[state.snapshots.length-1];
  if(last && last.date === t){
    last.total = total;
    last.strength = state.player.strength; last.defense = state.player.defense;
    last.speed = state.player.speed; last.dexterity = state.player.dexterity;
  } else {
    state.snapshots.push({date:t, total, strength:state.player.strength, defense:state.player.defense,
      speed:state.player.speed, dexterity:state.player.dexterity});
  }
  lsSet(K.snapshots, state.snapshots);
}

/* =================================================================
   ANALYTICS — growth, cycles, efficiency
================================================================= */
function getDeltas(){
  const s = state.snapshots;
  const out = [];
  for(let i=1;i<s.length;i++){
    const days = Math.max(1, daysBetween(s[i-1].date, s[i].date));
    out.push({ date:s[i].date, delta:s[i].total-s[i-1].total, perDay:(s[i].total-s[i-1].total)/days });
  }
  return out;
}

function avgDailyRate(){
  const s = state.snapshots;
  if(s.length < 2) return 0;
  const window = s.slice(-15);
  const d = daysBetween(window[0].date, window[window.length-1].date);
  if(d<=0) return 0;
  return (window[window.length-1].total - window[0].total)/d;
}

function detectCycles(){
  const deltas = getDeltas();
  if(deltas.length === 0) return {phases:[], current:'na', avgBurst:0, avgNormal:0, consistency:0};
  const vals = deltas.map(x=>x.delta);
  const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
  const variance = vals.reduce((a,b)=>a+Math.pow(b-mean,2),0)/vals.length;
  const std = Math.sqrt(variance);

  const phases = deltas.map(d=>{
    let phase;
    if(std < 1e-6){ phase = d.delta>0 ? 'normal':'cooldown'; }
    else if(d.delta >= mean + std*0.8 && d.delta>0) phase='burst';
    else if(d.delta <= mean - std*0.6) phase='cooldown';
    else phase='normal';
    return {date:d.date, delta:d.delta, phase};
  });
  const current = phases.length ? phases[phases.length-1].phase : 'na';
  const bursts = phases.filter(p=>p.phase==='burst').map(p=>p.delta);
  const normals = phases.filter(p=>p.phase==='normal').map(p=>p.delta);
  const avgBurst = bursts.length ? bursts.reduce((a,b)=>a+b,0)/bursts.length : 0;
  const avgNormal = normals.length ? normals.reduce((a,b)=>a+b,0)/normals.length : 0;
  const consistency = mean>0 ? Math.max(0, Math.min(100, 100*(1-(std/Math.max(mean,1))))) : 0;

  return {phases, current, avgBurst, avgNormal, consistency, mean, std};
}

function computeMetrics(){
  const total = state.player ? state.player.total : (state.snapshots.length ? state.snapshots[state.snapshots.length-1].total : 0);
  const missing = Math.max(0, GOAL-total);
  const pct = Math.min(100, (total/GOAL)*100);
  const rate = avgDailyRate();
  const etaDays = rate>0 ? Math.ceil(missing/rate) : null;
  let etaDate = null;
  if(etaDays){ const d=new Date(); d.setDate(d.getDate()+etaDays); etaDate = d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short',year:'numeric'}); }
  const cyc = detectCycles();
  return {total, missing, pct, rate, etaDays, etaDate, cyc};
}

/* =================================================================
   EDVDS / XANAX CYCLE (4-day job cycle)
   Day 0 (80 pts day)  -> Happy Jump Grande: 4x Xanax + 4x EDVDS + 1x Ecstasy
   Days 1-3 (off days) -> Mini Jump: Candy + 1-2x Xanax + treino com energia natural (150)
================================================================= */
const BIG_JUMP_RECIPE = '4x Xanax + 4x EDVDS + 1x Ecstasy';
const MINI_JUMP_RECIPE = 'Candy + 1-2x Xanax + treino com energia natural (150)';

function edvdsStatus(){
  const anchor = state.settings.edvdsAnchor;
  if(!anchor) return null;
  const today = todayStr();
  let diff = daysBetween(anchor, today);
  if(diff < 0) diff = 0;
  const cyclePos = diff % 4;
  const daysUntilNext = (4 - cyclePos) % 4;
  const nextDate = new Date(); nextDate.setDate(nextDate.getDate()+daysUntilNext);
  const isTodayThe80 = daysUntilNext===0;
  return {
    daysUntilNext,
    nextDateStr: nextDate.toLocaleDateString('pt-PT',{day:'2-digit',month:'short'}),
    isTodayThe80,
    todayType: isTodayThe80 ? 'big' : 'mini',
    todayRecipe: isTodayThe80 ? BIG_JUMP_RECIPE : MINI_JUMP_RECIPE
  };
}

/* =================================================================
   TRAVEL / PLUSHIES & FLOWERS
================================================================= */
function travelSummary(){
  const t = state.travel;
  if(t.length===0) return {totalProfit:0, totalItems:0, perTravelDay:0, perCalendarDay:0, days:0};
  let totalProfit=0, totalItems=0;
  const datesSet = new Set();
  t.forEach(e=>{ totalProfit += e.qty*(e.sell-e.cost); totalItems += e.qty; datesSet.add(e.date); });
  const dates = Array.from(datesSet).sort();
  const calDays = Math.max(1, daysBetween(dates[0], dates[dates.length-1])+1);
  return {
    totalProfit, totalItems,
    perTravelDay: totalProfit/dates.length,
    perCalendarDay: totalProfit/calDays,
    days: dates.length
  };
}

/* =================================================================
   TRAVEL OPTIMIZER ENGINE
================================================================= */
function buildTravelCandidates(){
  if(!state.yata.stocks) return [];
  const ts = state.travelSettings;
  const factor = METHOD_FACTORS[ts.method] || 0.7;
  const tax = (ts.marketTaxPct||0)/100;
  const candidates = [];

  Object.keys(state.yata.stocks).forEach(code=>{
    const meta = COUNTRY_META[code]; if(!meta) return;
    const countryData = state.yata.stocks[code];
    const rawItems = (countryData.stocks||[]).filter(it=>it.quantity>0);

    const pool = [];
    rawItems.forEach(it=>{
      const isF = isFlowerItem(it.name), isP = isPlushieItem(it.name);
      if(!isF && !isP) return;
      const priceInfo = state.tornItems[String(it.id)];
      const sell = priceInfo ? Number(priceInfo.market_value)||0 : 0;
      if(!sell) return;
      const profitPerUnit = sell*(1-tax) - it.cost;
      if(profitPerUnit<=0) return;
      pool.push({id:it.id, name:it.name, cost:it.cost, sell, profitPerUnit, quantity:it.quantity, type:isF?'flower':'plushie'});
    });
    if(pool.length===0) return;

    let remainingCash = ts.cashLimit>0 ? ts.cashLimit : Infinity;
    const chosen = []; let filledTotal=0, cashUsed=0;

    function take(list, cap, label){
      list.sort((a,b)=>b.profitPerUnit-a.profitPerUnit);
      let filled=0;
      for(const it of list){
        if(filled>=cap) break;
        let qty = Math.min(cap-filled, it.quantity);
        const affordable = Math.floor(remainingCash/it.cost);
        qty = Math.min(qty, isFinite(affordable)?affordable:qty);
        if(qty<=0) continue;
        chosen.push({...it, take:qty});
        filled += qty; filledTotal += qty;
        const spent = qty*it.cost; cashUsed += spent; remainingCash -= spent;
        it.quantity -= qty;
      }
    }
    if(ts.extraFlowerCap>0) take(pool.filter(p=>p.type==='flower'), ts.extraFlowerCap);
    if(ts.extraPlushieCap>0) take(pool.filter(p=>p.type==='plushie'), ts.extraPlushieCap);
    take(pool, ts.totalCap);

    if(chosen.length===0) return;
    const tripProfit = chosen.reduce((s,i)=>s+i.take*i.profitPerUnit,0);
    const oneWay = TRAVEL_TIMES[code]*factor;
    const roundTripMin = Math.round(oneWay*2 + 2);
    const profitPerHour = tripProfit/(roundTripMin/60);
    candidates.push({
      code, name: meta.name, flag: meta.flag, items: chosen,
      tripProfit, cashRequired: cashUsed, roundTripMin, profitPerHour,
      stockUpdate: countryData.update
    });
  });

  candidates.sort((a,b)=>b.profitPerHour-a.profitPerHour);
  return candidates;
}

function scheduleTravelPlan(){
  const candidates = buildTravelCandidates();
  if(candidates.length===0) return {schedule:[], totalProfit:0, totalCash:0, flights:0, profitPerHour:0, candidates};

  const ts = state.travelSettings;
  const now = new Date();
  let cursor = new Date(now);
  if(state.player && state.player.travel && state.player.travel.timeLeft>0){
    cursor = new Date(now.getTime() + state.player.travel.timeLeft*1000);
  }
  const [endH,endM] = (ts.windowEnd||'23:00').split(':').map(Number);
  let endTime = new Date(now); endTime.setHours(endH,endM,0,0);
  if(endTime <= cursor) endTime.setDate(endTime.getDate()+1);

  const schedule = [];
  const used = new Set();
  let totalProfit=0, totalCash=0, flights=0;

  while(true){
    const remMin = (endTime-cursor)/60000;
    if(remMin<=5) break;
    const pick = candidates.find(c=>!used.has(c.code) && c.roundTripMin<=remMin);
    if(!pick) break;
    const depart = new Date(cursor);
    const arrive = new Date(cursor.getTime()+(pick.roundTripMin/2)*60000);
    const back = new Date(cursor.getTime()+pick.roundTripMin*60000);
    schedule.push({...pick, depart, arrive, back});
    cursor = back;
    used.add(pick.code);
    totalProfit += pick.tripProfit; totalCash += pick.cashRequired; flights++;
  }
  const awaySeconds = flights ? (schedule[schedule.length-1].back - now)/1000 : 0;
  const profitPerHour = awaySeconds>0 ? totalProfit/(awaySeconds/3600) : 0;
  return {schedule, totalProfit, totalCash, flights, profitPerHour, awaySeconds, candidates};
}

function energyNerveWaste(awaySeconds){
  const p = state.player;
  if(!p || !awaySeconds) return [];
  const warnings = [];
  [['energy','Energia'],['nerve','Nervo']].forEach(([key,label])=>{
    const full = p[key+'_fulltime'];
    const inc = p[key+'_increment'];
    const interval = p[key+'_interval'];
    if(full===null || full===undefined || !inc || !interval) return;
    if(awaySeconds > full && full>0){
      const overflowSec = awaySeconds - full;
      const wastedPoints = Math.floor(overflowSec/interval) * inc;
      if(wastedPoints>0){
        warnings.push(`${label}: vais ficar cheio ~${Math.round(full/60)} min depois de partires e continuas fora mais ${Math.round(overflowSec/60)} min — desperdício estimado de <b>${wastedPoints} pontos</b>.`);
      }
    }
  });
  return warnings;
}


/* =================================================================
   RENDER — TAB ROUTER
================================================================= */
let activeTab = 'dashboard';
function setTab(tab){
  activeTab = tab;
  document.querySelectorAll('nav.bottom button').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===tab);
  });
  render();
}
document.querySelectorAll('nav.bottom button').forEach(b=>{
  b.addEventListener('click', ()=> setTab(b.dataset.tab));
});

function render(){
  const c = document.getElementById('content');
  if(!state.apikey){ c.innerHTML = renderApiKeySetup(); attachApiKeyHandlers(); return; }
  switch(activeTab){
    case 'dashboard': c.innerHTML = renderDashboard(); break;
    case 'progress': c.innerHTML = renderProgress(); break;
    case 'cycles': c.innerHTML = renderCycles(); break;
    case 'travel': c.innerHTML = renderTravel(); break;
    case 'history': c.innerHTML = renderHistory(); break;
    case 'planner': c.innerHTML = renderPlanner(); break;
  }
  attachTabHandlers();
}

/* ---------- API KEY SETUP VIEW ---------- */
function renderApiKeySetup(){
  return `
  <div class="card">
    <div class="card-h"><h3>Ligar à API do Torn</h3></div>
    <p style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-top:0;">
      Insere uma API Key de leitura (Limited ou Full, com acesso a stats). A key fica guardada neste iPhone para não a teres de inserir sempre.
    </p>
    <div class="field"><label>API Key</label><input type="text" id="apikeyInput" placeholder="ex: aBcD1234..." autocomplete="off" autocapitalize="off" autocorrect="off"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-dim);margin:4px 0 14px;">
      <input type="checkbox" id="rememberKey" checked style="width:16px;height:16px;"> Lembrar API Key neste dispositivo
    </label>
    <div class="auth-err" id="apiErr"></div>
    <button class="btn btn-primary" id="saveKeyBtn">Validar e Guardar</button>
  </div>`;
}
function attachApiKeyHandlers(){
  const btn = document.getElementById('saveKeyBtn');
  if(!btn) return;
  btn.onclick = async ()=>{
    const key = document.getElementById('apikeyInput').value.trim();
    const remember = document.getElementById('rememberKey').checked;
    const err = document.getElementById('apiErr');
    if(!key){ err.textContent='Insere uma key válida.'; return; }
    btn.textContent = 'A validar...'; btn.disabled = true;
    try{
      await fetchTorn(key);
      state.apikey = key;
      if(remember) lsSet(K.apikey, key);
      toast('API Key validada ✓');
      refreshData(false);
    }catch(e){
      err.textContent = e.message;
      btn.textContent = 'Validar e Guardar'; btn.disabled = false;
    }
  };
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const m = computeMetrics();
  const p = state.player;
  const edv = edvdsStatus();

  let insights = [];
  if(state.lastError){
    insights.push({ic:'⚠️', tx:`<b>Erro de ligação:</b> ${state.lastError}`});
  }
  if(m.rate>0){
    const window7 = state.snapshots.slice(-8);
    let recent = 0;
    if(window7.length>=2){
      const d = Math.max(1, daysBetween(window7[0].date, window7[window7.length-1].date));
      recent = (window7[window7.length-1].total-window7[0].total)/d;
    }
    if(recent > m.rate*1.15) insights.push({ic:'🚀', tx:`Estás <b>acima do teu ritmo médio</b> — últimos dias mais fortes que a média geral.`});
    else if(recent < m.rate*0.7 && recent>=0) insights.push({ic:'🐢', tx:`Estás <b>abaixo do ritmo habitual</b>. Considera retomar treino ou ciclo de Xanax.`});
    else insights.push({ic:'✅', tx:`Ritmo de crescimento <b>estável</b>, dentro do teu padrão normal.`});
  } else {
    insights.push({ic:'📉', tx:`Ainda não há ritmo calculável — precisa de pelo menos 2 snapshots em dias diferentes.`});
  }
  if(m.cyc.current==='cooldown') insights.push({ic:'🧊', tx:`Fase atual: <b>Cooldown</b>. Boa altura para descansar energia / nervos antes do próximo burst.`});
  if(m.cyc.current==='burst') insights.push({ic:'⚡', tx:`Fase atual: <b>Burst</b> — aproveita a energia disponível enquanto o crescimento está elevado.`});
  if(edv && edv.shouldStackNow) insights.push({ic:'💊', tx:`<b>Começa o stack de Xanax</b> — faltam ${edv.daysUntilNext} dia(s) para o teu dia dos 80 pts (EDVDS).`});
  if(p && p.energy_cur!==null && p.energy_max!==null && p.energy_cur >= p.energy_max*0.8){
    insights.push({ic:'🔋', tx:`Energia em <b>${p.energy_cur}/${p.energy_max}</b> — boa altura para gastar em treino.`});
  }

  return `
  ${!p ? `<div class="card"><div class="empty"><div class="ic">📡</div>A obter dados da Torn API...<br><button class="btn btn-primary btn-sm" style="width:auto;margin-top:14px;" id="dashRefresh">Atualizar agora</button></div></div>` : ''}

  ${p ? `
  <div class="card">
    <div class="card-h"><h3>${p.name} · Nível ${p.level}</h3><span class="tag ${m.cyc.current}">${cyclabel(m.cyc.current)}</span></div>
    <div class="big-total"><div class="n">${fmtN(m.total)}</div><div class="l">Total Stats</div></div>
    <div class="bar-track" style="margin:14px 0 6px;"><div class="bar-fill" style="width:${m.pct}%;"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-faint);">
      <span>${m.pct.toFixed(2)}% até 4M</span><span>Faltam ${fmtN(m.missing)}</span>
    </div>
  </div>

  <div class="grid2">
    <div class="stat-box"><div class="lbl">Crescimento / dia</div><div class="val sm">${m.rate>0?'+'+fmtN(m.rate):'—'}</div></div>
    <div class="stat-box"><div class="lbl">ETA aos 4M</div><div class="val sm">${m.etaDate || '—'}</div></div>
    <div class="stat-box"><div class="lbl">Energia</div><div class="val sm">${p.energy_cur ?? '—'}/${p.energy_max ?? '—'}</div></div>
    <div class="stat-box"><div class="lbl">Eficiência</div><div class="val sm">${m.cyc.consistency.toFixed(0)}%</div></div>
  </div>

  <div class="card" style="margin-top:14px;">
    <div class="card-h"><h3>Insights Automáticos</h3></div>
    ${insights.map(i=>`<div class="insight-row"><div class="insight-ic">${i.ic}</div><div class="insight-tx">${i.tx}</div></div>`).join('')}
  </div>

  <div class="card">
    <div class="card-h"><h3>Estado do Jogador</h3></div>
    <div class="grid3">
      <div class="stat-box"><div class="lbl">Vida</div><div class="val sm">${p.life_cur ?? '—'}/${p.life_max ?? '—'}</div></div>
      <div class="stat-box"><div class="lbl">Nervo</div><div class="val sm">${p.nerve_cur ?? '—'}</div></div>
      <div class="stat-box"><div class="lbl">Happy</div><div class="val sm">${p.happy_cur ?? '—'}</div></div>
    </div>
    <div class="hairline"></div>
    <div style="font-size:12px;color:var(--text-dim);">Estado: <b style="color:var(--text)">${p.status}</b></div>
  </div>
  ` : ''}
  `;
}
function cyclabel(c){ return {normal:'Normal',burst:'Burst',cooldown:'Cooldown',na:'Sem dados'}[c]||c; }

/* ---------- PROGRESS ---------- */
function renderProgress(){
  const m = computeMetrics();
  const p = state.player;
  const stats = p ? [
    {l:'Strength', v:p.strength, c:'#FF6B6B'},
    {l:'Defense', v:p.defense, c:'#36E2FF'},
    {l:'Speed', v:p.speed, c:'#C6FF3D'},
    {l:'Dexterity', v:p.dexterity, c:'#FFB020'}
  ] : [];
  const circumference = 2*Math.PI*70;
  const dash = circumference * (1 - m.pct/100);

  return `
  <div class="card">
    <div class="card-h"><h3>Progresso até 4,000,000</h3></div>
    <div class="gauge-wrap">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r="70" fill="none" stroke="#1B2230" stroke-width="14"/>
        <circle cx="90" cy="90" r="70" fill="none" stroke="url(#g1)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dash}" transform="rotate(-90 90 90)"/>
        <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7FA82C"/><stop offset="100%" stop-color="#C6FF3D"/>
        </linearGradient></defs>
        <text x="90" y="84" text-anchor="middle" font-family="Rajdhani" font-size="26" font-weight="700" fill="#E9EEF5">${m.pct.toFixed(1)}%</text>
        <text x="90" y="104" text-anchor="middle" font-family="Inter" font-size="10" fill="#8A93A6">DO OBJETIVO</text>
      </svg>
    </div>
    <div class="grid2" style="margin-top:8px;">
      <div class="stat-box"><div class="lbl">Total Atual</div><div class="val">${fmtN(m.total)}</div></div>
      <div class="stat-box"><div class="lbl">Em Falta</div><div class="val">${fmtN(m.missing)}</div></div>
    </div>
  </div>

  ${p ? `
  <div class="card">
    <div class="card-h"><h3>Distribuição por Stat</h3></div>
    ${stats.map(s=>{
      const pct = m.total>0 ? (s.v/m.total*100) : 0;
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
          <span style="color:var(--text-dim);font-weight:600;">${s.l}</span>
          <span class="mono-data" style="color:var(--text)">${fmtN(s.v)} <span style="color:var(--text-faint)">(${pct.toFixed(1)}%)</span></span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${s.c};"></div></div>
      </div>`;
    }).join('')}
  </div>` : ''}

  <div class="card">
    <div class="card-h"><h3>Estimativa Temporal</h3></div>
    <div class="list-row"><div class="l1">Ritmo médio diário</div><div class="right l1">${m.rate>0?'+'+fmtN(m.rate)+'/dia':'sem dados'}</div></div>
    <div class="list-row"><div class="l1">Dias até 4M</div><div class="right l1">${m.etaDays ?? '—'}</div></div>
    <div class="list-row"><div class="l1">Data prevista</div><div class="right l1">${m.etaDate ?? '—'}</div></div>
  </div>
  `;
}

/* ---------- CYCLES ---------- */
function renderCycles(){
  const m = computeMetrics();
  const cyc = m.cyc;
  const recent = cyc.phases.slice(-10).reverse();

  return `
  <div class="card">
    <div class="card-h"><h3>Fase Atual</h3><span class="tag ${cyc.current}">${cyclabel(cyc.current)}</span></div>
    <p style="font-size:13px;color:var(--text-dim);line-height:1.6;margin:0;">
      ${cyc.current==='burst' ? 'Crescimento muito acima da média — provavelmente associado a ciclo de Xanax / Happy Jump.' :
        cyc.current==='cooldown' ? 'Crescimento abaixo da média — fase de recuperação ou pausa no treino.' :
        cyc.current==='normal' ? 'Crescimento estável dentro do padrão habitual de treino.' :
        'Ainda sem dados suficientes para classificar a fase (precisas de pelo menos 2 dias de histórico).'}
    </p>
  </div>

  <div class="grid2">
    <div class="stat-box"><div class="lbl">Ganho médio / Burst</div><div class="val sm">+${fmtN(cyc.avgBurst)}</div></div>
    <div class="stat-box"><div class="lbl">Ganho médio / Normal</div><div class="val sm">+${fmtN(cyc.avgNormal)}</div></div>
    <div class="stat-box"><div class="lbl">Stats / dia (geral)</div><div class="val sm">${m.rate>0?'+'+fmtN(m.rate):'—'}</div></div>
    <div class="stat-box"><div class="lbl">Eficiência geral</div><div class="val sm">${cyc.consistency.toFixed(0)}%</div></div>
  </div>

  <div class="card">
    <div class="card-h"><h3>Linha Temporal de Ciclos</h3></div>
    ${recent.length===0 ? `<div class="empty"><div class="ic">⚡</div>Sem ciclos detetados ainda.</div>` :
      recent.map(p=>`
      <div class="list-row">
        <div><div class="l1">${fmtDate(p.date)}</div><div class="l2">${cyclabel(p.phase)}</div></div>
        <div class="right"><span class="${p.delta>=0?'delta-up':'delta-flat'}">${p.delta>=0?'+':''}${fmtN(p.delta)}</span></div>
      </div>`).join('')}
  </div>
  `;
}

/* ---------- TRAVEL (optimizer + plushies/flowers log) ---------- */
function renderTravel(){
  return `
  <div class="chip-row">
    <div class="chip ${state.travelSubTab==='optimizer'?'active':''}" data-subtab="optimizer">✈️ Otimizador</div>
    <div class="chip ${state.travelSubTab==='log'?'active':''}" data-subtab="log">🧾 Registo &amp; Lucro</div>
  </div>
  ${state.travelSubTab==='optimizer' ? renderTravelOptimizer() : renderTravelLog()}
  `;
}

function renderTravelOptimizer(){
  const ts = state.travelSettings;
  const p = state.player;

  if(!state.yata.stocks && !state.yata.loading){
    return `
    <div class="card">
      <div class="card-h"><h3>Otimizador de Viagens</h3></div>
      <p style="font-size:13px;color:var(--text-dim);line-height:1.6;margin-top:0;">
        Calcula automaticamente a rota de viagens mais lucrativa do dia, evitando desperdício de energia/nervo, com base em stocks ao vivo do estrangeiro (dados comunitários <b>YATA</b>, já que a API oficial do Torn não expõe stocks estrangeiros) e no preço de mercado atual de cada item (API oficial do Torn).
      </p>
      <button class="btn btn-primary" id="loadOptBtn">Carregar Stocks ao Vivo</button>
    </div>`;
  }
  if(state.yata.loading){
    return `<div class="card"><div class="empty"><div class="ic">📡</div>A consultar stocks ao vivo...</div></div>`;
  }
  if(state.yata.error){
    return `<div class="card"><div class="alert-box warn">⚠️ <div>${state.yata.error}</div></div>
      <button class="btn btn-ghost btn-sm" id="loadOptBtn" style="margin-top:10px;">Tentar novamente</button></div>`;
  }

  const plan = scheduleTravelPlan();
  const waste = energyNerveWaste(plan.awaySeconds);
  const travelBanner = (p && p.travel && p.travel.timeLeft>0) ?
    `<div class="alert-box info" style="margin-bottom:14px;">🛫 <div>Estás atualmente em viagem (destino: <b>${p.travel.destination}</b>). O plano começa a contar a partir da tua chegada.</div></div>` : '';

  return `
  ${travelBanner}
  <div class="card">
    <div class="card-h"><h3>Plano de Viagem Ótimo</h3>
      <span style="font-size:10px;color:var(--text-faint);">stocks atualizados há ${Math.max(0,Math.round((Date.now()/1000-state.yata.timestamp)/60))} min</span>
    </div>
    <div class="grid2">
      <div class="stat-box"><div class="lbl">Lucro</div><div class="val" style="color:var(--good);">$${fmtN(plan.totalProfit)}</div></div>
      <div class="stat-box"><div class="lbl">Lucro / hora</div><div class="val sm" style="color:var(--good);">$${fmtN(plan.profitPerHour)}/h</div></div>
      <div class="stat-box"><div class="lbl">Dinheiro Necessário</div><div class="val sm">$${fmtN(plan.totalCash)}</div></div>
      <div class="stat-box"><div class="lbl">Voos</div><div class="val sm">${plan.flights}</div></div>
    </div>
  </div>

  ${waste.length ? `<div class="alert-box warn" style="margin-bottom:14px;">⚠️ <div>${waste.join('<br>')}</div></div>` : ''}

  <div class="card">
    <div class="card-h"><h3>Linha Temporal</h3></div>
    ${plan.schedule.length===0 ? `<div class="empty"><div class="ic">✈️</div>Sem viagens lucrativas encontradas para a tua janela de tempo / definições atuais.</div>` :
      plan.schedule.map(leg=>`
      <div class="list-row">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">${leg.flag}</span>
          <div>
            <div class="l1">${leg.name}</div>
            <div class="l2">parte ${fmtTime(leg.depart)} · chega ${fmtTime(leg.arrive)} · volta ${fmtTime(leg.back)}</div>
            <div class="l2">${leg.items.map(i=>`${itemEmoji(i.name)} ${i.name} ×${i.take}`).join(' · ')}</div>
          </div>
        </div>
        <div class="right"><span class="delta-up">+$${fmtN(leg.tripProfit)}</span><div class="l2">$${fmtN(leg.profitPerHour)}/h</div></div>
      </div>`).join('')}
  </div>

  <div class="card">
    <div class="card-h"><h3>Definições do Otimizador</h3></div>
    <div class="field"><label>Método de viagem</label>
      <select id="optMethod">
        <option value="standard" ${ts.method==='standard'?'selected':''}>Standard</option>
        <option value="airstrip" ${ts.method==='airstrip'?'selected':''}>Airstrip (Private Island)</option>
        <option value="business" ${ts.method==='business'?'selected':''}>Business Class</option>
        <option value="both" ${ts.method==='both'?'selected':''}>Airstrip + Business</option>
      </select>
    </div>
    <div class="grid2">
      <div class="field"><label>Capacidade base / viagem</label><input type="number" id="optCap" min="1" value="${ts.totalCap}"></div>
      <div class="field"><label>Janela termina às</label><input type="time" id="optEnd" value="${ts.windowEnd}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Bónus flores extra</label><input type="number" id="optExtraF" min="0" value="${ts.extraFlowerCap}"></div>
      <div class="field"><label>Bónus plushies extra</label><input type="number" id="optExtraP" min="0" value="${ts.extraPlushieCap}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>Limite de dinheiro ($, 0 = sem limite)</label><input type="number" id="optCash" min="0" value="${ts.cashLimit}"></div>
      <div class="field"><label>Taxa de mercado (%)</label><input type="number" id="optTax" min="0" max="20" value="${ts.marketTaxPct}"></div>
    </div>
    <div class="fab-row">
      <button class="btn btn-primary btn-sm" id="saveOptBtn" style="flex:1;">Guardar e Recalcular</button>
      <button class="btn btn-ghost btn-sm" id="loadOptBtn" style="flex:1;">Atualizar Stocks</button>
    </div>
    <p style="font-size:11px;color:var(--text-faint);margin-top:12px;line-height:1.5;">
      Stocks estrangeiros vêm de uma base de dados comunitária (YATA) e podem ter alguns minutos de atraso — não é dado em tempo real garantido pela Torn. O preço de venda usa o valor médio de mercado da API oficial do Torn.
    </p>
  </div>
  `;
}

function fmtTime(d){ return d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}); }

function renderTravelLog(){
  const sum = travelSummary();
  const sorted = state.travel.slice().sort((a,b)=> b.date.localeCompare(a.date));

  return `
  <div class="card">
    <div class="card-h"><h3>Lucro com Viagens</h3></div>
    <div class="grid2">
      <div class="stat-box"><div class="lbl">Lucro Total</div><div class="val">$${fmtN(sum.totalProfit)}</div></div>
      <div class="stat-box"><div class="lbl">Itens Comprados</div><div class="val">${fmtN(sum.totalItems)}</div></div>
      <div class="stat-box"><div class="lbl">Lucro / dia c/ viagem</div><div class="val sm">$${fmtN(sum.perTravelDay)}</div></div>
      <div class="stat-box"><div class="lbl">Lucro médio / dia (geral)</div><div class="val sm">$${fmtN(sum.perCalendarDay)}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-h"><h3>Adicionar Compra</h3></div>
    <div class="grid2">
      <div class="field"><label>Data</label><input type="date" id="trDate" value="${todayStr()}"></div>
      <div class="field"><label>Tipo</label>
        <select id="trType"><option value="plushie">Plushie</option><option value="flower">Flower</option></select>
      </div>
    </div>
    <div class="grid2">
      <div class="field"><label>Quantidade</label><input type="number" id="trQty" min="1" value="1" inputmode="numeric"></div>
      <div class="field"><label>Custo / unidade ($)</label><input type="number" id="trCost" min="0" value="0" inputmode="decimal"></div>
    </div>
    <div class="field"><label>Preço de venda / unidade ($)</label><input type="number" id="trSell" min="0" value="0" inputmode="decimal"></div>
    <button class="btn btn-primary" id="addTravelBtn">Guardar Compra</button>
  </div>

  <div class="card">
    <div class="card-h"><h3>Registo</h3></div>
    ${sorted.length===0 ? `<div class="empty"><div class="ic">🌷</div>Ainda sem compras registadas.</div>` :
      sorted.map((e,idx)=>{
        const realIdx = state.travel.indexOf(e);
        const profit = e.qty*(e.sell-e.cost);
        return `<div class="list-row">
          <div><div class="l1">${e.type==='plushie'?'🧸 Plushie':'🌸 Flower'} ×${e.qty}</div><div class="l2">${fmtDate(e.date)} · venda $${e.sell} · custo $${e.cost}</div></div>
          <div class="right"><span class="delta-up">+$${fmtN(profit)}</span><br><a data-del="${realIdx}" style="font-size:11px;color:var(--danger);cursor:pointer;">remover</a></div>
        </div>`;
      }).join('')}
  </div>
  `;
}

/* ---------- HISTORY ---------- */
function renderHistory(){
  const s = state.snapshots.slice().reverse();
  const chart = state.snapshots.length>=2 ? buildLineChart(state.snapshots) : '';
  return `
  <div class="card">
    <div class="card-h"><h3>Evolução de Stats</h3></div>
    ${chart || `<div class="empty"><div class="ic">📈</div>Precisas de pelo menos 2 snapshots para ver o gráfico.</div>`}
  </div>
  <div class="card">
    <div class="card-h"><h3>Snapshots Diários (${state.snapshots.length})</h3></div>
    ${s.length===0 ? `<div class="empty"><div class="ic">🗂️</div>Sem histórico ainda. Atualiza os dados para começar a guardar snapshots automáticos.</div>` :
      s.map((snap,i)=>{
        const prev = state.snapshots[state.snapshots.length-2-i];
        const delta = prev ? snap.total-prev.total : null;
        return `<div class="list-row">
          <div><div class="l1">${fmtDate(snap.date)}</div><div class="l2">STR ${fmtN(snap.strength)} · DEF ${fmtN(snap.defense)} · SPD ${fmtN(snap.speed)} · DEX ${fmtN(snap.dexterity)}</div></div>
          <div class="right"><div class="l1">${fmtN(snap.total)}</div>${delta!==null?`<span class="${delta>=0?'delta-up':'delta-flat'}">${delta>=0?'+':''}${fmtN(delta)}</span>`:''}</div>
        </div>`;
      }).join('')}
  </div>
  `;
}
function buildLineChart(snaps){
  const w=320,h=130,pad=8;
  const vals = snaps.map(s=>s.total);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = (max-min)||1;
  const stepX = (w-pad*2)/(snaps.length-1);
  const pts = vals.map((v,i)=>{
    const x = pad+i*stepX;
    const y = h-pad-((v-min)/range)*(h-pad*2);
    return [x,y];
  });
  const path = pts.map((p,i)=> (i===0?'M':'L')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  const area = path + ` L${pts[pts.length-1][0].toFixed(1)},${h-pad} L${pts[0][0].toFixed(1)},${h-pad} Z`;
  return `<svg class="svg-chart" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#C6FF3D" stop-opacity="0.35"/><stop offset="100%" stop-color="#C6FF3D" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#ag)"/>
    <path d="${path}" fill="none" stroke="#C6FF3D" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#0B0F16" stroke="#C6FF3D" stroke-width="1.6"/>`).join('')}
  </svg>`;
}

/* ---------- PLANNER ---------- */
const DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
function renderPlanner(){
  const cyc = computeMetrics().cyc;
  const edv = edvdsStatus();
  const plan = buildWeekPlan(cyc, edv);

  return `
  <div class="card">
    <div class="card-h"><h3>Ciclo de 80 Pts (EDVDS) &amp; Xanax</h3></div>
    <div class="field"><label>Última data com 80 pts</label><input type="date" id="edvAnchor" value="${state.settings.edvdsAnchor || ''}"></div>
    <div class="field"><label>Antecedência do stack (dias)</label>
      <select id="edvLead">
        ${[0,1,2].map(n=>`<option value="${n}" ${state.settings.stackLead===n?'selected':''}>${n} dia${n!==1?'s':''} antes</option>`).join('')}
      </select>
    </div>
    <div class="fab-row">
      <button class="btn btn-primary btn-sm" id="saveEdvBtn" style="flex:1;">Guardar</button>
      <button class="btn btn-ghost btn-sm" id="markTodayBtn" style="flex:1;">Marcar hoje = dia dos 80</button>
    </div>
    ${edv ? `
      <div class="hairline"></div>
      <div class="alert-box ${edv.shouldStackNow?'warn':'info'}" style="margin-top:4px;">
        <span>${edv.shouldStackNow?'💊':'🗓️'}</span>
        <div>${edv.isTodayThe80 ? '<b>Hoje é o dia dos 80 pts!</b>' :
          `Faltam <b>${edv.daysUntilNext}</b> dia(s) para o próximo dia dos 80 pts (${edv.nextDateStr}).`}
          ${edv.shouldStackNow && !edv.isTodayThe80 ? ' Começa já o stack de Xanax para o happy jump calhar nesse dia.' : ''}
        </div>
      </div>` : `<p style="font-size:12px;color:var(--text-faint);margin-top:10px;">Define a última data em que tiveste 80 pts no job para ativar o lembrete automático a cada 4 dias.</p>`}
  </div>

  <div class="card">
    <div class="card-h"><h3>Planner Semanal Sugerido</h3></div>
    ${plan.map(d=>`
      <div class="day-pill">
        <div><div class="dname">${d.day}</div><div class="ddate">${d.dateStr}</div></div>
        <span class="tag ${d.phase}">${d.label}</span>
      </div>
    `).join('')}
    <p style="font-size:11px;color:var(--text-faint);margin-top:10px;line-height:1.5;">
      Sugestão gerada automaticamente com base no teu padrão histórico de ciclos e no calendário dos 80 pts. Ajusta conforme energia, nervo e disponibilidade reais.
    </p>
  </div>
  `;
}
function buildWeekPlan(cyc, edv){
  const out = [];
  for(let i=0;i<7;i++){
    const d = new Date(); d.setDate(d.getDate()+i);
    const dayName = DAY_NAMES[d.getDay()];
    const dateStr = d.toLocaleDateString('pt-PT',{day:'2-digit',month:'short'});
    let phase = 'normal', label='Treino Normal';

    if(edv){
      const diff = i - (edv.daysUntilNext);
      const mod = ((diff % 4)+4)%4;
      if(mod===0){ phase='burst'; label='Burst — Dia dos 80 pts'; }
      else if(mod===4-edv.lead || (edv.lead>0 && mod===4-edv.lead)){ phase='burst'; label='Stack de Xanax'; }
      else if(mod===1){ phase='cooldown'; label='Cooldown'; }
      else { phase='normal'; label='Treino Normal'; }
    } else if(cyc.phases.length){
      const seq = ['normal','normal','burst','cooldown'];
      phase = seq[i%seq.length];
      label = phase==='burst'?'Provável Burst':phase==='cooldown'?'Cooldown':'Treino Normal';
    }
    out.push({day:dayName, dateStr, phase, label});
  }
  return out;
}

/* =================================================================
   TAB EVENT HANDLERS (re-attached on every render)
================================================================= */
function attachTabHandlers(){
  const refreshBtn = document.getElementById('refreshBtn');
  if(refreshBtn) refreshBtn.onclick = ()=> refreshData(true);

  const dashRefresh = document.getElementById('dashRefresh');
  if(dashRefresh) dashRefresh.onclick = ()=> refreshData(true);

  document.querySelectorAll('[data-subtab]').forEach(el=>{
    el.onclick = ()=>{ state.travelSubTab = el.dataset.subtab; render(); };
  });

  const loadOptBtn = document.getElementById('loadOptBtn');
  if(loadOptBtn) loadOptBtn.onclick = ()=> loadTravelOptimizerData();

  const saveOptBtn = document.getElementById('saveOptBtn');
  if(saveOptBtn){
    saveOptBtn.onclick = ()=>{
      state.travelSettings = {
        method: document.getElementById('optMethod').value,
        totalCap: parseInt(document.getElementById('optCap').value,10)||1,
        extraFlowerCap: parseInt(document.getElementById('optExtraF').value,10)||0,
        extraPlushieCap: parseInt(document.getElementById('optExtraP').value,10)||0,
        cashLimit: parseFloat(document.getElementById('optCash').value)||0,
        windowEnd: document.getElementById('optEnd').value || '23:00',
        marketTaxPct: parseFloat(document.getElementById('optTax').value)||0
      };
      lsSet(K.travelSettings, state.travelSettings);
      toast('Definições guardadas ✓');
      render();
    };
  }

  const addTravelBtn = document.getElementById('addTravelBtn');
  if(addTravelBtn){
    addTravelBtn.onclick = ()=>{
      const date = document.getElementById('trDate').value || todayStr();
      const type = document.getElementById('trType').value;
      const qty = parseFloat(document.getElementById('trQty').value)||0;
      const cost = parseFloat(document.getElementById('trCost').value)||0;
      const sell = parseFloat(document.getElementById('trSell').value)||0;
      if(qty<=0){ toast('Indica uma quantidade válida.'); return; }
      state.travel.push({date,type,qty,cost,sell});
      lsSet(K.travel, state.travel);
      toast('Compra guardada ✓');
      render();
    };
  }
  document.querySelectorAll('[data-del]').forEach(el=>{
    el.onclick = ()=>{
      const idx = parseInt(el.dataset.del,10);
      state.travel.splice(idx,1);
      lsSet(K.travel, state.travel);
      render();
    };
  });

  const saveEdvBtn = document.getElementById('saveEdvBtn');
  if(saveEdvBtn){
    saveEdvBtn.onclick = ()=>{
      state.settings.edvdsAnchor = document.getElementById('edvAnchor').value || null;
      state.settings.stackLead = parseInt(document.getElementById('edvLead').value,10);
      lsSet(K.settings, state.settings);
      toast('Definições guardadas ✓');
      render();
    };
  }
  const markTodayBtn = document.getElementById('markTodayBtn');
  if(markTodayBtn){
    markTodayBtn.onclick = ()=>{
      state.settings.edvdsAnchor = todayStr();
      lsSet(K.settings, state.settings);
      toast('Hoje marcado como dia dos 80 pts ✓');
      render();
    };
  }
}

/* =================================================================
   BOOT
================================================================= */
function bootApp(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('app').classList.add('active');
  render();
  if(state.apikey) refreshData(false);
}

document.addEventListener('DOMContentLoaded', ()=>{
  if(sessionStorage.getItem(K.session)==='1' && lsGet(K.pwhash,null)){
    bootApp();
  } else {
    renderAuth();
  }
});
})();

/* =================================================================
   SERVICE WORKER REGISTRATION (offline app shell, PWA install)
================================================================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Silent fail (e.g. running from file:// where SW isn't supported)
    });
  });
}
