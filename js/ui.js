// ===== UI LAYER: HUD, menus, overlays, layout fitting =====
var OL=document.getElementById('overlay');
var SEL=document.getElementById('score-display'),WEL=document.getElementById('wave-display');
var LEL=document.getElementById('lives-display'),AEL=document.getElementById('ability-display');
var SDL=document.getElementById('shield-display'),BDL=document.getElementById('boots-display');
var DDL=document.getElementById('dodge-display'),UCH=document.getElementById('upgrade-chips');
var WB=document.getElementById('wave-bar');
var ABTN=document.getElementById('ability-btn'),DBTN=document.getElementById('dodge-btn');
var NF=new Intl.NumberFormat('en-US');
function fmt(n){return NF.format(Math.round(n||0));}

// Writes only when the markup changed, so per-frame HUD refreshes don't thrash the DOM
function setHTML(el,html){if(el._h!==html){el._h=html;el.innerHTML=html;}}
function setText(el,txt){if(el._t!==txt){el._t=txt;el.textContent=txt;}}

// ---------- class / mode / stage content ----------
var CLASS_INFO={
  tank:{name:'Tank',blurb:'Slow and tough. Splash shots slow and shove whatever they hit.',ability:'Push wave: knocks back and stuns nearby enemies, and adds a shield (max 4).',
    facts:['Shots splash for 1.5x damage but fire slowly','Every 5th shot is a big stunning blast','Dodge: short dash']},
  scout:{name:'Scout',blurb:'Fast and fragile. Fires almost as quickly as you can aim.',ability:'Dash: a long, invincible dash that damages everything it touches.',
    facts:['Every 3rd shot adds a second parallel bullet','Ability cooldown: 1 second','Dodge: short dash']},
  gunner:{name:'Gunner',blurb:'Twin straight shots. A steady all-rounder.',ability:'Rapid fire: 5 seconds of auto-targeting the three nearest enemies.',
    facts:['3 seconds of cooldown after rapid fire','Dodge: short dash']},
  warrior:{name:'Warrior',blurb:'Melee sword with a three-swing rhythm. Heals as it kills.',ability:'Whirlwind: spinning damage, extra speed and 1.5 seconds of invincibility.',
    facts:['Every 3rd swing is a 360-degree knockback and fires a stunning crescent','+1 HP every 5 kills','Whirlwind lasts 3 seconds, then a 1 second cooldown']},
  laser:{name:'Laser',blurb:'A continuous beam that hits harder the longer it stays on one target.',ability:'Obliterate: four huge beam pulses with a wider beam.',
    facts:['Beam deals 0.3 damage per tick, 6 ticks a second','Obliterate has a 5 second cooldown','Dodge: short dash']},
  turret:{name:'Turret',blurb:'Single shots, plus a squad of helper turrets that follow you.',ability:'Plant a turret, then press again to mobilize it. Two of each type.',
    facts:['Turret types: projectile, laser, shockwave','Dodge: every turret fires a shockwave instead of dashing']}
};
var CLASS_ORDER=['tank','scout','gunner','warrior','laser','turret'];
var MODE_INFO={
  normal:{name:'Normal',desc:'Standard progression. Pick an upgrade after every big boss.'},
  blitz:{name:'Blitz',desc:'Shorter rounds and faster spawns. One random upgrade after every round.'},
  bossrush:{name:'Boss rush',desc:'Mini bosses without a break and big bosses from wave 10. Two or three random upgrades per round.'}
};
var STAGE_INFO={
  basic:{name:'Basic',desc:'A single static arena with nothing in the way.'},
  drift:{name:'Drift',desc:'A large world. The camera follows you, with obstacles and a hard border.'},
  arena:{name:'Arena',desc:'A static arena with random obstacles each run.'}
};
var ABILITY_NAME={tank:'Push wave',scout:'Dash',gunner:'Rapid fire',warrior:'Whirlwind',laser:'Obliterate',turret:'Plant turret'};

