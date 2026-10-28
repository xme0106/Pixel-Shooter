// ===== SETTINGS + BEST SCORES (localStorage, fails soft when storage is blocked) =====
var SKEY='pixelShooter.v1';
var settings={vol:0.8,muted:false,quality:'auto',mode:'normal',stage:'basic',char:'tank',bests:{}};
function loadSettings(){
  try{
    var o=JSON.parse(localStorage.getItem(SKEY)||'{}');
    if(typeof o.vol==='number')settings.vol=Math.max(0,Math.min(1,o.vol));
    if(typeof o.muted==='boolean')settings.muted=o.muted;
    if(['auto','high','low'].indexOf(o.quality)>=0)settings.quality=o.quality;
    if(['normal','blitz','bossrush'].indexOf(o.mode)>=0)settings.mode=o.mode;
    if(['basic','drift','arena'].indexOf(o.stage)>=0)settings.stage=o.stage;
    if(['tank','scout','gunner','warrior','laser','turret'].indexOf(o.char)>=0)settings.char=o.char;
    if(o.bests&&typeof o.bests==='object')settings.bests=o.bests;
    if(o.bestsV!==2){for(var k in settings.bests){if(k.indexOf('blitz|')===0||k.indexOf('bossrush|')===0)delete settings.bests[k];}settings.bestsV=2;saveSettings();}
  }catch(e){}
}
function saveSettings(){try{localStorage.setItem(SKEY,JSON.stringify(settings));}catch(e){}}
function bestKey(mode,ch){return mode+'|'+ch;}
function getBest(mode,ch){return settings.bests[bestKey(mode,ch)]||null;}
function topBest(){var top=null;for(var k in settings.bests){var b=settings.bests[k];if(b&&(!top||b.score>top.score))top=b;}return top;}
// Returns {isNew, best}. Zero-score runs are never recorded.
function recordRun(mode,ch,sc,wv){
  var k=bestKey(mode,ch),cur=settings.bests[k],isNew=sc>0&&(!cur||sc>cur.score);
  if(isNew){settings.bests[k]={score:sc,wave:wv};saveSettings();}
  return{isNew:isNew,best:settings.bests[k]||{score:sc,wave:wv}};
}
