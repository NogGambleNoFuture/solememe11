const DEX_URL = 'https://solememe23.benjamin-zolota.workers.dev?url=https://api.dexscreener.io/latest/dex/tokens/solana/';
// Solscan public transaction endpoint (no API key) - query recent transactions
const SOLSCAN_TX_URL = 'https://public-api.solscan.io/transaction?limit=20';

const TOP_N = 10;
let REFRESH_MS = 30000;

const $ = id => document.getElementById(id);

function fmt(n){ if(n===undefined||n===null) return '-'; if(n>1e6) return (n/1e6).toFixed(1)+'M'; if(n>1e3) return (n/1e3).toFixed(1)+'k'; return Number(n).toLocaleString(); }

async function fetchDex(){
  try{
    const r = await fetch(DEX_URL);
    if(!r.ok) throw new Error('dexscreener fetch failed '+r.status);
    const j = await r.json();
    return j.pairs || [];
  }catch(e){
    console.error('dex error', e);
    return [];
  }
}

async function fetchSolscanTx(){
  try{
    const r = await fetch(SOLSCAN_TX_URL);
    if(!r.ok) throw new Error('solscan fetch failed '+r.status);
    const j = await r.json();
    return j.data || j || [];
  }catch(e){
    console.error('solscan error', e);
    return [];
  }
}

function makeRow(item, idx){
  const id = item.pairAddress || item.pair || (item.baseToken && item.baseToken.address) || item.id || ('p'+idx);
  const price = Number(item.priceUsd || item.price) || 0;
  const ch1 = Number(item.priceChange?.h1 || item.change?.h1 || 0).toFixed(2);
  const ch24 = Number(item.priceChange?.h24 || item.change?.h24 || 0).toFixed(2);
  const name = (item.baseToken && item.baseToken.name) || item.name || '';
  const sym = (item.baseToken && item.baseToken.symbol) || item.symbol || '';
  const tr = document.createElement('tr');
  tr.dataset.id = id;
  tr.innerHTML = `
    <td>${idx+1}</td>
    <td>${name}</td>
    <td>${sym}</td>
    <td>$${price.toFixed(6)}</td>
    <td style="color:${ch1>=0? '#7cffb2':'#ff7b7b'}">${ch1}%</td>
    <td style="color:${ch24>=0? '#7cffb2':'#ff7b7b'}">${ch24}%</td>
    <td><button class="trade-btn small" data-addr="${item.baseToken?.address||''}">Trade</button></td>
  `;
  tr.querySelector('.trade-btn').addEventListener('click', (e)=>{
    e.stopPropagation();
    const addr = e.target.dataset.addr;
    if(!addr) return alert('Token address not available');
    window.open('https://jup.ag/swap/SOL-'+addr, '_blank');
  });
  tr.addEventListener('click', ()=>{ drawChart(id); loadTwitter(sym); });
  return tr;
}

let lastPairs = [];
async function refreshMovers(){
  const pairs = await fetchDex();
  if(!pairs || !pairs.length){
    $('tokenTable').innerHTML = '<tr><td colspan="7">No data</td></tr>';
    return;
  }
  // sort by 1h change descending (numeric)
  pairs.sort((a,b)=> (Number(b.priceChange?.h1||b.change?.h1||0)) - (Number(a.priceChange?.h1||a.change?.h1||0)));
  const top = pairs.slice(0, TOP_N);
  const tbody = $('tokenTable');
  tbody.innerHTML = '';
  top.forEach((p,i)=> tbody.appendChild(makeRow(p,i)));
  lastPairs = top;
  $('lastUpdate')?.remove();
  const footer = document.querySelector('.footer');
  const u = document.createElement('div'); u.id='lastUpdate'; u.className='muted small'; u.textContent = 'Last update: '+new Date().toLocaleTimeString(); footer.appendChild(u);
}

async function refreshWhales(){
  const data = await fetchSolscanTx();
  const feed = $('whaleFeed');
  feed.innerHTML = '';
  if(!data || !data.length){ feed.innerHTML = '<p class="muted">No recent whale transactions found.</p>'; return; }
  // Filter for large SOL transfers or token transfers with sizable amounts (basic heuristic)
  data.slice(0,20).forEach(tx=>{
    // tx structure can vary; attempt friendly display
    const amount = tx.amount || tx.value || tx.lamport || tx.amountSol || 0;
    const symbol = tx.tokenSymbol || tx.symbol || (tx.tokenTransfers && tx.tokenTransfers[0] && tx.tokenTransfers[0].tokenSymbol) || 'SOL';
    const side = (tx.type && tx.type.toLowerCase().includes('swap')) ? 'trade' : 'tx';
    const el = document.createElement('div');
    el.innerHTML = `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><strong>${symbol}</strong> ${side} — ${fmt(amount)} <a href="https://solscan.io/tx/${tx.txHash||tx.signature}" target="_blank" style="color:#0ff">view</a></div>`;
    feed.appendChild(el);
  });
}

let chart = null;
function drawChart(id){
  // find matching pair in lastPairs
  const p = lastPairs.find(x => (x.pairAddress || x.pair || (x.baseToken && x.baseToken.address) || x.id) === id);
  const ctx = document.getElementById('miniChart').getContext('2d');
  const prices = (p && p.priceHistory) ? p.priceHistory : (p ? [Number(p.priceUsd||p.price||0)] : [0]);
  // small chart
  if(chart) chart.destroy();
  chart = new Chart(ctx, { type:'line', data:{ labels: prices.map((_,i)=>i), datasets:[{ label:(p && p.baseToken && p.baseToken.symbol) || 'price', data: prices, borderColor:'#00ffd1', backgroundColor:'rgba(0,255,209,0.06)', tension:0.3 }]}, options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{display:false}}} });
}

// small twitter loader (will load widget for handle if known)
const TOKEN_TWITTER = {"BONK":"bonk_inu","PEPE":"pepecoin","SHIB":"Shibtoken","DOGE":"dogecoin","FLOKI":"RealFlokiInu"};
function loadTwitter(sym){
  const ph = document.getElementById('tokenFeedPlaceholder');
  if(!ph) return;
  const handle = TOKEN_TWITTER[sym] || null;
  if(!handle){ ph.innerHTML = '<div class="muted">No Twitter handle found.</div>'; return; }
  ph.innerHTML = `<a class="twitter-timeline" data-height="200" href="https://twitter.com/${handle}">Tweets by ${handle}</a>`;
  if(window.twttr && window.twttr.widgets) try{ window.twttr.widgets.load(); }catch(e){}
}

// wiring
document.addEventListener('DOMContentLoaded', ()=>{
  $('refreshSel').addEventListener('change', (e)=>{ REFRESH_MS = Number(e.target.value); clearInterval(window._refreshTimer); window._refreshTimer = setInterval(()=>{ refreshMovers(); refreshWhales(); }, REFRESH_MS); });
  // initial load
  refreshMovers();
  refreshWhales();
  window._refreshTimer = setInterval(()=>{ refreshMovers(); refreshWhales(); }, REFRESH_MS);
  // load twitter widgets
  (function(){ var t=document.createElement('script'); t.src='https://platform.twitter.com/widgets.js'; t.async=true; document.body.appendChild(t); })();
});