// ---------- HUD ----------
function hudAll(){hudScore();hudWave();hudLives();hudAb();hudBar();hudStatus();hudUpgrades();hudDodge();}
function hudScore(){setText(SEL,fmt(score));}
function hudWave(){setText(WEL,String(wave));}
function hudLives(){
  if(maxLives>10){setHTML(LEL,'<span class="on">\u2665</span><span class="hcount">'+lives+'<small>/'+maxLives+'</small></span>');return;}
  var s='';for(var i=0;i<maxLives;i++)s+='<span class="'+(i<lives?'on':'off')+'">'+(i<lives?'♥':'♡')+'</span>';
  setHTML(LEL,s);
}
function hudStatus(){
  setHTML(SDL,shieldHp>0?'<span class="chip shield">Shield x'+shieldHp+'</span>':'');
  setHTML(BDL,bootsTimer>0?'<span class="chip boost">Boost '+Math.ceil(bootsTimer/60)+'s</span>':'');
}
function hudUpgrades(){
  var s='';
  for(var id in ownedUpgrades){var d=UPGRADE_DEFS[id],n=ownedUpgrades[id];if(!d)continue;
    s+='<span class="uchip" style="--c:'+d.color+'" title="'+d.label+'">'+d.icon+(n>1?'<sup>'+n+'</sup>':'')+'</span>';}
  setHTML(UCH,s);
}
function hudBar(){
  var pct=Math.min(100,(waveKills/waveGoal)*100),col=wave%8===0?'#ff2e88':wave%5===0?'#ff9900':'#19f0ff';
  WB.style.background=col;WB.style.boxShadow='0 0 6px '+col;WB.style.width=pct+'%';
}
// Ability state shared by the HUD text and the touch button
function abState(){
  var p=player;if(!p)return null;
  var name=ABILITY_NAME[selChar];
  if(selChar==='turret')name=turrets.length>=6?'Turrets full':(p.turretPendingMobile?'Mobilize':'Plant turret');
  if(selChar==='scout'&&p.dashing)return{name:name,state:'active',secs:0,ratio:1};
  if(abActive){var dur=p.abDur||1;return{name:name,state:'active',secs:Math.ceil((dur-abTimer)/60),ratio:1-abTimer/dur};}
  if(abCd>0)return{name:name,state:'cd',secs:Math.ceil(abCd/60),ratio:abCd/p.abCdMax};
  return{name:name,state:'ready',secs:0,ratio:0};
}
function hudAb(){
  var a=abState();if(!a){setHTML(AEL,'');return;}
  var col=CHARS[selChar].color,s;
  if(a.state==='ready')s='<span class="ab ready" style="--c:'+col+'">'+a.name+'</span><kbd>Right-click</kbd><kbd>E</kbd>';
  else if(a.state==='cd')s='<span class="ab cd">'+a.name+' <b>'+a.secs+'s</b></span>';
  else s='<span class="ab active">'+a.name+(a.secs?' <b>'+a.secs+'s</b>':'')+'</span>';
  setHTML(AEL,s);
  setText(ABTN.firstChild,a.name);
  ABTN.classList.toggle('active',a.state==='active');
  ABTN.style.setProperty('--cd',a.state==='cd'?a.ratio.toFixed(3):0);
}
function hudDodge(){
  var p=player;if(!p){setHTML(DDL,'');return;}
  var max=selChar==='turret'?TURRET_SHOCK_CD:DODGE_CD_MAX,label=selChar==='turret'?'Shockwave':'Dodge';
  if(p.dodgeCd>0){setHTML(DDL,'<span class="ab cd">'+label+' <b>'+(p.dodgeCd/60).toFixed(1)+'s</b></span>');DBTN.style.setProperty('--cd',(p.dodgeCd/max).toFixed(3));}
  else{setHTML(DDL,'<span class="ab ready" style="--c:#3dffa6">'+label+'</span><kbd>Shift</kbd>');DBTN.style.setProperty('--cd',0);}
  setText(DBTN.firstChild,label);
}
function hudCooldowns(){if(!player)return;hudAb();hudDodge();}

