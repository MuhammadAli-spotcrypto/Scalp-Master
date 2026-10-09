let trackedSymbols=[];
let refreshCounter=5;
let activeTrades=JSON.parse(localStorage.getItem('scalpTradesV3'))||{};
let premiumIctNotified=JSON.parse(localStorage.getItem('premiumIctNotified'))||{};
function requestNotificationPermission(){if("Notification" in window){Notification.requestPermission().then(permission=>{if(permission==="granted")alert("Notifications Enabled!");});}}
function playAlertSound(){
let context=new(window.AudioContext||window.webkitAudioContext)();
let osc1=context.createOscillator();let gain1=context.createGain();
osc1.type='sine';osc1.connect(gain1);gain1.connect(context.destination);
osc1.frequency.setValueAtTime(523.25,context.currentTime);
gain1.gain.setValueAtTime(0,context.currentTime);gain1.gain.linearRampToValueAtTime(0.3,context.currentTime+0.02);gain1.gain.exponentialRampToValueAtTime(0.001,context.currentTime+1);
osc1.start(context.currentTime);osc1.stop(context.currentTime+1);
setTimeout(()=>{
let osc2=context.createOscillator();let gain2=context.createGain();
osc2.type='sine';osc2.connect(gain2);gain2.connect(context.destination);
osc2.frequency.setValueAtTime(659.25,context.currentTime);
gain2.gain.setValueAtTime(0,context.currentTime);gain2.gain.linearRampToValueAtTime(0.3,context.currentTime+0.02);gain2.gain.exponentialRampToValueAtTime(0.001,context.currentTime+1.5);
osc2.start(context.currentTime);osc2.stop(context.currentTime+1.5);
},150);
}
function notifyUser(title,body,playSound=true){
if(playSound)playAlertSound();
if(Notification.permission==="granted"){new Notification(title,{body:body,icon:"https://cryptologos.cc/logos/tether-usdt-logo.png"});}
}
function calculateWildersRSIArray(closes){
if(closes.length<16)return[];
let gains=0,losses=0;
for(let i=1;i<=14;i++){let diff=closes[i]-closes[i-1];if(diff>0)gains+=diff;else losses-=diff;}
let avgGain=gains/14;let avgLoss=losses/14;let rsiArray=[];
for(let i=15;i<closes.length;i++){
let diff=closes[i]-closes[i-1];let currentGain=diff>0?diff:0;let currentLoss=diff<0?Math.abs(diff):0;
avgGain=((avgGain*13)+currentGain)/14;avgLoss=((avgLoss*13)+currentLoss)/14;
let rs=avgLoss===0?100:avgGain/avgLoss;rsiArray.push(100-(100/(1+rs)));
}
return rsiArray;
}
function calculateSMA(closes,period=20){
if(closes.length<period)return 0;let sum=0;
for(let i=closes.length-period;i<closes.length;i++)sum+=closes[i];
return sum/period;
}
function calculateEMA(data,period){
let k=2/(period+1);let ema=[data[0]];
for(let i=1;i<data.length;i++)ema.push(data[i]*k+ema[i-1]*(1-k));
return ema;
}
function getSmoothedHACurrentState(klines){
if(klines.length<30)return false;
let opens=klines.map(k=>parseFloat(k[1])),highs=klines.map(k=>parseFloat(k[2]));
let lows=klines.map(k=>parseFloat(k[3])),closes=klines.map(k=>parseFloat(k[4]));
let emaO=calculateEMA(opens,10),emaH=calculateEMA(highs,10);
let emaL=calculateEMA(lows,10),emaC=calculateEMA(closes,10);
let haO=[(emaO[0]+emaC[0])/2];let haC=[];
for(let i=0;i<emaC.length;i++){haC.push((emaO[i]+emaH[i]+emaL[i]+emaC[i])/4);if(i>0)haO.push((haO[i-1]+haC[i-1])/2);}
let smoothHaO=calculateEMA(haO,10),smoothHaC=calculateEMA(haC,10);
let currentO=smoothHaO[smoothHaO.length-1],currentC=smoothHaC[smoothHaC.length-1];
return currentC>currentO;
}
function getICTAdvanced(klines){
if(klines.length<20)return{isICT:false,isGoldenICT:false};
let i=klines.length-1;
const isGreen=(idx)=>parseFloat(klines[idx][4])>=parseFloat(klines[idx][1]);
const getHigh=(idx)=>parseFloat(klines[idx][2]);
const getLow=(idx)=>parseFloat(klines[idx][3]);
const getBodyLow=(idx)=>Math.min(parseFloat(klines[idx][1]),parseFloat(klines[idx][4]));
let currentCandleGreen=isGreen(i);let elapsedMins=(Date.now()-klines[i][0])/60000;
if(currentCandleGreen&&isGreen(i-1))return{isICT:false,isGoldenICT:false};
let startIdx=currentCandleGreen?i-1:i;
let gap2MinLow=Infinity,gap2MinIdx=-1,k=startIdx;
while(k>=0&&!isGreen(k)){if(getLow(k)<gap2MinLow){gap2MinLow=getLow(k);gap2MinIdx=k;}k--;}
if(k<0)return{isICT:false,isGoldenICT:false};
let w2High=getHigh(k),w2Low=getLow(k);
while(k>=0&&isGreen(k)){w2High=Math.max(w2High,getHigh(k));w2Low=Math.min(w2Low,getLow(k));k--;}
if(k<0||((w2High-w2Low)/w2Low)*100<1.0)return{isICT:false,isGoldenICT:false};
let gap1MinLow=Infinity,gap1MinIdx=-1;
while(k>=0&&!isGreen(k)){if(getLow(k)<gap1MinLow){gap1MinLow=getLow(k);gap1MinIdx=k;}k--;}
if(gap1MinIdx===-1)return{isICT:false,isGoldenICT:false};
let w1High=getHigh(k),w1Low=getLow(k);
while(k>=0&&isGreen(k)){w1High=Math.max(w1High,getHigh(k));w1Low=Math.min(w1Low,getLow(k));k--;}
if(((w1High-w1Low)/w1Low)*100<1.0)return{isICT:false,isGoldenICT:false};
let slope=(gap2MinLow-gap1MinLow)/(gap2MinIdx-gap1MinIdx);
for(let j=gap1MinIdx+1;j<=gap2MinIdx;j++){let trendlineY=gap1MinLow+slope*(j-gap1MinIdx);if(getBodyLow(j)<trendlineY)return{isICT:false,isGoldenICT:false};}
let isGoldenICT=currentCandleGreen&&elapsedMins>=10;
return{isICT:!currentCandleGreen,isGoldenICT:isGoldenICT};
}
function checkPremiumICT(klines){
if(klines.length<30)return false;
let i=klines.length-1;let currentLow=parseFloat(klines[i][3]);
let min25=Infinity,max25=0;
for(let j=i-25;j<i;j++){let h=parseFloat(klines[j][2]);let l=parseFloat(klines[j][3]);if(h>max25)max25=h;if(l<min25)min25=l;}
let rangePercent=((max25-min25)/min25)*100;
return(rangePercent<=8.5)&&(currentLow>=min25);
}
function checkRsiDivergence(klines,rsiArr){
let currIdx=klines.length-1;let currentLow=parseFloat(klines[currIdx][3]);let currentRsi=rsiArr[rsiArr.length-1];
let isGreen=parseFloat(klines[currIdx][4])>=parseFloat(klines[currIdx][1]);let elapsedMins=(Date.now()-klines[currIdx][0])/60000;
let prevLow=Infinity,prevIdx=-1;
for(let i=currIdx-20;i<=currIdx-5;i++){if(i<0)continue;let l=parseFloat(klines[i][3]);if(l<prevLow){prevLow=l;prevIdx=i;}}
if(prevIdx!==-1){
let rsiOffset=rsiArr.length-klines.length;let prevRsi=rsiArr[prevIdx+rsiOffset];
if(currentLow<prevLow&&currentRsi>prevRsi)return{isDiv:true,isConfirmed:isGreen&&elapsedMins>=5};
}
return{isDiv:false,isConfirmed:false};
}
const delay=ms=>new Promise(res=>setTimeout(res,ms));
async function initDashboard(){
try{
const infoRes=await fetch('https://api.binance.com/api/v3/exchangeInfo');const info=await infoRes.json();
const activeSymbols=new Set();info.symbols.forEach(s=>{if(s.status==='TRADING'&&s.isSpotTradingAllowed)activeSymbols.add(s.symbol);});
const tickerRes=await fetch('https://api.binance.com/api/v3/ticker/24hr');const tickers=await tickerRes.json();
trackedSymbols=tickers.filter(t=>t.symbol.endsWith('USDT')&&activeSymbols.has(t.symbol)&&!t.symbol.includes('UPUSDT')&&!t.symbol.includes('DOWNUSDT')).sort((a,b)=>parseFloat(b.quoteVolume)-parseFloat(a.quoteVolume)).map(t=>t.symbol);
await refreshRSIValues(true);
}catch(error){console.error("Init Error",error);}
}
async function get30mData(symbol){
try{
const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=30m&limit=250`);const klines=await res.json();
const rsiArr=calculateWildersRSIArray(klines.map(k=>parseFloat(k[4])));const shaGreen=getSmoothedHACurrentState(klines);
return{rsi:rsiArr[rsiArr.length-1],shaGreen:shaGreen};
}catch(e){return{rsi:0,shaGreen:false};}
}
async function checkDailyTrend(symbol){
try{
const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=21`);const klines=await res.json();
const closes=klines.map(k=>parseFloat(k[4]));return closes[closes.length-1]>calculateSMA(closes,20);
}catch(e){return false;}
}
async function refreshRSIValues(forceFullRefresh=false){
if(forceFullRefresh)refreshCounter=5;
try{
let coinsData=[];const chunkSize=35;
for(let i=0;i<trackedSymbols.length;i+=chunkSize){
const chunk=trackedSymbols.slice(i,i+chunkSize);
const promises=chunk.map(async(symbol)=>{
try{
const res=await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=250`);const klines=await res.json();
if(klines.length<30)return null;
const closes=klines.map(k=>parseFloat(k[4]));const rsiArr=calculateWildersRSIArray(closes);
let prevRsi=rsiArr[rsiArr.length-2];let currentRsi=rsiArr[rsiArr.length-1];
let currentClose=parseFloat(klines[klines.length-1][4]);let previousClose=parseFloat(klines[klines.length-2][4]);
let changePercent=((currentClose-previousClose)/previousClose)*100;
let sha1H=getSmoothedHACurrentState(klines);
let isPremium=false,premiumType="";
let isICT=false,isGoldenICT=false,isV1=false,isGolden=false,isHiddenBullish=false,isOversold=false;
if(currentRsi>=50&&currentRsi<=60&&sha1H){
let chancePremium=(currentRsi>=52&&currentRsi<=58.3);let chanceGolden=(currentClose>calculateSMA(closes,20));
let m30=null;if(chancePremium||chanceGolden)m30=await get30mData(symbol);
if(chancePremium&&m30&&m30.shaGreen){
isPremium=true;premiumType="V1";
if(prevRsi<55&&currentRsi>=55){if(!activeTrades[symbol]){activeTrades[symbol]={price:currentClose,time:Date.now(),hit:false};notifyUser(`V1 Order Triggered: ${symbol}`,`RSI Crossed 55. Trading Started!`,true);}}
}
if(!isPremium&&chanceGolden){if(await checkDailyTrend(symbol)){if(m30&&m30.rsi>currentRsi){isGolden=true;}}else{isV1=true;}}else if(!isPremium){isV1=true;}
}
if(!isPremium&&currentRsi>=29&&currentRsi<=42){
let ictData=getICTAdvanced(klines);
if(ictData.isICT||ictData.isGoldenICT){
isICT=ictData.isICT;isGoldenICT=ictData.isGoldenICT;
if(checkPremiumICT(klines)){isPremium=true;premiumType="ICT";isICT=false;isGoldenICT=false;let lastNotified=premiumIctNotified[symbol]||0;if(Date.now()-lastNotified>3600000){notifyUser(`Premium ICT: ${symbol}`,`Support Held (Sideways). Setup Detected!`,false);premiumIctNotified[symbol]=Date.now();}}
}
}
if(!isPremium&&!isV1&&!isGolden&&!isICT&&!isGoldenICT){
if(currentRsi>=30&&currentRsi<=42){let divData=checkRsiDivergence(klines,rsiArr);if(divData.isConfirmed){isPremium=true;premiumType="Divergence";}else{isHiddenBullish=true;}}else if(currentRsi>=10&&currentRsi<30){isOversold=true;}
}
if(activeTrades[symbol]){let t=activeTrades[symbol];let gain=((currentClose-t.price)/t.price)*100;if(gain>=1.0&&!t.hit){t.hit=true;t.hitTime=Date.now();notifyUser(`✅ Target Hit!`,`${symbol} gave 1% profit!`,true);}activeTrades[symbol].currentGain=gain;}
return{name:symbol.replace('USDT',''),symbol:symbol,rsi:currentRsi,change:changePercent,isPremium:isPremium,premiumType:premiumType,isICT:isICT,isGoldenICT:isGoldenICT,isV1:isV1,isGolden:isGolden,isHiddenBullish:isHiddenBullish,isOversold:isOversold};
}catch(e){return null;}
});
const results=await Promise.all(promises);coinsData.push(...results.filter(r=>r!==null));await delay(150);
}
localStorage.setItem('scalpTradesV3',JSON.stringify(activeTrades));localStorage.setItem('premiumIctNotified',JSON.stringify(premiumIctNotified));
refreshCounter++;if(refreshCounter>=5){renderDashboard(coinsData);refreshCounter=0;document.getElementById('update-time').innerText=`Live - Sorted at ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;}else{renderDashboard(coinsData);}
}catch(error){console.error(error);}
}
function renderDashboard(coins){
let premium=[],ict=[],golden=[],v1=[],bullish=[],oversold=[];
coins.forEach(coin=>{if(coin.isPremium)premium.push(coin);else if(coin.isICT||coin.isGoldenICT)ict.push(coin);else if(coin.isGolden)golden.push(coin);else if(coin.isV1)v1.push(coin);else if(coin.isHiddenBullish)bullish.push(coin);else if(coin.isOversold)oversold.push(coin);});
premium.sort((a,b)=>b.rsi-a.rsi);ict.sort((a,b)=>b.rsi-a.rsi);golden.sort((a,b)=>b.rsi-a.rsi);v1.sort((a,b)=>b.rsi-a.rsi);bullish.sort((a,b)=>b.rsi-a.rsi);oversold.sort((a,b)=>b.rsi-a.rsi);
const generateHTML=(arr,cardClass)=>{
return arr.map(coin=>{
let changeClass=coin.change>=0?'change-up':'change-down';let changeIcon=coin.change>=0?'▲':'▼';let badgeHTML="";
if(coin.isPremium){let badgeClass=coin.premiumType==='V1'?'badge-v1':(coin.premiumType==='Divergence'?'badge-div':'badge-ict');badgeHTML=`<span class="badge ${badgeClass}">${coin.premiumType}</span>`;}
return `<a href="https://www.tradingview.com/chart/?symbol=BINANCE:${coin.symbol}" target="_blank" class="coin-card ${cardClass}">${badgeHTML}<span class="coin-name">${coin.name}</span><div class="coin-data"><span class="coin-rsi">RSI: ${coin.rsi.toFixed(2)}</span><span class="coin-change ${changeClass}">${changeIcon} ${Math.abs(coin.change).toFixed(2)}%</span></div></a>`;
}).join('');
};
document.getElementById('grid-premium').innerHTML=generateHTML(premium,'card-premium');document.getElementById('count-premium').innerText=`${premium.length} coins`;document.getElementById('cat-premium').style.display=premium.length>0?'block':'none';
document.getElementById('grid-ict').innerHTML=generateHTML(ict,'card-ict');document.getElementById('count-ict').innerText=`${ict.length} coins`;
document.getElementById('grid-golden').innerHTML=generateHTML(golden,'card-golden');document.getElementById('count-golden').innerText=`${golden.length} coins`;
document.getElementById('grid-v1').innerHTML=generateHTML(v1,'card-v1');document.getElementById('count-v1').innerText=`${v1.length} coins`;
document.getElementById('grid-bullish').innerHTML=generateHTML(bullish,'card-bullish');document.getElementById('count-bullish').innerText=`${bullish.length} coins`;
document.getElementById('grid-oversold').innerHTML=generateHTML(oversold,'card-oversold');document.getElementById('count-oversold').innerText=`${oversold.length} coins`;
let ordersList=document.getElementById('orders-list');let ordersHTML="";let tradeKeys=Object.keys(activeTrades);
if(tradeKeys.length>0){
document.getElementById('orders-section').style.display='block';
tradeKeys.forEach(sym=>{
let t=activeTrades[sym];let mins=Math.round((Date.now()-t.time)/60000);
if(t.hit){
let hitMins=Math.round((t.hitTime-t.time)/60000);
ordersHTML+=`<a href="https://www.tradingview.com/chart/?symbol=BINANCE:${sym}" target="_blank" class="order-item order-hit"><div class="order-left"><div class="order-title"><span>V1</span> ${sym}</div><div class="order-subtitle">1% in ${hitMins} mins</div></div><div class="order-right"><div class="order-pnl pnl-up">+1.00%</div><div class="order-status">Target Hit ✅</div></div></a>`;
}else{
let pnlClass=t.currentGain>=0?'pnl-up':'pnl-down';
ordersHTML+=`<a href="https://www.tradingview.com/chart/?symbol=BINANCE:${sym}" target="_blank" class="order-item"><div class="order-left"><div class="order-title"><span>V1</span> ${sym}</div><div class="order-subtitle">Active since ${mins} mins</div></div><div class="order-right"><div class="order-pnl ${pnlClass}">${t.currentGain>0?'+':''}${t.currentGain.toFixed(2)}%</div><div class="order-status">In Progress ⏳</div></div></a>`;
}
});
ordersList.innerHTML=ordersHTML;
}else{document.getElementById('orders-section').style.display='none';}
document.getElementById('loading').style.display='none';document.getElementById('dashboard').style.display='block';
}
initDashboard();setInterval(()=>{refreshRSIValues(false);},60000);