// ---------- overlay plumbing ----------
function showOverlay(html,cls){OL.className=cls||'';OL.innerHTML=html;OL.style.display='flex';OL.scrollTop=0;}
function hideOverlay(){OL.style.display='none';OL.innerHTML='';}
var overlayGuardUntil=0;
OL.addEventListener('click',function(e){
  var t=e.target.closest?e.target.closest('[data-act]'):null;if(!t||!OL.contains(t))return;
  if(Date.now()<overlayGuardUntil)return;
  unlockAudio();
  runAct(t.getAttribute('data-act'),t.getAttribute('data-arg'));
});
OL.addEventListener('input',function(e){
  if(e.target.id==='vol-slider'){var v=e.target.value/100;setVolume(v);settings.vol=v;saveSettings();}
});
OL.addEventListener('change',function(e){if(e.target.id==='vol-slider')sfxTone(660,'sine',0.08,0.12);});
function runAct(act,arg){
  sfxTone(520,'square',0.04,0.05);
  switch(act){
    case'menu':showMenu();break;
    case'modes':showModeSelect();break;
    case'stages':showStageSelect();break;
    case'chars':showCharSelect();break;
    case'mode':pickMode(arg);break;
    case'stage':pickStage(arg);break;
    case'char':pickChar(arg);break;
    case'start':startGame();break;
    case'resume':resumeGame();break;
    case'exit':exitToMenu();break;
    case'upgrade':applyUpgrade(arg);break;
    case'quality':setQualitySetting(arg);break;
    case'fs':toggleFullscreen();break;
  }
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}

// ---------- pixel wordmark (5x7 bitmap letters, drawn as SVG rects) ----------
var GLYPH={
  P:['11110','10001','10001','11110','10000','10000','10000'],I:['11111','00100','00100','00100','00100','00100','11111'],
  X:['10001','10001','01010','00100','01010','10001','10001'],E:['11111','10000','10000','11110','10000','10000','11111'],
  L:['10000','10000','10000','10000','10000','10000','11111'],S:['01111','10000','10000','01110','00001','00001','11110'],
  H:['10001','10001','10001','11111','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],
  T:['11111','00100','00100','00100','00100','00100','00100'],R:['11110','10001','10001','11110','10100','10010','10001']
};
function wordmarkSVG(){
  var rows=[{t:'PIXEL',cls:'p',y:0},{t:'SHOOTER',cls:'e',y:9}],W2=41,out='',n=0;
  rows.forEach(function(r){
    var w=r.t.length*6-1,x0=Math.floor((W2-w)/2);
    for(var li=0;li<r.t.length;li++){
      var g=GLYPH[r.t[li]];
      for(var gy=0;gy<7;gy++)for(var gx=0;gx<5;gx++)if(g[gy][gx]==='1'){
        var x=x0+li*6+gx;out+='<rect class="'+r.cls+'" x="'+x+'" y="'+(r.y+gy)+'" width="1" height="1" style="--i:'+(x+(r.cls==='e'?4:0))+'"/>';n++;
      }
    }
  });
  return'<svg class="wordmark" viewBox="0 0 '+W2+' 16" shape-rendering="crispEdges" role="img" aria-label="Pixel Shooter">'+out+'</svg>';
}

// ---------- small canvas art: class portraits and stage previews ----------
function drawPortrait(cv,col){
  var c=cv.getContext('2d'),s=17;c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,cv.width,cv.height);c.translate(cv.width/2,cv.height/2+4);
  c.shadowColor=col;c.shadowBlur=14;c.fillStyle=col;c.fillRect(-s,-s,s*2,s*2);c.shadowBlur=0;
  c.strokeStyle='#fff';c.lineWidth=2;c.strokeRect(-s,-s,s*2,s*2);
  c.fillStyle='#000';c.fillRect(-s*.55,-s*.3,s*.38,s*.38);c.fillRect(s*.17,-s*.3,s*.38,s*.38);
  c.fillStyle=col;c.fillRect(-s*.45,-s*.2,s*.18,s*.18);c.fillRect(s*.27,-s*.2,s*.18,s*.18);
  c.fillStyle='#000';c.fillRect(-s*.5,s*.22,s,s*.22);c.fillStyle=col;c.fillRect(-s*.3,s*.26,s*.18,s*.1);c.fillRect(s*.12,s*.26,s*.18,s*.1);
  c.fillStyle=col;c.fillRect(-3,-s-9,6,10);
}
function drawStagePreview(cv,id){
  var c=cv.getContext('2d'),w=cv.width,h=cv.height;c.clearRect(0,0,w,h);c.fillStyle='#04060f';c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(25,240,255,.12)';c.lineWidth=1;for(var x=0;x<w;x+=10){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(var y=0;y<h;y+=10){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  function box(x,y,bw,bh){c.fillStyle='rgba(10,30,40,.95)';c.fillRect(x,y,bw,bh);c.strokeStyle='rgba(25,240,255,.7)';c.lineWidth=1.5;c.strokeRect(x,y,bw,bh);}
  if(id==='arena'){box(w*.18,h*.2,w*.16,h*.22);box(w*.62,h*.18,w*.2,h*.14);box(w*.3,h*.62,w*.22,h*.16);box(w*.72,h*.58,w*.12,h*.26);}
  if(id==='drift'){c.strokeStyle='#ff2e88';c.lineWidth=3;c.strokeRect(2,2,w-4,h-4);box(w*.1,h*.15,w*.12,h*.18);box(w*.7,h*.12,w*.14,h*.16);box(w*.2,h*.7,w*.18,h*.14);box(w*.66,h*.64,w*.16,h*.2);
    c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=1.5;c.setLineDash([4,3]);c.strokeRect(w*.36,h*.32,w*.3,h*.36);c.setLineDash([]);}
  c.fillStyle='#19f0ff';var cx=id==='basic'||id==='arena'?w/2:w/2,cy=h/2;c.fillRect(cx-3,cy-3,6,6);
}
function paintCardArt(root){
  var cs=root.querySelectorAll('canvas[data-portrait]');for(var i=0;i<cs.length;i++)drawPortrait(cs[i],CHARS[cs[i].getAttribute('data-portrait')].color);
  var ps=root.querySelectorAll('canvas[data-stage]');for(var j=0;j<ps.length;j++)drawStagePreview(ps[j],ps[j].getAttribute('data-stage'));
}

// ---------- menu screens ----------
function stepsHTML(n){
  var names=['Mode','Stage','Class'],s='<div class="steps" aria-label="Setup steps">';
  for(var i=0;i<3;i++)s+='<span class="'+(i+1<n?'done':i+1===n?'now':'')+'">'+(i+1)+'. '+names[i]+'</span>';
  return s+'</div>';
}
function controlsHTML(){
  if(isTouchDevice)return'<dl class="keys"><dt>Left stick</dt><dd>Move</dd><dt>Right stick</dt><dd>Aim and fire while held</dd><dt>Round buttons</dt><dd>Class ability and dodge</dd></dl>';
  return'<dl class="keys"><dt>W A S D</dt><dd>Move</dd><dt>Mouse</dt><dd>Aim. Hold left button to fire</dd><dt>Right-click or E</dt><dd>Class ability</dd><dt>Shift</dt><dd>Dodge</dd><dt>P or Esc</dt><dd>Pause</dd></dl>';
}
function showMenu(){
  state='menu';paused=false;
  var top=topBest();
  showOverlay('<div class="screen">'+wordmarkSVG()+'<p class="tagline">Survive the waves. Build your run.</p>'+
    '<button class="btn primary big" data-act="modes">Play</button>'+
    '<p class="best-line">'+(top?'Best score '+fmt(top.score)+' on wave '+top.wave:'')+'</p>'+
    '<p class="rotate-hint">Turn your phone sideways for a bigger play area.</p>'+controlsHTML()+'</div>');
}
function optionCard(act,id,name,desc,sel,extra){
  return'<button class="card" type="button" role="radio" aria-checked="'+(sel?'true':'false')+'" data-act="'+act+'" data-arg="'+id+'" id="'+act+'-'+id+'">'+(extra||'')+
    '<span class="card-name">'+name+'</span><span class="card-desc">'+desc+'</span></button>';
}
function showModeSelect(){
  state='modeselect';
  var h='<div class="screen">'+stepsHTML(1)+'<h2>Choose a mode</h2><div class="opt-row" role="radiogroup" aria-label="Mode">';
  Object.keys(MODE_INFO).forEach(function(id){h+=optionCard('mode',id,MODE_INFO[id].name,MODE_INFO[id].desc,selMode===id);});
  h+='</div><div class="actions"><button class="btn ghost" data-act="menu">Back</button><button class="btn primary" data-act="stages">Next</button></div></div>';
  showOverlay(h);
}
function showStageSelect(){
  state='stageselect';
  var h='<div class="screen">'+stepsHTML(2)+'<h2>Choose a stage</h2><div class="opt-row" role="radiogroup" aria-label="Stage">';
  Object.keys(STAGE_INFO).forEach(function(id){h+=optionCard('stage',id,STAGE_INFO[id].name,STAGE_INFO[id].desc,selStage===id,'<canvas class="preview" width="160" height="120" data-stage="'+id+'"></canvas>');});
  h+='</div><div class="actions"><button class="btn ghost" data-act="modes">Back</button><button class="btn primary" data-act="chars">Next</button></div></div>';
  showOverlay(h);paintCardArt(OL);
}
function pips(n,max){var s='';for(var i=0;i<max;i++)s+='<span class="pip'+(i<n?' on':'')+'"></span>';return'<span class="pip-row">'+s+'</span>';}
function classTile(id){
  var ch=CHARS[id],inf=CLASS_INFO[id];
  return'<button class="tile" type="button" role="radio" aria-checked="'+(selChar===id)+'" data-act="char" data-arg="'+id+'" id="char-'+id+'" style="--c:'+ch.color+'">'+
    '<canvas class="portrait" width="56" height="56" data-portrait="'+id+'"></canvas><span class="tile-name">'+inf.name+'</span></button>';
}
function classDetailHTML(id){
  var ch=CHARS[id],inf=CLASS_INFO[id];
  var spd=Math.max(1,Math.min(5,Math.round(ch.speed))),fr=ch.fireCd<=50?5:ch.fireCd<=120?4:ch.fireCd<=250?3:ch.fireCd<=350?2:1;
  var hearts='';for(var i=0;i<ch.lives;i++)hearts+='<span class="pip heart">\u2665</span>';
  var best=getBest(selMode,id);
  return'<div class="cd-main"><span class="card-name">'+inf.name+'</span><span class="card-desc">'+inf.blurb+'</span>'+
    '<span class="pips" style="--c:'+ch.color+'"><span>Lives</span><span class="pip-row">'+hearts+'</span><span>Speed</span>'+pips(spd,5)+'<span>Fire rate</span>'+pips(fr,5)+'</span></div>'+
    '<div class="cd-side"><span class="card-ability">'+inf.ability+'</span><span class="card-more">'+inf.facts.map(esc).join('<br>')+'</span>'+
    '<span class="card-best">'+(best?'Best in '+MODE_INFO[selMode].name+': '+fmt(best.score)+' (wave '+best.wave+')':'No runs yet in '+MODE_INFO[selMode].name)+'</span></div>';
}
function paintClassDetail(){var d=document.getElementById('class-detail');if(d){d.style.setProperty('--c',CHARS[selChar].color);d.innerHTML=classDetailHTML(selChar);}}
function showCharSelect(){
  state='charselect';
  var h='<div class="screen">'+stepsHTML(3)+'<h2>Choose a class</h2><div class="class-grid" role="radiogroup" aria-label="Class">';
  CLASS_ORDER.forEach(function(id){h+=classTile(id);});
  h+='</div><div class="class-detail" id="class-detail"></div>'+
    '<div class="actions"><button class="btn ghost" data-act="stages">Back</button><button class="btn primary" data-act="start">Start run</button></div></div>';
  showOverlay(h);paintCardArt(OL);paintClassDetail();
}
function selectIn(act,id){
  var cs=OL.querySelectorAll('[data-act="'+act+'"]');
  for(var i=0;i<cs.length;i++)cs[i].setAttribute('aria-checked',cs[i].getAttribute('data-arg')===id?'true':'false');
}
function pickMode(id){selMode=id;settings.mode=id;saveSettings();selectIn('mode',id);}
function pickStage(id){selStage=id;settings.stage=id;saveSettings();selectIn('stage',id);}
function pickChar(id){selChar=id;settings.char=id;saveSettings();selectIn('char',id);paintClassDetail();}
function startGame(){announceQueue.length=0;init();state='playing';paused=false;hideOverlay();unlockAudio();}

// ---------- pause / settings ----------
function togglePause(){if(state!=='playing')return;paused=!paused;if(paused)showPauseMenu();else hidePauseMenu();}
function canFullscreen(){var d=document.documentElement;return!!(d.requestFullscreen||d.webkitRequestFullscreen);}
function showPauseMenu(){
  var q=settings.quality;
  function qb(id,label){return'<button type="button" data-act="quality" data-arg="'+id+'" aria-pressed="'+(q===id)+'">'+label+'</button>';}
  showOverlay('<div class="screen"><h2>Paused</h2>'+
    '<div class="actions"><button class="btn primary" data-act="resume">Resume</button></div>'+
    '<div class="settings"><label for="vol-slider">Volume</label><input id="vol-slider" type="range" min="0" max="100" value="'+Math.round(settings.vol*100)+'">'+
    '<label>Effects</label><div class="seg">'+qb('auto','Auto')+qb('high','Full')+qb('low','Light')+'</div>'+
    (isTouchDevice&&canFullscreen()?'<label>Screen</label><div class="seg"><button type="button" data-act="fs">Toggle fullscreen</button></div>':'')+'</div>'+
    '<div class="actions"><button class="btn danger" data-act="exit">End run</button></div></div>','over-game');
}
function hidePauseMenu(){hideOverlay();}
function resumeGame(){paused=false;hidePauseMenu();}
function exitToMenu(){recordRun(selMode,selChar,score,wave);paused=false;showMenu();}
function setQualitySetting(q){settings.quality=q;saveSettings();setQuality(q);var b=OL.querySelectorAll('[data-act="quality"]');for(var i=0;i<b.length;i++)b[i].setAttribute('aria-pressed',b[i].getAttribute('data-arg')===q?'true':'false');}
function toggleFullscreen(){
  var d=document,el=d.documentElement;
  if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen).call(d);return;}
  var req=el.requestFullscreen||el.webkitRequestFullscreen;if(!req)return;
  var pr=req.call(el);
  var lock=function(){try{if(screen.orientation&&screen.orientation.lock)screen.orientation.lock('landscape').catch(function(){});}catch(e){}};
  if(pr&&pr.then)pr.then(lock,function(){});else lock();
}

// ---------- upgrade picker / game over ----------
function showUpgradeScreen(){
  state='upgrade';paused=true;releaseInputs();
  var opts=getUpgradePool();
  var head=lastUpgradeReason==='round'?'Round complete':'Boss defeated';
  var h='<div class="screen"><h2 style="color:var(--amber)">'+head+'</h2><p class="sub">Choose one upgrade for the rest of the run.</p><div class="upg-row">';
  opts.forEach(function(u,i){
    h+='<button class="upg" type="button" data-act="upgrade" data-arg="'+u.id+'" style="--c:'+u.color+';animation-delay:'+(i*0.08)+'s"><span class="u-icon">'+u.icon+'</span><span class="u-label">'+u.label+'</span><span class="u-desc">'+u.desc+'</span></button>';
  });
  showOverlay(h+'</div></div>','over-game');
  overlayGuardUntil=Date.now()+450; // swallow taps meant for the fire stick
}
function applyUpgrade(id){
  applyUpgradeEffect(id);
  [523,659,784,1047].forEach(function(f,i){sfxTone(f,'sine',0.12,0.16,null,i*0.07);});
  state='playing';paused=false;hideOverlay();
}
function gameOver(){
  sfxGameOver();state='dead';releaseInputs();
  var r=recordRun(selMode,selChar,score,wave);
  showOverlay('<div class="screen"><h2 class="title-over">Game over</h2><div class="big-score">'+fmt(score)+'</div>'+
    '<p class="res-line">Reached wave '+wave+' as '+CLASS_INFO[selChar].name+' in '+MODE_INFO[selMode].name+' mode</p>'+
    (r.isNew?'<span class="badge">New best</span>':'<p class="res-line" style="color:var(--amber)">Best for this setup: '+fmt(r.best.score)+' (wave '+r.best.wave+')</p>')+
    '<div class="actions"><button class="btn primary" data-act="start">Retry</button><button class="btn ghost" data-act="chars">Change class</button><button class="btn ghost" data-act="menu">Main menu</button></div></div>','over-game');
  overlayGuardUntil=Date.now()+600;
}

// ---------- in-game announcements ----------
var announceQueue=[],announceBusy=false;
function announce(txt,col,big){
  // Wave banners merge: if one is already waiting, it just takes the newest wave number
  if(txt.indexOf('WAVE')===0){for(var i=announceQueue.length-1;i>=0;i--)if(announceQueue[i].txt.indexOf('WAVE')===0){announceQueue[i].txt=txt;return;}}
  announceQueue.push({txt:txt,col:col,big:!!big});processAnnounceQueue();
}
function processAnnounceQueue(){
  if(announceBusy||announceQueue.length===0)return;
  announceBusy=true;
  var a=announceQueue.shift();
  if(a.txt.indexOf('WAVE')===0)sfxWaveUp();else if(a.txt.indexOf('BOSS')!==-1||a.txt.indexOf('MINI')!==-1)sfxBossAlert();
  var el=document.createElement('div');
  el.className='announce'+(a.big?' big':'');
  var sp=document.createElement('span');sp.textContent=a.txt;sp.style.cssText='font-size:'+(a.big?36:22)+'px;color:'+a.col+';text-shadow:0 0 18px '+a.col;
  el.appendChild(sp);C.parentNode.appendChild(el);
  setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);announceBusy=false;processAnnounceQueue();},2000);
}

// ---------- layout: fit the 760x580 game box into the free space ----------
function fitGame(){
  var stage=document.getElementById('stage'),wrap=document.getElementById('game-scale-wrap');
  var portrait=window.innerHeight>window.innerWidth;
  document.body.classList.toggle('portrait',portrait);document.body.classList.toggle('landscape',!portrait);
  var sw=stage.clientWidth,sh=stage.clientHeight;if(!sw||!sh)return;
  var pad=isTouchDevice?0:8;
  var s=Math.min((sw-pad*2)/W,(sh-pad*2)/H,isTouchDevice?2:1.6);s=Math.max(.2,s);
  wrap.style.setProperty('--s',s.toFixed(4));
  document.documentElement.style.setProperty('--gw',Math.round(W*s+4)+'px');
  // render the canvas at the real on-screen density so it stays sharp when scaled
  var dpr=window.devicePixelRatio||1,k=Math.max(1,Math.min(isTouchDevice?1.5:2,s*dpr));k=Math.round(k*4)/4;
  if(Math.abs(k-RK)>0.01||C.width!==Math.round(W*k)){C.width=Math.round(W*k);C.height=Math.round(H*k);RK=C.width/W;}
}
