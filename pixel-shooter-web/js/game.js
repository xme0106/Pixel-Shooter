
var C=document.getElementById('canvas'),ctx=C.getContext('2d');
var W=760,H=580,RK=1; // RK: render scale (canvas pixels per logical pixel), set by the UI layer
var gameTime=0,gameTick=0,glowScale=1,floaters=[],pendingUpgradeT=0,ownedUpgrades={}; // gameTime: ms of simulated play (fixed 60Hz steps)
var WORLD_W=1800,WORLD_H=1400; // finite play field used by the DRIFT stage — big enough to feel open, small enough to hit the border
var camX=0,camY=0,curBW=W,curBH=H; // camX/camY: camera top-left in world coords. curBW/curBH: current stage's movement bounds
var obstacles=[]; // ARENA stage obstacles: {x,y,w,h}
var mouseScreen={x:W/2,y:H/2}; // raw screen-space cursor, synced into world-space `mouse` every frame

var CHARS={
  tank:{name:'TANK',color:'#0cf',stats:'5 LIVES  -  SPLASH BULLETS: SLOW+PUSH (1.5x DMG, SLOWER FIRE)\nRMB: PUSH+STUN WAVE + SHIELD +1 (max 4)  2s CD',lives:5,speed:2.5,fireCd:450,dmgBase:1.5,size:13,regen:false,abType:'pushwave',abCdMax:120},
  scout:{name:'SCOUT',color:'#0f9',stats:'3 LIVES  -  VERY FAST FIRE RATE\nRMB: DAMAGING DASH  -  1s CD',lives:3,speed:4.9,fireCd:47,size:10,regen:false,abType:'dash',abCdMax:60},
  gunner:{name:'GUNNER',color:'#f90',stats:'3 LIVES  -  TWIN STRAIGHT SHOT\nRMB: RAPID FIRE, AUTO-TARGETS NEARBY ENEMIES  5s ACTIVE\n3s COOLDOWN AFTER',lives:3,speed:3.0,fireCd:220,size:12,regen:false,abType:'rapidfire',abCdMax:180,abDur:300},
  warrior:{name:'WARRIOR',color:'#ff0',stats:'6 LIVES  -  MELEE SWORD (1.5/3 DMG)\nEVERY 3RD SWING: 360+KNOCKBACK\n+1 HP EVERY 5 KILLS\nRMB: WHIRLWIND (4 DMG)+SPEED+INVINCIBLE 1.5s  3s CD\nEVERY 3RD SWING FIRES A BIG CRESCENT (STUN)',lives:6,speed:3.8,fireCd:420,size:12,regen:false,abType:'spin',abCdMax:60,abDur:180},
  laser:{name:'LASER',color:'#f0f',stats:'3 LIVES  -  CONTINUOUS LASER\n0.3 DAMAGE PER TICK (6/sec)\nRMB: OBLITERATE 4x 10 DMG, BIGGER BEAM  5s CD',lives:3,speed:3.2,fireCd:1,beamSize:6,size:11,regen:false,abType:'obliterate',abCdMax:300,abDur:216},
  turret:{name:'TURRET',color:'#0ff',stats:'4 LIVES  -  SINGLE SHOT\nRMB: PLACE THEN MOBILIZE, 2 OF EACH TYPE\nDODGE: TURRETS SHOCKWAVE (no move-dash)',lives:4,speed:3.0,fireCd:180,size:12,regen:false,abType:'plant',abCdMax:180}
};
var ETYPES=[
  {color:'#f05',shape:'tri',hp:1,spd:1.4,sz:13,pts:10,type:'n'},
  {color:'#f90',shape:'diamond',hp:2,spd:1.0,sz:15,pts:20,type:'n'},
  {color:'#a0f',shape:'square',hp:3,spd:0.7,sz:17,pts:30,type:'n'},
  {color:'#0f9',shape:'cross',hp:1,spd:2.2,sz:10,pts:15,type:'n'},
  {color:'#f60',shape:'spike',hp:2,spd:1.7,sz:13,pts:25,type:'exploder'},
  {color:'#ff6',shape:'circle',hp:2,spd:0.85,sz:15,pts:35,type:'glower'},
  {color:'#08f',shape:'sniper',hp:2,spd:1.1,sz:12,pts:40,type:'sniper'},
  {color:'#f0a',shape:'hexagon',hp:3,spd:0.8,sz:14,pts:50,type:'laser'},
  {color:'#600',shape:'square',hp:10,spd:0.25,sz:22,pts:100,type:'n'}
];
var MINI_V=[
  {v:'dasher',color:'#f90',hp:28,spd:1.9,sz:28,pts:250,shape:'square'},
  {v:'charger',color:'#ff0',hp:24,spd:1.5,sz:25,pts:230,shape:'diamond'},
  {v:'shielder',color:'#d0f',hp:36,spd:1.1,sz:30,pts:280,shape:'square'},
  {v:'laser',color:'#f0f',hp:30,spd:1.2,sz:26,pts:300,shape:'hexagon'}
];
var BOSS_V=[
  {v:'destroyer',color:'#f05',hp:65,spd:1.2,sz:42,pts:700,shape:'square'},
  {v:'summoner',color:'#a0f',hp:50,spd:1.0,sz:38,pts:750,shape:'square'},
  {v:'sniper',color:'#0ff',hp:55,spd:1.5,sz:36,pts:720,shape:'square'},
  {v:'obliterator',color:'#f0f',hp:80,spd:1.2,sz:40,pts:800,shape:'hexagon'},
  {v:'fortress',color:'#888',hp:150,spd:0.5,sz:60,pts:1000,shape:'square'}
];
var bossVI=0;
// Boss Rush only: bosses shoot a little faster (x0.97 per 10 waves, never below half) and add one projectile per 15 waves
function bossWave(){return selMode==='bossrush'?wave:0;}
function bossCd(v){return Math.max(1,Math.round(v*Math.max(0.5,Math.pow(0.97,Math.floor(bossWave()/10)))));}
function bossExtraProj(){return Math.floor(bossWave()/15);}
function summonedAlive(){var n=0;for(var i=0;i<enemies.length;i++)if(enemies[i].summoned&&enemies[i].hp>0)n++;return n;}
function homingAlive(){var n=0;for(var i=0;i<ebullets.length;i++)if(ebullets[i].homing)n++;return n;}
// Display names only. The mini boss that winds up and lunges is now called CHARGER, and the one that bounces off walls is DASHER.
// Internal ids ('dasher' / 'charger') are unchanged so the AI code keeps working.
var VARIANT_LABEL={dasher:'charger',charger:'dasher'};
function variantLabel(v,fallback){return (VARIANT_LABEL[v]||v||fallback).toUpperCase();}
var state='menu',selChar='tank',selStage='basic',selMode='normal';
var bossRushSpawnTimer=0,bossRushSpawnRate=420;
var bigRushTimer=0,bigRushRate=520;
var powerupSpawnTimer=0,powerupSpawnRate=420;
// ===== BALANCE TUNABLES =====
var BAL={
  blitzGrow:0.04,blitzFrom:40,        // Blitz: enemy HP x(1+grow) per wave beyond blitzFrom, on top of the linear growth
  rushGrow:0.05,rushFrom:20,          // Boss Rush: same idea, starts earlier because its waves take longer
  overflowDmg:0.10,                   // each pick past an upgrade's stack limit converts to this much extra base damage
  swordMax:10,                        // sword drops stop giving damage after this many pickups
  rushBossLimit:3,rushMiniLimit:8,    // Boss Rush: no new mini boss while this many (+1 per 10 waves) are alive
                     // Boss Rush: no new big boss while this many (+1 per 20 waves) are alive
  eliteFrom:20,eliteBase:0.10,eliteStep:0.005,eliteMax:0.6,
  extraSpawnFrom:30,extraSpawnEvery:25,
  bulletSafety:400,ebulletSafety:500,enemySafety:160
};
function diffHpMult(){
  if(selMode==='blitz')return(1+wave*0.11)*(wave>BAL.blitzFrom?Math.pow(1+BAL.blitzGrow,wave-BAL.blitzFrom):1);
  if(selMode==='bossrush')return(1+wave*0.15)*(wave>BAL.rushFrom?Math.pow(1+BAL.rushGrow,wave-BAL.rushFrom):1);
  return 1;
}
function blitzGoal(w){return Math.floor(4+0.35*w);}   // kills needed to finish wave w in Blitz: no cap
function recalcDmg(){player.dmgMult=player.dmgBaseStat*(1+player.dmgBonus);}  // damage is additive: base x (1 + sum of bonuses)
function diffSpdMult(){if(selMode==='blitz')return Math.min(1.55,1+wave*0.016);if(selMode==='bossrush')return Math.min(1.65,1+wave*0.02);return 1;}
var score,wave,lives,maxLives,spawnTimer,spawnRate,waveKills,waveGoal,bossSpawned;
var player,bullets,ebullets,enemies,particles,shockwaves,drops,turrets,crescents;
var keys={},mouse={x:W/2,y:H/2},lastShot=0,mouseHeld=false,mouseMoved=false;
var joyMove={active:false,x:0,y:0},touchAim={active:false,angle:0};
var isTouchDevice=(('ontouchstart' in window)||navigator.maxTouchPoints>0)&&(!window.matchMedia||matchMedia('(pointer: coarse)').matches); // laptops with a touchscreen + mouse count as desktop
var abCd=0,abActive=false,abTimer=0,abAutoT=0,regenTimer=0,shieldHp=0,bootsTimer=0;
var paused=false;
var playerUpgrades={extraProj:0,permShield:0,oblBeams:0,turretBoost:0};

function init(){
  var ch=CHARS[selChar];
  score=0;wave=1;lives=ch.lives;maxLives=ch.lives;
  spawnTimer=0;spawnRate=110;bossRushSpawnTimer=0;bossRushSpawnRate=420;powerupSpawnTimer=0;powerupSpawnRate=420;bigRushTimer=0;bigRushRate=520;
  waveKills=0;waveGoal=selMode==='blitz'?blitzGoal(1):(selMode==='bossrush'?1:8);bossSpawned=false;
  bullets=[];ebullets=[];enemies=[];particles=[];shockwaves=[];drops=[];turrets=[];crescents=[];floaters=[];pendingUpgradeT=0;ownedUpgrades={};touchAim.active=false;joyMove.active=false;
  abCd=0;abActive=false;abTimer=0;abAutoT=0;regenTimer=0;lastShot=0;shieldHp=0;bootsTimer=0;
  playerUpgrades={extraProj:0,permShield:0,oblBeams:0,turretBoost:0};
  var startX=selStage==='drift'?WORLD_W/2:W/2, startY=selStage==='drift'?WORLD_H/2:H/2;
  player={x:startX,y:startY,size:ch.size,baseSpeed:ch.speed,speed:ch.speed,angle:0,invincible:0,
    color:ch.color,regen:ch.regen,fireCd:ch.fireCd,abType:ch.abType,abCdMax:ch.abCdMax,abDur:ch.abDur||0,
    dashing:false,dashTimer:0,dashDx:0,dashDy:0,dashTrail:[],comboCount:0,comboResetT:0,sf:null,laserActive:false,beamVisible:0,laserTickTimer:0,dmgMult:ch.dmgBase||1,beamSize:ch.beamSize||6,killCounter:0,turretType:0,
    dodgeCd:0,turretPendingMobile:false,turretLastPlaced:null,
    dmgBaseStat:ch.dmgBase||1,dmgBonus:0,speedStat:ch.speed,fireCdBase:ch.fireCd,abCdBase:ch.abCdMax,abDurBase:ch.abDur||0,swordPickups:0};
  camX=selStage==='drift'?startX-W/2:0;camY=selStage==='drift'?startY-H/2:0;
  buildObstacles();
  hudAll();
}
function buildObstacles(){
  obstacles=[];
  if(selStage==='arena')genRandomObstacles(7,10,0,0,W,H,{x:W/2,y:H/2},95);
  else if(selStage==='drift')genRandomObstacles(16,24,0,0,WORLD_W,WORLD_H,{x:WORLD_W/2,y:WORLD_H/2},220);
}
function genRandomObstacles(minN,maxN,x0,y0,x1,y1,avoidPt,avoidR){
  var n=minN+Math.floor(Math.random()*(maxN-minN+1)),tries=0;
  while(obstacles.length<n&&tries<n*25){
    tries++;
    var w=40+Math.random()*90,h=40+Math.random()*90;
    var x=x0+24+Math.random()*Math.max(10,(x1-x0-48-w)),y=y0+24+Math.random()*Math.max(10,(y1-y0-48-h));
    var cx=x+w/2,cy=y+h/2;
    if(dst(cx,cy,avoidPt.x,avoidPt.y)<avoidR)continue;
    var overlaps=false;
    for(var i=0;i<obstacles.length;i++){
      var o=obstacles[i];
      if(x<o.x+o.w+30&&x+w+30>o.x&&y<o.y+o.h+30&&y+h+30>o.y){overlaps=true;break;}
    }
    if(overlaps)continue;
    obstacles.push({x:x,y:y,w:w,h:h});
  }
}
function gl(c,r){if(glowScale<=0){ctx.shadowBlur=0;return;}ctx.shadowColor=c;ctx.shadowBlur=(r||12)*glowScale;}
function ng(){ctx.shadowBlur=0;}
function dst(ax,ay,bx,by){var dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy);}
function normA(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}
function resolveObstacles(ent){
  if(!obstacles.length)return;
  for(var i=0;i<obstacles.length;i++){
    var o=obstacles[i];
    var cx=Math.max(o.x,Math.min(ent.x,o.x+o.w)),cy=Math.max(o.y,Math.min(ent.y,o.y+o.h));
    var dx=ent.x-cx,dy=ent.y-cy,d=Math.sqrt(dx*dx+dy*dy);
    if(d<ent.size){
      if(d===0){dx=1;dy=0;d=1;}
      var push=ent.size-d;
      ent.x+=dx/d*push;ent.y+=dy/d*push;
    }
  }
}
function pointInObstacle(x,y){
  for(var i=0;i<obstacles.length;i++){var o=obstacles[i];if(x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h)return true;}
  return false;
}
function drawSwordBlade(ang,range,glowColor){
  // Draws a real tapered blade + crossguard, rotated to ang, from near the player out to range.
  ctx.save();ctx.rotate(ang);
  var hiltX=12,tipX=range,w1=6.5,w2=3;
  // crossguard
  gl('#fff',10);ctx.fillStyle='rgba(255,255,255,0.95)';
  ctx.fillRect(hiltX-2,-9,4,18);
  // grip
  ctx.fillStyle='rgba(180,180,180,0.9)';ctx.fillRect(hiltX-9,-2.5,7,5);
  // blade
  gl(glowColor,22);
  var grad=ctx.createLinearGradient(hiltX,0,tipX,0);
  grad.addColorStop(0,'rgba(255,255,255,0.95)');
  grad.addColorStop(0.3,glowColor);
  grad.addColorStop(1,'rgba(255,255,255,0.92)');
  ctx.fillStyle=grad;
  ctx.beginPath();
  ctx.moveTo(hiltX,-w1);
  ctx.lineTo(tipX*0.72,-w2);
  ctx.lineTo(tipX,0);
  ctx.lineTo(tipX*0.72,w2);
  ctx.lineTo(hiltX,w1);
  ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.6)';ctx.lineWidth=1;ctx.stroke();
  // center fuller line for a "real blade" look
  ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(hiltX+3,0);ctx.lineTo(tipX-4,0);ctx.stroke();
  ng();
  ctx.restore();
}
function pLineDst(px,py,ax,ay,bx,by){var dx=bx-ax,dy=by-ay,l2=dx*dx+dy*dy;if(l2===0)return dst(px,py,ax,ay);var t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/l2));return dst(px,py,ax+t*dx,ay+t*dy);}
function laserEP(x,y,dir){var bx0=selStage==='drift'?camX-20:-20,bx1=selStage==='drift'?camX+W+20:W+20,by0=selStage==='drift'?camY-20:-20,by1=selStage==='drift'?camY+H+20:H+20;var dx=Math.cos(dir),dy=Math.sin(dir),t=9999;if(dx>0)t=Math.min(t,(bx1-x)/dx);else if(dx<0)t=Math.min(t,(bx0-x)/dx);if(dy>0)t=Math.min(t,(by1-y)/dy);else if(dy<0)t=Math.min(t,(by0-y)/dy);if(obstacles.length){var step=8,dist=0;while(dist<t){dist+=step;if(pointInObstacle(x+dx*dist,y+dy*dist)){t=dist;break;}}}return{x:x+dx*t,y:y+dy*t};}

function drawGrid(){
  ctx.strokeStyle='rgba(0,255,255,0.05)';ctx.lineWidth=1;
  var x0=Math.floor((camX-40)/40)*40,x1=camX+W+40;
  var y0=Math.floor((camY-40)/40)*40,y1=camY+H+40;
  for(var x=x0;x<x1;x+=40){ctx.beginPath();ctx.moveTo(x,y0);ctx.lineTo(x,y1);ctx.stroke();}
  for(var y=y0;y<y1;y+=40){ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();}
}
function drawWorldBorder(){
  if(selStage!=='drift')return;
  gl('#f05',22);ctx.strokeStyle='rgba(255,0,80,0.7)';ctx.lineWidth=8;
  ctx.strokeRect(0,0,WORLD_W,WORLD_H);
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=2;
  ctx.strokeRect(4,4,WORLD_W-8,WORLD_H-8);
  ng();
}

function drawPlayer(){
  var p=player;if(p.invincible>0&&!(selChar==='warrior'&&abActive)&&Math.floor(Date.now()/80)%2===0)return;
  for(var t=0;p.dashTrail&&t<p.dashTrail.length;t++){ctx.globalAlpha=p.dashTrail[t].a;ctx.fillStyle=p.color;ctx.fillRect(p.dashTrail[t].x-p.size,p.dashTrail[t].y-p.size,p.size*2,p.size*2);ctx.globalAlpha=1;}
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  var s=p.size,col=p.color;
  if(shieldHp>0){var sa=Date.now()*.002;for(var si=0;si<shieldHp;si++){var sa2=sa+(Math.PI*2/shieldHp)*si;gl('#4af',14);ctx.fillStyle='#4af';ctx.beginPath();ctx.arc(Math.cos(sa2)*(s+9),Math.sin(sa2)*(s+9),4,0,Math.PI*2);ctx.fill();}ng();}
  gl(col,abActive&&selChar==='warrior'?32:22);ctx.fillStyle=col;ctx.fillRect(-s,-s,s*2,s*2);ng();
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.strokeRect(-s,-s,s*2,s*2);
  ctx.fillStyle='#000';ctx.fillRect(-s*.55,-s*.3,s*.38,s*.38);ctx.fillRect(s*.17,-s*.3,s*.38,s*.38);
  ctx.fillStyle=col;ctx.fillRect(-s*.45,-s*.2,s*.18,s*.18);ctx.fillRect(s*.27,-s*.2,s*.18,s*.18);
  ctx.fillStyle='#000';ctx.fillRect(-s*.5,s*.22,s,s*.22);ctx.fillStyle=col;ctx.fillRect(-s*.3,s*.26,s*.18,s*.1);ctx.fillRect(s*.12,s*.26,s*.18,s*.1);
  gl(col,10);ctx.fillStyle=col;
  if(selChar==='warrior'){
    // small sword icon on the back: blade + crossguard, not a plain bar
    ctx.fillStyle='#fff';ctx.fillRect(-6,-s-6,12,3); // crossguard
    ctx.fillStyle=col;
    ctx.beginPath();ctx.moveTo(-3,-s-6);ctx.lineTo(3,-s-6);ctx.lineTo(2,-s-18);ctx.lineTo(0,-s-21);ctx.lineTo(-2,-s-18);ctx.closePath();ctx.fill(); // tapered blade
    ctx.fillStyle='rgba(180,180,180,0.9)';ctx.fillRect(-2,-s-3,4,6); // grip
  }
  else ctx.fillRect(-3,-s-8,6,10);
  if(bootsTimer>0){ng();gl('#0f9',10);ctx.fillStyle='#0f9';ctx.fillRect(-s*.6,s*.7,s*.5,s*.35);ctx.fillRect(s*.1,s*.7,s*.5,s*.35);}
  ctx.restore();ng();
  if(selChar==='warrior'&&p.sf&&p.sf.active){
    var prog=1-(p.sf.timer/p.sf.maxTimer);
    var alpha=p.sf.timer>(p.sf.maxTimer*.35)?0.88:(p.sf.timer/p.sf.maxTimer)*2.5;
    ctx.save();ctx.translate(p.x,p.y);
    if(p.sf.type==='full'){
      // Spinning ring that sweeps around
      var rAngle=prog*Math.PI*2;
      ctx.globalAlpha=alpha;
      gl('#ff0',28);ctx.strokeStyle='rgba(255,220,0,0.95)';ctx.lineWidth=6;
      ctx.beginPath();ctx.arc(0,0,p.sf.range,rAngle-Math.PI*.75,rAngle+Math.PI*.15);ctx.stroke();
      ctx.strokeStyle='rgba(255,200,0,0.4)';ctx.lineWidth=10;
      ctx.beginPath();ctx.arc(0,0,p.sf.range,rAngle-Math.PI*1.4,rAngle-Math.PI*.65);ctx.stroke();
      // 3 spinning sword blades
      ctx.globalAlpha=alpha;
      for(var i=0;i<3;i++)drawSwordBlade(rAngle+i*(Math.PI*2/3),p.sf.range,'#ff0');
    }else{
      // Directional swing: arc sweeps from startAng to currentAng
      var curAng=p.sf.startAng+prog*(p.sf.endAng-p.sf.startAng);
      // Fill trail wedge (motion blur behind the blade)
      ctx.globalAlpha=alpha*.35;gl('#ff0',10);
      ctx.fillStyle='rgba(255,200,0,0.28)';
      ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,p.sf.range,p.sf.startAng,curAng,false);ctx.closePath();ctx.fill();
      // Full sword blade at current swing position
      ctx.globalAlpha=alpha;
      drawSwordBlade(curAng,p.sf.range,'#ff0');
    }
    ctx.globalAlpha=1;ctx.restore();ng();
  }
  if(selChar==='warrior'&&abActive){
    // Whirlwind: two blades orbit at the real damage radius, each dragging a fading sweep behind it.
    // Angle comes from simulated time, so the spin is smooth at any frame rate and freezes while paused.
    var R=p._spinRange||82,spin=gameTime*0.0185,fade=Math.min(1,(p.abDur-abTimer)/24);
    ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=fade;
    for(var bi=0;bi<2;bi++){
      var ba=spin+bi*Math.PI;
      // sweep: 14 wedge slices behind the blade, each fainter than the last
      for(var k=0;k<14;k++){
        var a1=ba-k*0.115,a0=a1-0.115;
        ctx.fillStyle='rgba(255,'+(215-k*4)+',40,'+(0.34*(1-k/14)).toFixed(3)+')';
        ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,R*0.97,a0,a1);ctx.closePath();ctx.fill();
      }
      // bright leading edge of the sweep
      gl('#ff0',16);ctx.strokeStyle='rgba(255,245,160,0.8)';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(0,0,R*0.97,ba-0.5,ba);ctx.stroke();ng();
    }
    for(var bj=0;bj<2;bj++)drawSwordBlade(spin+bj*Math.PI,R,'#ff0');
    ctx.globalAlpha=1;ctx.restore();ng();
  }

}

function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(e.rot);var s=e.size;
  if(e.type==='glower'){ctx.globalAlpha=0.06+0.04*Math.sin(Date.now()*.003);ctx.fillStyle=e.color;ctx.beginPath();ctx.arc(0,0,e.aura||68,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
  var stV=e.stun>0,slV=e.slow>0&&!stV;
  if(stV)ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()*.02);
  var fcol=stV?'#aaa':slV?'#88aaff':e.color,gcol=stV?'#fff':slV?'#48f':e.color;
  gl(gcol,e.type==='boss'?32:e.type==='miniboss'?24:14);ctx.fillStyle=fcol;ctx.strokeStyle='#fff';ctx.lineWidth=e.type==='boss'?2.5:e.type==='miniboss'?2:1;
  ctx.beginPath();var sh=e.shape;
  if(sh==='tri'){ctx.moveTo(0,-s);ctx.lineTo(s*.87,s*.5);ctx.lineTo(-s*.87,s*.5);}
  else if(sh==='diamond'){ctx.moveTo(0,-s);ctx.lineTo(s,0);ctx.lineTo(0,s);ctx.lineTo(-s,0);}
  else if(sh==='square'){ctx.rect(-s,-s,s*2,s*2);}
  else if(sh==='cross'){ctx.rect(-s*.38,-s,s*.76,s*2);ctx.rect(-s,-s*.38,s*2,s*.76);}
  else if(sh==='spike'){for(var i=0;i<10;i++){var a=(Math.PI*2/10)*i,r=i%2===0?s:s*.4;if(i===0)ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);else ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}}
  else if(sh==='circle'||sh==='sniper'){ctx.arc(0,0,s,0,Math.PI*2);}
  else if(sh==='hexagon'){for(var i=0;i<6;i++){var a=i*Math.PI/3;if(i===0)ctx.moveTo(Math.cos(a)*s,Math.sin(a)*s);else ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s);}}
  ctx.closePath();ctx.fill();ctx.stroke();
  if(e.elite){ctx.strokeStyle='#ffd23f';ctx.lineWidth=3;ctx.stroke();}
  if(sh==='sniper'){ng();ctx.strokeStyle='rgba(255,255,255,0.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-s,0);ctx.lineTo(s,0);ctx.stroke();ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(0,s);ctx.stroke();}
  if(e.maxHp>1){ng();var bw=Math.max(34,s*2.4),bc=e.type==='boss'?'#f05':e.type==='miniboss'?'#f90':e.color;ctx.fillStyle='#222';ctx.fillRect(-bw/2,s+5,bw,5);ctx.fillStyle=bc;ctx.fillRect(-bw/2,s+5,bw*(e.hp/e.maxHp),5);}
  if(stV){ng();for(var i=0;i<3;i++){var sa=Date.now()*.004+i*(Math.PI*2/3);ctx.fillStyle='#ff0';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('*',Math.cos(sa)*(s+10),-s-8+Math.sin(sa)*3);}}
  if(e.variant==='shielder'){ng();gl('#d0f',14);ctx.strokeStyle='#d0f';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,s+12,e.shieldAngle-Math.PI*.55,e.shieldAngle+Math.PI*.55);ctx.stroke();}
  if(e.type==='boss'){ng();ctx.fillStyle=e.color;ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(variantLabel(e.variant,'boss'),0,-s-16);if(e.phase===2)ctx.fillText('PHASE 2',0,-s-26);}
  if(e.type==='miniboss'){ng();ctx.fillStyle=e.color;ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText(variantLabel(e.variant,'mini'),0,-s-14);}
  // Dasher windup ring
  if(e.variant==='dasher'&&e.windingUp){var wp=e.windupT/e.windupMax;gl('#f90',20+(wp*14));ctx.strokeStyle='rgba(255,160,0,'+(.4+wp*.55)+')';ctx.lineWidth=3+wp*3;ctx.beginPath();ctx.arc(0,0,s+8+wp*10,0,Math.PI*2*wp);ctx.stroke();}
  ctx.globalAlpha=1;ctx.restore();ng();
}

function drawTurret(t){
  ctx.save();ctx.translate(t.x,t.y);var s=t.size;
  var fcol='#0ff',gcol='#0ff';
  gl(gcol,14);ctx.fillStyle=fcol;ctx.strokeStyle='#fff';ctx.lineWidth=1;
  ctx.beginPath();var sh=t.type==='projectile'?'square':t.type==='laser'?'hexagon':'circle';
  if(sh==='square'){ctx.rect(-s,-s,s*2,s*2);}
  else if(sh==='hexagon'){for(var i=0;i<6;i++){var a=i*Math.PI/3;if(i===0)ctx.moveTo(Math.cos(a)*s,Math.sin(a)*s);else ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s);}}
  else if(sh==='circle'){ctx.arc(0,0,s,0,Math.PI*2);}
  ctx.closePath();ctx.fill();ctx.stroke();
  if(t.maxHp>1){ng();var bw=34,bc='#0ff';ctx.fillStyle='#222';ctx.fillRect(-bw/2,s+5,bw,5);ctx.fillStyle=bc;ctx.fillRect(-bw/2,s+5,bw*(t.hp/t.maxHp),5);}
  ctx.restore();ng();
}

function drawLaserBeams(){
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];if(!e.laserState)continue;
    var lcol=e.color||'#f0a';
    // Determine all laser lines to draw (obliterator has 3)
    var lines=[];
    if(e.laserEndX!==undefined)lines.push({ex:e.laserEndX,ey:e.laserEndY});
    if(e.laserEndX2!==undefined)lines.push({ex:e.laserEndX2,ey:e.laserEndY2});
    if(e.laserEndX3!==undefined)lines.push({ex:e.laserEndX3,ey:e.laserEndY3});
    for(var li=0;li<lines.length;li++){
      var lx=lines[li].ex,ly=lines[li].ey;
      if(e.laserState==='charge'){
        ctx.save();ctx.globalAlpha=0.15+0.5*(e.laserT/e.laserChargeMax);gl(lcol,10);ctx.strokeStyle=lcol;ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(lx,ly);ctx.stroke();ctx.setLineDash([]);ctx.restore();ng();
      }else if(e.laserState==='pause'||e.laserState==='fire'){
        ctx.save();gl(lcol,35);ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(lx,ly);ctx.stroke();gl(lcol,20);ctx.strokeStyle=lcol;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(lx,ly);ctx.stroke();ctx.restore();ng();
      }
    }
  }
  for(var i=0;i<turrets.length;i++){
    var t=turrets[i];if(t.type!=='laser')continue;
    if(t.laserState==='charge'&&t.laserEndX!==undefined){
      ctx.save();ctx.globalAlpha=0.15+0.5*(t.laserT/t.laserChargeMax);gl('#f0a',10);ctx.strokeStyle='#f0a';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.laserEndX,t.laserEndY);ctx.stroke();ctx.setLineDash([]);ctx.restore();ng();
    }else if((t.laserState==='pause'||t.laserState==='fire')&&t.laserEndX!==undefined){
      ctx.save();gl('#f0a',35);ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.laserEndX,t.laserEndY);ctx.stroke();gl('#f0a',20);ctx.strokeStyle='#f0a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.laserEndX,t.laserEndY);ctx.stroke();ctx.restore();ng();
    }
  }
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];if(e.type!=='sniper'||e.sniperState!=='aim')continue;
    ctx.save();ctx.globalAlpha=(0.1+0.25*(e.sniperT/e.aimMax))*(Math.floor(Date.now()/120)%2===0?1:0.4);gl('#08f',8);ctx.strokeStyle='#08f';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(e.x,e.y);ctx.lineTo(player.x,player.y);ctx.stroke();ctx.setLineDash([]);ctx.restore();ng();
  }
}

function drawBullet(b){var col=b.splash?'#4df':'#ff0';ctx.fillStyle=col;var sz=b.big?18:(b.splash?10:6),hs=sz/2;ctx.fillRect(b.x-hs,b.y-hs,sz,sz);ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillRect(b.x-hs*.4,b.y-hs*.4,sz*.4,sz*.4);}
function drawCrescent(c){
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.ang);
  var sc=c.big?1.65:1;
  gl('#ff0',c.big?30:20);ctx.fillStyle='rgba(255,220,0,0.85)';
  ctx.beginPath();ctx.arc(0,0,22*sc,-0.95,0.95);ctx.arc(11*sc,0,15*sc,0.95,-0.95,true);ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=1.5;ctx.stroke();
  ng();ctx.restore();
}
function drawEBullet(b){
  if(b.homing){ctx.fillStyle='#f0a';ctx.beginPath();ctx.arc(b.x,b.y,6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(240,0,170,0.6)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*5,b.y-b.vy*5);ctx.stroke();return;}
  ctx.fillStyle=b.c||'#f05';ctx.beginPath();ctx.arc(b.x,b.y,5,0,Math.PI*2);ctx.fill();
}
function drawParticle(p){ctx.globalAlpha=p.life/p.maxLife;ctx.fillStyle=p.color;ctx.fillRect(p.x-p.s/2,p.y-p.s/2,p.s,p.s);ctx.globalAlpha=1;}
function drawShockwave(sw){ctx.globalAlpha=(sw.life/sw.maxLife)*.7;ctx.strokeStyle=sw.color;ctx.lineWidth=sw.thick||3;gl(sw.color,22);ctx.beginPath();ctx.arc(sw.x,sw.y,sw.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ng();}
function drawDrop(d){
  var bob=Math.sin(d.bob+Date.now()*.004)*3,fa=Math.min(1,(d.life/d.maxLife)*3);ctx.globalAlpha=fa;ctx.save();ctx.translate(d.x,d.y+bob);
  ctx.font='bold 16px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  if(d.type==='heart'){gl('#f05',18);ctx.fillStyle='#f05';ctx.fillText('♥',0,0);}
  else if(d.type==='boots'){ng();gl('#0f9',16);ctx.fillStyle='#0f9';ctx.fillRect(-7,-4,14,6);ctx.fillRect(-7,2,9,4);}
  else if(d.type==='shield'){gl('#4af',16);ctx.fillStyle='#4af';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(8,-5);ctx.lineTo(8,2);ctx.lineTo(0,9);ctx.lineTo(-8,2);ctx.lineTo(-8,-5);ctx.closePath();ctx.fill();ctx.stroke();}
  else if(d.type==='sword'){gl('#c60',18);ctx.fillStyle='#c60';ctx.fillText('⚔',0,0);}
  else{gl('#ff0',22);ctx.fillStyle='#ff0';ctx.fillText('★',0,0);}
  ctx.restore();ctx.globalAlpha=1;ng();
}

function burst(x,y,col,n,glow){if(particles.length>380)return;for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,sp=1.5+Math.random()*3;particles.push({x:x,y:y,color:col,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,s:3+Math.random()*5,life:1,maxLife:1,glow:glow?16:0});}}
function addSW(x,y,maxR,col,gr,thick){shockwaves.push({x:x,y:y,r:10,gr:gr||8,maxR:maxR,life:1,maxLife:1,color:col,thick:thick||3});}
function doSplash(bx,by,big){var R=big?90:52,dmg=big?4:1,kf=big?12:8;addSW(bx,by,R,'#4df',big?12:8,big?3:2);burst(bx,by,'#4df',big?16:8,true);for(var i=0;i<enemies.length;i++){var e=enemies[i],d=dst(bx,by,e.x,e.y);if(d<R){var a=Math.atan2(e.y-by,e.x-bx),f=(1-(d/R))*kf;e.hp-=dmg*player.dmgMult;if(big)e.stun=Math.max(e.stun||0,60);else e.slow=Math.max(e.slow||0,100);e.vx+=Math.cos(a)*f;e.vy+=Math.sin(a)*f;burst(e.x,e.y,'#4df',4);}}}
function doExplosion(ex,ey){sfxExplosion();var R=60;addSW(ex,ey,R,'#f60',7,2);burst(ex,ey,'#f60',22,true);burst(ex,ey,'#ff0',10,true);for(var i=0;i<enemies.length;i++){var e=enemies[i];if(e._dying)continue;var d=dst(ex,ey,e.x,e.y);if(d<R&&d>1){e.hp-=2;burst(e.x,e.y,e.color,5);}}if(player.invincible<=0&&dst(player.x,player.y,ex,ey)<R-14)hitPlayer();}
function killEnemy(e,xl,st){
  e._dying=true;st.n++;score+=e.pts*wave;
  waveKills+=(selMode==='bossrush'&&e.type==='boss')?3:1;
  if(e.type==='boss'||e.type==='miniboss')sfxBossKill();else sfxKill();
  if(e.type==='boss')st.boss=true;
  if(selChar==='warrior'){player.killCounter++;if(player.killCounter>=5){player.killCounter=0;if(lives<maxLives){lives++;hudLives();floatTxt(player.x,player.y,'+1 HP','#f05');}}}
  burst(e.x,e.y,e.color,18,true);
  if(e.type==='miniboss')guaranteedDrops(e.x,e.y);else{tryDrop(e.x,e.y);if(e.elite)tryDrop(e.x,e.y);}
  if(e.type==='exploder')xl.push({x:e.x,y:e.y});
  else if(e.type==='boss'||e.type==='miniboss')addSW(e.x,e.y,200,e.color,6,3);
}
function cleanupDead(){
  var st={n:0,boss:false},passes=0,found;
  do{
    var xl=[];found=false;
    for(var i=0;i<enemies.length;i++){var e=enemies[i];if(e.hp<=0&&!e._dying){found=true;killEnemy(e,xl,st);}}
    for(var j=0;j<xl.length;j++)doExplosion(xl[j].x,xl[j].y);
    passes++;
  }while(found&&passes<4);
  for(var k=enemies.length-1;k>=0;k--)if(enemies[k].hp<=0)enemies.splice(k,1);
  if(st.n){hudScore();hudBar();}
  if(st.boss){
    if(playerUpgrades.permShield>0){shieldHp=Math.min(shieldHp+playerUpgrades.permShield,6);hudStatus();floatTxt(player.x,player.y-14,'+SHIELD','#4af');}
    if(selMode!=='bossrush'){lastUpgradeReason='boss';pendingUpgradeT=26;}
  }
}

function rndItem(){var r=Math.random();if(r<.2)return'heart';if(r<.35)return'boots';if(r<.5)return'shield';if(r<.65)return(player&&player.swordPickups>=BAL.swordMax)?'star':'sword';return'star';}
function tryDrop(x,y){if(Math.random()>0.24)return;drops.push({x:x,y:y,type:rndItem(),life:380,maxLife:380,bob:Math.random()*Math.PI*2,vx:(Math.random()-.5)*2.5,vy:(Math.random()-.5)*2.5});}
function guaranteedDrops(x,y){var n=1+Math.floor(Math.random()*2);for(var i=0;i<n;i++){drops.push({x:x+(Math.random()-.5)*24,y:y+(Math.random()-.5)*24,type:rndItem(),life:420,maxLife:420,bob:Math.random()*Math.PI*2,vx:(Math.random()-.5)*2.5,vy:(Math.random()-.5)*2.5});}}
function pickupDrop(d){
  sfxPickup(d.type);
  var p=player;
  if(d.type==='heart'){if(lives<maxLives){lives++;hudLives();floatTxt(d.x,d.y,'+1 HP','#f05');}else floatTxt(d.x,d.y,'FULL','#f05');}
  else if(d.type==='boots'){bootsTimer=600;player.speed=player.baseSpeed*1.7;hudStatus();floatTxt(d.x,d.y,'SPEED BOOST!','#0f9');}
  else if(d.type==='shield'){shieldHp=Math.min(shieldHp+2,4);hudStatus();floatTxt(d.x,d.y,'SHIELD+2','#4af');}
  else if(d.type==='sword'){if(p.swordPickups<BAL.swordMax){p.swordPickups++;p.dmgBonus+=0.02;recalcDmg();floatTxt(d.x,d.y,'⚔ ATTACK UP!','#c60');}else floatTxt(d.x,d.y,'⚔ MAX','#c60');}
  else{var R=145;addSW(p.x,p.y,R,'#ff0',12,4);burst(p.x,p.y,'#ff0',28,true);burst(p.x,p.y,'#fff',14,true);for(var i=0;i<enemies.length;i++){var e=enemies[i];var dd=dst(p.x,p.y,e.x,e.y);if(dd<R){e.hp-=3*player.dmgMult;var a=Math.atan2(e.y-p.y,e.x-p.x);e.vx+=Math.cos(a)*7;e.vy+=Math.sin(a)*7;burst(e.x,e.y,e.color,7,true);}}cleanupDead();floatTxt(d.x,d.y,'★ BOOM! ★','#ff0');}
  burst(d.x,d.y,d.type==='heart'?'#f05':d.type==='boots'?'#0f9':d.type==='star'?'#ff0':'#4af',10,true);
}
function floatTxt(x,y,txt,col){floaters.push({x:x,y:y-8,txt:txt,col:col,life:52,maxLife:52});if(floaters.length>30)floaters.shift();}
function drawFloaters(){
  if(!floaters.length)return;
  ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  for(var i=0;i<floaters.length;i++){var f=floaters[i];ctx.globalAlpha=Math.min(1,f.life/18);gl(f.col,8);ctx.fillStyle=f.col;ctx.fillText(f.txt,f.x,f.y);}
  ctx.globalAlpha=1;ng();
}

function edgePt(){
  var ox=selStage==='drift'?camX:0,oy=selStage==='drift'?camY:0,x=0,y=0;
  for(var tries=0;tries<12;tries++){
    var side=Math.floor(Math.random()*4);
    if(side===0){x=ox+Math.random()*W;y=oy-28;}else if(side===1){x=ox+W+28;y=oy+Math.random()*H;}else if(side===2){x=ox+Math.random()*W;y=oy+H+28;}else{x=ox-28;y=oy+Math.random()*H;}
    if(selStage!=='drift'||(x>=0&&x<=WORLD_W&&y>=0&&y<=WORLD_H))return{x:x,y:y};
  }
  return{x:Math.max(0,Math.min(WORLD_W,x)),y:Math.max(0,Math.min(WORLD_H,y))};
}
function spawnEnemy(){
  var pt=edgePt();var pool=ETYPES.filter(function(t){if(t.type==='sniper'&&wave<4)return false;if(t.type==='laser'&&wave<6)return false;if(t.hp===10&&wave<8)return false;return true;});var cnt=Math.min(pool.length,Math.floor(1+wave/2));var t=pool[Math.floor(Math.random()*cnt)];var eHp=Math.round((t.hp+Math.floor(wave*0.1))*diffHpMult());  var e={x:pt.x,y:pt.y,color:t.color,shape:t.shape,type:t.type,hp:eHp,maxHp:eHp,baseSpeed:t.spd*diffSpdMult(),size:t.sz,pts:t.pts,rot:0,rotSpeed:(Math.random()-.5)*.08,vx:0,vy:0,slow:0,stun:0,pulseT:0,aura:68};
  if(selMode==='blitz'&&wave>=BAL.eliteFrom&&Math.random()<Math.min(BAL.eliteMax,BAL.eliteBase+(wave-BAL.eliteFrom)*BAL.eliteStep)){e.elite=true;e.hp=e.maxHp=Math.round(e.hp*3);e.baseSpeed*=1.15;e.pts*=3;}
  if(t.type==='sniper'){e.sniperState='moving';e.moveT=0;e.sniperT=0;e.aimMax=55;e.coolMax=75;}
  if(t.type==='laser'){e.laserState='approach';e.laserT=0;e.laserChargeMax=85;e.laserFireMax=50;e.laserCoolMax=110;e.laserEndX=undefined;e.laserEndY=undefined;}
  enemies.push(e);
}
function spawnMini(){var cfg=MINI_V[Math.floor(Math.random()*MINI_V.length)],pt=edgePt(),hp=Math.round((cfg.hp+wave*2)*diffHpMult());enemies.push({x:pt.x,y:pt.y,color:cfg.color,shape:cfg.shape,type:'miniboss',variant:cfg.v,hp:hp,maxHp:hp,baseSpeed:cfg.spd*diffSpdMult(),size:cfg.sz,pts:cfg.pts,rot:0,rotSpeed:.022,vx:0,vy:0,slow:0,stun:0,dashT:0,dashCD:100,dashing:false,dvx:0,dvy:0,chargeVx:0,chargeVy:0,chargeT:0,chargeCD:75,chargingMode:false,shieldAngle:0,shootT:0,shootCD:140});if(enemies[enemies.length-1].variant==='laser'){enemies[enemies.length-1].laserState='approach';enemies[enemies.length-1].laserT=0;enemies[enemies.length-1].laserChargeMax=60;enemies[enemies.length-1].laserFireMax=80;enemies[enemies.length-1].laserCoolMax=90;enemies[enemies.length-1].laserEndX=undefined;enemies[enemies.length-1].laserEndY=undefined;}}
function spawnBoss(){var cfg=BOSS_V[bossVI%BOSS_V.length];bossVI++;var hp=Math.round((cfg.hp+wave*3)*diffHpMult());var bx=(selStage==='drift'?camX:0)+W/2,by=(selStage==='drift'?camY:0)-70;enemies.push({x:bx,y:by,color:cfg.color,shape:cfg.shape,type:'boss',variant:cfg.v,hp:hp,maxHp:hp,baseSpeed:cfg.spd*diffSpdMult(),size:cfg.sz,pts:cfg.pts,rot:0,rotSpeed:.016,vx:0,vy:0,slow:0,stun:0,shootT:0,shootCD:80,phase:1,summonT:0,summonCD:200,orbitT:0,snipeT:0,snipeCD:55});if(enemies[enemies.length-1].variant==='obliterator'){enemies[enemies.length-1].laserState='idle';enemies[enemies.length-1].laserT=0;enemies[enemies.length-1].laserChargeMax=30;enemies[enemies.length-1].laserFireMax=50;enemies[enemies.length-1].laserCoolMax=60;enemies[enemies.length-1].laserEndX=undefined;enemies[enemies.length-1].laserEndY=undefined;enemies[enemies.length-1].teleportT=0;}if(enemies[enemies.length-1].variant==='fortress'){enemies[enemies.length-1].phase=0;}}

function fireAt(ang,sp,ox,oy,big){
  if(bullets.length>BAL.bulletSafety)return;
  var spd=sp?7.5:10;
  var bx=ox!==undefined?ox:player.x,by=oy!==undefined?oy:player.y;
  bullets.push({x:bx,y:by,vx:Math.cos(ang)*spd,vy:Math.sin(ang)*spd,splash:!!sp,big:!!big});
  for(var xi=0;xi<(playerUpgrades.extraProj||0);xi++){
    var oa=(xi%2===0?1:-1)*(Math.PI/11*(Math.floor(xi/2)+1));
    bullets.push({x:bx,y:by,vx:Math.cos(ang+oa)*spd,vy:Math.sin(ang+oa)*spd,splash:!!sp});
  }
}
function shoot(){
  if(state!=='playing'||paused)return;var now=gameTime;if(now-lastShot<player.fireCd)return;lastShot=now;
  if(selChar==='warrior'){doSwing();return;}
  if(selChar==='laser'){player.laserActive=true;return;}
  sfxShoot();
  var ang=Math.atan2(mouse.y-player.y,mouse.x-player.x);
  if(selChar==='tank'){player.tankShotCount=(player.tankShotCount||0)+1;var tankBig=player.tankShotCount%5===0;fireAt(ang,true,undefined,undefined,tankBig);if(tankBig){floatTxt(player.x,player.y-18,'BIG SHOT','#0cf');}}
  else if(selChar==='scout'){player.scoutShotCount=(player.scoutShotCount||0)+1;fireAt(ang,false);if(player.scoutShotCount%3===0){var perpS=ang+Math.PI/2,offS=6;fireAt(ang,false,player.x+Math.cos(perpS)*offS,player.y+Math.sin(perpS)*offS);}}
  else if(selChar==='gunner'){var perpA=ang+Math.PI/2,off=7;fireAt(ang,false,player.x+Math.cos(perpA)*off,player.y+Math.sin(perpA)*off);fireAt(ang,false,player.x-Math.cos(perpA)*off,player.y-Math.sin(perpA)*off);}
  else if(selChar==='turret')fireAt(ang,false);
}
var swingSeq=0,dashSeq=0,crescentSeq=0,lastUpgradeReason='boss';
function inputDir(){var dx=0,dy=0;if(joyMove.active){dx=joyMove.x;dy=joyMove.y;}else{if(keys['w']||keys['arrowup'])dy-=1;if(keys['s']||keys['arrowdown'])dy+=1;if(keys['a']||keys['arrowleft'])dx-=1;if(keys['d']||keys['arrowright'])dx+=1;}return{dx:dx,dy:dy};}
function turretMul(){return 1+0.25*playerUpgrades.turretBoost;}
function turretMaxHp(){return Math.round(15*turretMul());}
var DODGE_CD_MAX=55;
var TURRET_SHOCK_CD=150;
function doDodge(){
  if(state!=='playing'||paused)return;var p=player;
  if(selChar==='turret'){
    if(p.dodgeCd>0)return;
    p.dodgeCd=TURRET_SHOCK_CD;hudCooldowns();
    for(var twi=0;twi<turrets.length;twi++){
      var tw=turrets[twi];
      addSW(tw.x,tw.y,120,'#0ff',10,4);burst(tw.x,tw.y,'#0ff',15,true);
      for(var twj=0;twj<enemies.length;twj++){
        var twe=enemies[twj],twd=dst(tw.x,tw.y,twe.x,twe.y);
        if(twd<120){var twa=Math.atan2(twe.y-tw.y,twe.x-tw.x);twe.vx+=Math.cos(twa)*15;twe.vy+=Math.sin(twa)*15;twe.stun=60;}
      }
    }
    sfxTone(300,'sine',0.15,0.15,180);
    return;
  }
  if(p.dodgeCd>0||p.dashing)return;
  p.dodgeCd=DODGE_CD_MAX;hudCooldowns();
  var dd=inputDir(),dx=dd.dx,dy=dd.dy;
  if(dx===0&&dy===0){var da=Math.atan2(mouse.y-p.y,mouse.x-p.x);dx=Math.cos(da);dy=Math.sin(da);}
  var len=Math.sqrt(dx*dx+dy*dy);
  p.dashDx=dx/len*12;p.dashDy=dy/len*12;p.dashing=true;p.dashTimer=0;p.dashTrail=[];p.dashDamaging=false;p.dashId=++dashSeq;
  sfxTone(600,'square',0.06,0.08,900);
}
function swingHitCheck(sf,angle,halfWidth){
  var p=player,any=false;
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];
    if(e._lastSwingId===sf.id)continue;
    var d=dst(p.x,p.y,e.x,e.y);
    if(d>sf.range+e.size)continue;
    if(Math.abs(normA(Math.atan2(e.y-p.y,e.x-p.x)-angle))>halfWidth)continue;
    e._lastSwingId=sf.id;e.hp-=sf.dmg;any=true;
    burst(e.x,e.y,'#ff0',sf.type==='full'?9:5,true);
    if(sf.knockback){var a=Math.atan2(e.y-p.y,e.x-p.x);e.vx+=Math.cos(a)*13;e.vy+=Math.sin(a)*13;}
  }
  if(any)cleanupDead();
}
function doSwing(){var p=player;p.comboCount=(p.comboCount||0)+1;p.comboResetT=130;var facing=Math.atan2(mouse.y-p.y,mouse.x-p.x),full=p.comboCount%3===0,range=full?80:90,arcW=full?Math.PI*2:Math.PI*(2/3);swingSeq++;p.sf={active:true,id:swingSeq,timer:22,maxTimer:22,type:full?'full':'arc',facing:facing,range:range,arcW:arcW,startAng:full?0:facing-arcW/2,endAng:full?Math.PI*2:facing+arcW/2,dmg:(full?2:1)*1.5*player.dmgMult,knockback:full};sfxSwing(full);if(full){crescents.push({x:p.x,y:p.y,vx:Math.cos(facing)*9,vy:Math.sin(facing)*9,ang:facing,life:65,id:++crescentSeq,big:true});}}

function activateAbility(){
  if(state!=='playing'||paused)return;var p=player;
  sfxAbility();
  if(selChar==='tank'){if(abCd>0)return;abCd=p.abCdMax;shieldHp=Math.min(shieldHp+1,4);hudStatus();var R=p._pushRadius||165;for(var i=0;i<enemies.length;i++){var e=enemies[i],d=dst(p.x,p.y,e.x,e.y);if(d<R){var a=Math.atan2(e.y-p.y,e.x-p.x),f=(1-(d/R))*16;e.vx+=Math.cos(a)*f;e.vy+=Math.sin(a)*f;e.stun=p._stunDur||180;}}addSW(p.x,p.y,R,p.color,14,4);burst(p.x,p.y,p.color,18,true);burst(p.x,p.y,'#fff',8,true);hudAb();}
  else if(selChar==='scout'){if(abCd>0||p.dashing)return;abCd=p.abCdMax;var dd=inputDir(),dx=dd.dx,dy=dd.dy;if(dx===0&&dy===0){var da=Math.atan2(mouse.y-p.y,mouse.x-p.x);dx=Math.cos(da);dy=Math.sin(da);}var len=Math.sqrt(dx*dx+dy*dy);p.dashDx=dx/len*(p._dashDist||20);p.dashDy=dy/len*(p._dashDist||20);p.dashing=true;p.dashTimer=0;p.dashTrail=[];p.dashDamaging=true;p.dashId=++dashSeq;p.invincible=Math.max(p.invincible,24);hudAb();}
  else if(selChar==='gunner'){if(abCd>0||abActive)return;abActive=true;abTimer=0;abAutoT=0;hudAb();}
  else if(selChar==='warrior'){if(abCd>0||abActive)return;abActive=true;abTimer=0;abAutoT=0;player.invincible=90;player.speed=player.baseSpeed*1.8;addSW(player.x,player.y,180,'#ff0',15,6);burst(player.x,player.y,'#ff0',25,true);hudAb();}
  else if(selChar==='laser'){if(abCd>0||abActive)return;abActive=true;abTimer=0;abAutoT=0;hudAb();}
  else if(selChar==='turret'){
    if(p.turretPendingMobile&&(!p.turretLastPlaced||p.turretLastPlaced.hp<=0)){p.turretPendingMobile=false;p.turretLastPlaced=null;}
    if(abCd>0)return;
    if(p.turretPendingMobile){
      abCd=p.abCdMax;
      p.turretLastPlaced.mobile=true;
      p.turretPendingMobile=false;
      burst(p.x,p.y,'#0ff',14,true);hudAb();
      return;
    }
    var types=['projectile','laser','shield'];
    for(var ti=0;ti<3;ti++){
      var idx=(p.turretType+ti)%3,ttype=types[idx];
      if(turrets.filter(function(t){return t.type===ttype;}).length<2){
        abCd=p.abCdMax;
        var nt={x:p.x,y:p.y,type:ttype,hp:turretMaxHp(),maxHp:turretMaxHp(),size:10,shootT:0,mobile:false,laserState:'idle',laserT:0,laserChargeMax:45,laserFireMax:60,laserCoolMax:120,laserEndX:undefined,laserEndY:undefined,shieldT:0};
        turrets.push(nt);
        p.turretType=(idx+1)%3;p.turretPendingMobile=true;p.turretLastPlaced=nt;
        burst(p.x,p.y,'#0ff',10,true);hudAb();
        return;
      }
    }
  }
}

function hitPlayer(){sfxHurt();if(shieldHp>0){shieldHp--;hudStatus();player.invincible=Math.max(player.invincible,60);burst(player.x,player.y,'#4af',10,true);return;}lives--;player.invincible=130;burst(player.x,player.y,'#fff',12);hudLives();if(lives<=0)gameOver();}

function updSniper(e){var p=player;if(e.sniperState==='moving'){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*e.baseSpeed;e.y+=Math.sin(a)*e.baseSpeed;e.moveT++;if(e.moveT>100)e.sniperState='aim';}else if(e.sniperState==='aim'){e.sniperT++;if(e.sniperT>=e.aimMax){e.sniperT=0;e.sniperState='cooldown';var sa=Math.atan2(p.y-e.y,p.x-e.x);ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa)*7.5,vy:Math.sin(sa)*7.5,c:'#08f'});}}else{e.sniperT++;if(e.sniperT>=e.coolMax){e.sniperT=0;e.sniperState='aim';}}}
function updLaser(e){var p=player;if(e.laserState==='approach'){if(dst(e.x,e.y,p.x,p.y)>200){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*e.baseSpeed;e.y+=Math.sin(a)*e.baseSpeed;}else{e.laserState='charge';e.laserT=0;}}else if(e.laserState==='charge'){e.laserT++;var dir=Math.atan2(p.y-e.y,p.x-e.x);var ep=laserEP(e.x,e.y,dir);e.laserEndX=ep.x;e.laserEndY=ep.y;e.laserDir=dir;if(e.laserT>=e.laserChargeMax){e.laserState='pause';e.laserT=0;}}else if(e.laserState==='pause'){e.laserT++;if(e.laserT>=60){e.laserState='fire';e.laserT=0;}}else if(e.laserState==='fire'){e.laserT++;if(p.invincible<=0&&e.laserEndX!==undefined){if(pLineDst(p.x,p.y,e.x,e.y,e.laserEndX,e.laserEndY)<p.size+10)hitPlayer();}if(e.laserT>=e.laserFireMax){e.laserState='cooldown';e.laserT=0;e.laserEndX=undefined;}}else{e.laserT++;if(e.laserT>=e.laserCoolMax){e.laserState='approach';e.laserT=0;}}}
function updBoss(e,spd){var p=player;if(e.variant==='destroyer'){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;if(e.hp<=e.maxHp/2&&e.phase===1){e.phase=2;e.baseSpeed*=1.45;burst(e.x,e.y,'#f05',28,true);addSW(e.x,e.y,220,'#f05',8,3);}e.shootT++;var cd=bossCd(e.phase===2?42:78);if(e.shootT>=cd){e.shootT=0;var sa=Math.atan2(p.y-e.y,p.x-e.x),n=(e.phase===2?5:3)+bossExtraProj();for(var i=0;i<n;i++){var sp=(i-(n-1)/2)*.24;ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa+sp)*4.8,vy:Math.sin(sa+sp)*4.8,c:'#f05'});}}}
  else if(e.variant==='summoner'){e.orbitT+=.018;e.x+=(camX+W/2+Math.cos(e.orbitT)*160-e.x)*.04;e.y+=(camY+H/2+Math.sin(e.orbitT)*120-e.y)*.04;e.summonT++;if(e.summonT>=bossCd(e.summonCD)){e.summonT=0;burst(e.x,e.y,'#a0f',20,true);addSW(e.x,e.y,100,'#a0f',5,2);for(var i=0,sm=(summonedAlive()<24?3:0);i<sm;i++){var pt=edgePt();var t=ETYPES[Math.floor(Math.random()*4)],mh=Math.max(1,Math.round(t.hp*diffHpMult()));enemies.push({x:pt.x,y:pt.y,color:t.color,shape:t.shape,type:t.type,summoned:true,hp:mh,maxHp:mh,baseSpeed:t.spd*(1+(wave-1)*.09)*diffSpdMult(),size:t.sz,pts:t.pts,rot:0,rotSpeed:(Math.random()-.5)*.08,vx:0,vy:0,slow:0,stun:0,pulseT:0,aura:68});}// Spawn 4 homing missiles
      for(var i=0,hm=(homingAlive()<12?4:0);i<hm;i++){var ha=i*Math.PI/2;ebullets.push({x:e.x+Math.cos(ha)*30,y:e.y+Math.sin(ha)*30,vx:Math.cos(ha)*2.2,vy:Math.sin(ha)*2.2,c:'#f0a',homing:true,r:7});}
    }e.shootT++;if(e.shootT>=bossCd(110)){e.shootT=0;var rn=8+bossExtraProj();for(var i=0;i<rn;i++){var sa=i*Math.PI*2/rn;ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa)*3.5,vy:Math.sin(sa)*3.5,c:'#a0f'});}}}
  else if(e.variant==='sniper'){var tx=2*camX+W-p.x,ty=2*camY+H-p.y;var a=Math.atan2(ty-e.y,tx-e.x);e.x+=Math.cos(a)*spd*1.2;e.y+=Math.sin(a)*spd*1.2;e.x=Math.max(e.size,Math.min(curBW-e.size,e.x));e.y=Math.max(e.size,Math.min(curBH-e.size,e.y));e.snipeT++;if(e.snipeT>=bossCd(e.snipeCD)){e.snipeT=0;var sa=Math.atan2(p.y-e.y,p.x-e.x);for(var sx=0,sxn=1+bossExtraProj();sx<sxn;sx++){var so=(sx-(sxn-1)/2)*0.16;ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa+so)*8.5,vy:Math.sin(sa+so)*8.5,c:'#0ff'});}burst(e.x,e.y,'#0ff',5,true);}}
  else if(e.variant==='obliterator'){e.shootT++;var d=dst(e.x,e.y,p.x,p.y);if(d<200){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;}e.teleportT++;if(e.teleportT>=240){e.teleportT=0;var ang=Math.random()*Math.PI*2,dist=250+Math.random()*100;e.x=p.x+Math.cos(ang)*dist;e.y=p.y+Math.sin(ang)*dist;e.x=Math.max(e.size,Math.min(curBW-e.size,e.x));e.y=Math.max(e.size,Math.min(curBH-e.size,e.y));burst(e.x,e.y,'#f0f',20,true);}if(e.laserState==='idle'){if(e.shootT>=bossCd(80)){e.laserState='charge';e.laserT=0;e.shootT=0;}}else if(e.laserState==='charge'){e.laserT++;var dir=Math.atan2(p.y-e.y,p.x-e.x);var ep=laserEP(e.x,e.y,dir);e.laserEndX=ep.x;e.laserEndY=ep.y;e.laserDir=dir;var ep2=laserEP(e.x,e.y,dir-0.35);e.laserEndX2=ep2.x;e.laserEndY2=ep2.y;var ep3=laserEP(e.x,e.y,dir+0.35);e.laserEndX3=ep3.x;e.laserEndY3=ep3.y;if(e.laserT>=e.laserChargeMax){e.laserState='pause';e.laserT=0;}}else if(e.laserState==='pause'){e.laserT++;if(e.laserT>=30){e.laserState='fire';e.laserT=0;}}else if(e.laserState==='fire'){e.laserT++;var laserLines=[[e.laserEndX,e.laserEndY],[e.laserEndX2,e.laserEndY2],[e.laserEndX3,e.laserEndY3]];for(var li=0;li<3;li++){var lx=laserLines[li][0],ly=laserLines[li][1];if(lx===undefined)continue;for(var j=0;j<enemies.length;j++){if(enemies[j]!==e){var ee=enemies[j];if(pLineDst(ee.x,ee.y,e.x,e.y,lx,ly)<ee.size+5){ee.hp-=0.8;burst(ee.x,ee.y,'#f0a',3);}}}if(p.invincible<=0&&pLineDst(p.x,p.y,e.x,e.y,lx,ly)<p.size+10)hitPlayer();}if(e.laserT>=e.laserFireMax){e.laserState='cooldown';e.laserT=0;e.laserEndX=undefined;e.laserEndX2=undefined;e.laserEndX3=undefined;}}else{e.laserT++;if(e.laserT>=e.laserCoolMax){e.laserState='idle';e.laserT=0;}}}  else if(e.variant==='fortress'){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;e.shootT++;if(e.shootT>=bossCd(150)){e.shootT=0;var fn=12+bossExtraProj();for(var i=0;i<fn;i++){var sa=i*Math.PI*2/fn;ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa)*3.0,vy:Math.sin(sa)*3.0,c:'#888'});burst(e.x,e.y,'#888',8,true);}}// Implosion mechanic
    e.implodeT=(e.implodeT||0)+1;var icd=e.implodeCD||380;if(e.implodeT>=icd-60&&e.implodeT<icd){// Warning pulse
      if(e.implodeT%18===0){addSW(e.x,e.y,180,'#888',22,6);burst(e.x,e.y,'#fff',4,true);}
    }if(e.implodeT>=icd){e.implodeT=0;// IMPLOSION: pull player toward fortress
      sfxNoise(0.45,0.35,55,180);sfxTone(80,'sawtooth',0.4,0.2,200);
      addSW(e.x,e.y,250,'#888',28,8);burst(e.x,e.y,'#888',30,true);burst(e.x,e.y,'#fff',14,true);
      var pullA=Math.atan2(e.y-p.y,e.x-p.x),pullD=dst(p.x,p.y,e.x,e.y);
      var pullF=Math.max(4,22-pullD*0.04);p.vx=(p.vx||0)+Math.cos(pullA)*pullF;p.vy=(p.vy||0)+Math.sin(pullA)*pullF;
      // Also knock back enemies away from fortress
      for(var i=0;i<enemies.length;i++){var ee=enemies[i];if(ee===e)continue;var ea=Math.atan2(ee.y-e.y,ee.x-e.x);var ef=(1-(dst(e.x,e.y,ee.x,ee.y)/280))*12;ee.vx+=Math.cos(ea)*ef;ee.vy+=Math.sin(ea)*ef;burst(ee.x,ee.y,'#888',3);}
    }}}
function updMini(e,spd){var p=player;if(e.variant==='dasher'){e.dashT++;if(e.dashing){e.x+=e.dvx;e.y+=e.dvy;if(e.dashT>22){e.dashing=false;e.dashT=0;e.windingUp=false;}}else if(e.windingUp){e.windupT++;if(e.windupT>=e.windupMax){e.windingUp=false;e.windupT=0;e.dashing=true;e.dashT=0;// Lock dash direction toward player at windup end
        var da=Math.atan2(p.y-e.y,p.x-e.x);e.dvx=Math.cos(da)*14;e.dvy=Math.sin(da)*14;}// Vibrate slightly during windup
      e.x+=Math.sin(e.windupT*1.8)*1.2;e.y+=Math.cos(e.windupT*1.1)*1.2;}else{var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;if(e.dashT>=e.dashCD){e.dashT=0;e.windingUp=true;e.windupT=0;e.windupMax=38;// Freeze and telegraph
        burst(e.x,e.y,e.color,8,true);}}}
  else if(e.variant==='charger'){if(e.chargingMode){e.x+=e.chargeVx;e.y+=e.chargeVy;e.chargeT++;if(e.x<e.size||e.x>curBW-e.size){e.chargeVx*=-1;e.x=Math.max(e.size,Math.min(curBW-e.size,e.x));burst(e.x,e.y,'#ff0',6);}if(e.y<e.size||e.y>curBH-e.size){e.chargeVy*=-1;e.y=Math.max(e.size,Math.min(curBH-e.size,e.y));burst(e.x,e.y,'#ff0',6);}if(e.chargeT>85){e.chargingMode=false;e.chargeT=0;e.chargeCD=55;}}else{e.chargeT++;if(e.chargeT>=e.chargeCD){e.chargingMode=true;e.chargeT=0;var a=Math.atan2(p.y-e.y,p.x-e.x);e.chargeVx=Math.cos(a)*12;e.chargeVy=Math.sin(a)*12;}}}
  else if(e.variant==='shielder'){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;e.shieldAngle+=.05;e.shootT++;if(e.shootT>=e.shootCD){e.shootT=0;var sa=Math.atan2(p.y-e.y,p.x-e.x);ebullets.push({x:e.x,y:e.y,vx:Math.cos(sa)*3.8,vy:Math.sin(sa)*3.8,c:'#d0f'});}}
  else if(e.variant==='laser'){var d=dst(e.x,e.y,p.x,p.y);if(d<150){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;}else if(d>250){var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;}if(e.laserState==='approach'){e.laserState='charge';e.laserT=0;}else if(e.laserState==='charge'){e.laserT++;var dir=Math.atan2(p.y-e.y,p.x-e.x),ep=laserEP(e.x,e.y,dir);e.laserEndX=ep.x;e.laserEndY=ep.y;e.laserDir=dir;if(e.laserT>=e.laserChargeMax){e.laserState='pause';e.laserT=0;}}else if(e.laserState==='pause'){e.laserT++;if(e.laserT>=60){e.laserState='fire';e.laserT=0;}}else if(e.laserState==='fire'){e.laserT++;if(p.invincible<=0&&e.laserEndX!==undefined&&pLineDst(p.x,p.y,e.x,e.y,e.laserEndX,e.laserEndY)<p.size+10)hitPlayer();if(e.laserT>=e.laserFireMax){e.laserState='cooldown';e.laserT=0;e.laserEndX=undefined;}}else{e.laserT++;if(e.laserT>=e.laserCoolMax){e.laserState='approach';e.laserT=0;}}}}
function updGlow(e,spd){var p=player;var a=Math.atan2(p.y-e.y,p.x-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;e.pulseT++;if(e.pulseT>=130){e.pulseT=0;addSW(e.x,e.y,110,'#ff6',7,2);burst(e.x,e.y,'#ff6',14,true);if(p.invincible<=0&&dst(p.x,p.y,e.x,e.y)<110)hitPlayer();}}
function updTurret(t){
  if(t.hp<=0)return;
  if(t.mobile){
    var mobiles=turrets.filter(function(tt){return tt.mobile&&tt.hp>0;});
    var slot=mobiles.indexOf(t);
    var angStep=Math.PI*2/Math.max(1,mobiles.length);
    var targetAng=gameTime*.0006+slot*angStep;
    var tx=player.x+Math.cos(targetAng)*70,ty=player.y+Math.sin(targetAng)*70;
    var tfa=Math.atan2(ty-t.y,tx-t.x),tfd=dst(t.x,t.y,tx,ty);
    if(tfd>3){t.x+=Math.cos(tfa)*Math.min(tfd,3);t.y+=Math.sin(tfa)*Math.min(tfd,3);}
    resolveObstacles(t);
  }
  t.shootT++;
  if(t.type==='projectile'){
    if(t.shootT>=90/turretMul()){
      t.shootT=0;
      var closest=null,minD=999;
      for(var j=0;j<enemies.length;j++){
        var d=dst(t.x,t.y,enemies[j].x,enemies[j].y);
        if(d<minD){minD=d;closest=enemies[j];}
      }
      if(closest){
        var a=Math.atan2(closest.y-t.y,closest.x-t.x);
        bullets.push({x:t.x,y:t.y,vx:Math.cos(a)*6,vy:Math.sin(a)*6,c:'#0ff',splash:false});
        burst(t.x,t.y,'#0ff',3);sfxTurretShot();
      }
    }
  }else if(t.type==='laser'){
    if(t.laserState==='idle'){
      if(t.shootT>=120/turretMul()){
        t.laserState='charge';t.laserT=0;t.shootT=0;
      }
    }else if(t.laserState==='charge'){
      t.laserT++;
      var closest=null,minD=999;
      for(var j=0;j<enemies.length;j++){
        var d=dst(t.x,t.y,enemies[j].x,enemies[j].y);
        if(d<minD){minD=d;closest=enemies[j];}
      }
      if(closest){
        var dir=Math.atan2(closest.y-t.y,closest.x-t.x),ep=laserEP(t.x,t.y,dir);
        t.laserEndX=ep.x;t.laserEndY=ep.y;t.laserDir=dir;
      }
      if(t.laserT>=t.laserChargeMax){
        t.laserState='pause';t.laserT=0;
      }
    }else if(t.laserState==='pause'){
      t.laserT++;
      if(t.laserT>=30){
        t.laserState='fire';t.laserT=0;sfxTurretLaser();
      }
    }else if(t.laserState==='fire'){
      t.laserT++;
      for(var j=0;j<enemies.length;j++){
        var e=enemies[j];
        if(t.laserEndX!==undefined&&pLineDst(e.x,e.y,t.x,t.y,t.laserEndX,t.laserEndY)<e.size+5){
          e.hp-=0.5;burst(e.x,e.y,'#f0a',2);
        }
      }
      if(t.laserT>=t.laserFireMax){
        t.laserState='cooldown';t.laserT=0;t.laserEndX=undefined;
      }
    }else{
      t.laserT++;
      if(t.laserT>=t.laserCoolMax){
        t.laserState='idle';t.laserT=0;
      }
    }
  }else if(t.type==='shield'){
    if(t.shieldT>=180/turretMul()){
      t.shieldT=0;sfxTurretPulse();
      addSW(t.x,t.y,120,'#0ff',10,4);
      burst(t.x,t.y,'#0ff',15,true);
      for(var j=0;j<enemies.length;j++){
        var e=enemies[j],d=dst(t.x,t.y,e.x,e.y);
        if(d<120){
          var a=Math.atan2(e.y-t.y,e.x-t.x),f=15;
          e.vx+=Math.cos(a)*f;e.vy+=Math.sin(a)*f;e.stun=60;
        }
      }
    }
    t.shieldT++;
  }
}

function update(){
  if(state!=='playing')return;var p=player;
  gameTick++;
  if(ebullets.length>BAL.ebulletSafety)ebullets.splice(0,ebullets.length-BAL.ebulletSafety);
  if(pendingUpgradeT>0){pendingUpgradeT--;if(pendingUpgradeT===0){showUpgradeScreen();return;}}
  var firing=mouseHeld||keys[' ']||touchAim.active;
  if(firing)shoot();else if(p.laserActive)p.laserActive=false;
  if(selStage==='drift'){curBW=WORLD_W;curBH=WORLD_H;}else{curBW=W;curBH=H;}
  if(p.dashing){if(p.dashTrail)p.dashTrail.push({x:p.x,y:p.y,a:.35});if(p.dashTrail&&p.dashTrail.length>5)p.dashTrail.shift();for(var t=0;p.dashTrail&&t<p.dashTrail.length;t++)p.dashTrail[t].a*=.76;p.x=Math.max(p.size,Math.min(curBW-p.size,p.x+p.dashDx));p.y=Math.max(p.size,Math.min(curBH-p.size,p.y+p.dashDy));
    if(p.dashDamaging){var anyDashHit=false;for(var dwi=0;dwi<enemies.length;dwi++){var dwe=enemies[dwi];if(dst(p.x,p.y,dwe.x,dwe.y)<p.size+dwe.size+6&&dwe._lastDashId!==p.dashId){dwe._lastDashId=p.dashId;dwe.hp-=2.5*player.dmgMult;burst(dwe.x,dwe.y,'#0f9',6,true);anyDashHit=true;}}if(anyDashHit)cleanupDead();}
    p.dashTimer++;if(p.dashTimer>=20){p.dashing=false;p.dashTrail=[];hudAb();}}
  else{var dx=0,dy=0;if(keys['w']||keys['arrowup'])dy-=p.speed;if(keys['s']||keys['arrowdown'])dy+=p.speed;if(keys['a']||keys['arrowleft'])dx-=p.speed;if(keys['d']||keys['arrowright'])dx+=p.speed;if(dx&&dy){dx*=.707;dy*=.707;}if(joyMove.active){dx=joyMove.x*p.speed;dy=joyMove.y*p.speed;}p.x=Math.max(p.size,Math.min(curBW-p.size,p.x+dx));p.y=Math.max(p.size,Math.min(curBH-p.size,p.y+dy));}
  if(p.vx||p.vy){p.x=Math.max(p.size,Math.min(curBW-p.size,p.x+(p.vx||0)));p.y=Math.max(p.size,Math.min(curBH-p.size,p.y+(p.vy||0)));p.vx=(p.vx||0)*0.7;p.vy=(p.vy||0)*0.7;if(Math.abs(p.vx)<0.1)p.vx=0;if(Math.abs(p.vy)<0.1)p.vy=0;} // knockback / Fortress pull
  resolveObstacles(p);
  if(selStage==='drift'){camX=p.x-W/2;camY=p.y-H/2;}else{camX=0;camY=0;}
  if(touchAim.active||(isTouchDevice&&!mouseMoved)){mouse.x=p.x+Math.cos(touchAim.angle)*200;mouse.y=p.y+Math.sin(touchAim.angle)*200;}else{mouse.x=mouseScreen.x+camX;mouse.y=mouseScreen.y+camY;}
  p.angle=Math.atan2(mouse.y-p.y,mouse.x-p.x)+Math.PI/2;if(p.invincible>0)p.invincible--;
  if(selChar==='warrior'&&p.sf&&p.sf.active){
    var sf=p.sf;sf.timer--;
    var prog=1-(sf.timer/sf.maxTimer);
    if(sf.type==='full'){var rAngle=prog*Math.PI*2;for(var bi=0;bi<3;bi++)swingHitCheck(sf,rAngle+bi*(Math.PI*2/3),0.5);}
    else{var curAng=sf.startAng+prog*(sf.endAng-sf.startAng);swingHitCheck(sf,curAng,0.42);}
    if(sf.timer<=0)sf.active=false;
  }
  if(selChar==='laser'&&p.laserActive){
    p.laserTickTimer++;
    if(p.laserTickTimer >= 10){
      p.laserTickTimer = 0;
      sfxLaserLoop();
      var ang=Math.atan2(mouse.y-p.y,mouse.x-p.x);
      var ep=laserEP(p.x,p.y,ang);
      for(var i=0;i<enemies.length;i++){
        var e=enemies[i];
        if(pLineDst(e.x,e.y,p.x,p.y,ep.x,ep.y)<e.size+p.beamSize){
          e._beamExp=Math.min(20,(e._beamExp||0)+1);
          var beamMult=1+e._beamExp*0.15;
          e.hp-=0.3*beamMult*player.dmgMult;
          burst(e.x,e.y,'#f0f',2+(e._beamExp>6?2:0));
        }else if(e._beamExp){e._beamExp=Math.max(0,e._beamExp-2);}
      }
    }
  }
  if(p.comboResetT>0){p.comboResetT--;if(p.comboResetT===0)p.comboCount=0;}
  if(abCd>0){abCd--;if(abCd%60===0||abCd===0)hudAb();}
  if(player.dodgeCd>0)player.dodgeCd--;
  if(gameTick%6===0)hudCooldowns();
  if(selChar==='gunner'&&abActive){abTimer++;abAutoT++;if(abAutoT>=5){abAutoT=0;var gTargets=enemies.slice().sort(function(ga,gb){return dst(p.x,p.y,ga.x,ga.y)-dst(p.x,p.y,gb.x,gb.y);}).slice(0,3);if(gTargets.length===0)fireAt(Math.atan2(mouse.y-p.y,mouse.x-p.x),false);else for(var gi=0;gi<gTargets.length;gi++){fireAt(Math.atan2(gTargets[gi].y-p.y,gTargets[gi].x-p.x),false);}}if(abTimer>=p.abDur){abActive=false;abTimer=0;abCd=p.abCdMax;hudAb();}else if(abTimer%60===0)hudAb();}
  if(selChar==='warrior'&&abActive){abTimer++;abAutoT++;if(abTimer%3===0){var spA=gameTime*0.0185,spR=p._spinRange||82;for(var spi=0;spi<2;spi++)burst(p.x+Math.cos(spA+spi*Math.PI)*spR,p.y+Math.sin(spA+spi*Math.PI)*spR,'#ff0',1);}if(abAutoT>=20){abAutoT=0;var R2=p._spinRange||82;var anyHit=false;for(var wi=0;wi<enemies.length;wi++){var we=enemies[wi];if(dst(p.x,p.y,we.x,we.y)<=R2+we.size){we.hp-=4*player.dmgMult;burst(we.x,we.y,'#ff0',4,true);anyHit=true;}}if(anyHit)cleanupDead();}if(abTimer>=p.abDur){abActive=false;abTimer=0;abAutoT=0;abCd=p.abCdMax;player.speed=player.baseSpeed;hudAb();}else if(abTimer%60===0)hudAb();}
  for(var ci=crescents.length-1;ci>=0;ci--){
    var cr=crescents[ci];
    cr.x+=cr.vx;cr.y+=cr.vy;cr.life--;
    var anyCrHit=false;
    for(var cj=0;cj<enemies.length;cj++){
      var ce=enemies[cj];
      if(ce._lastCrescentId===cr.id)continue;
      if(dst(cr.x,cr.y,ce.x,ce.y)<(cr.big?40:26)+ce.size){
        ce._lastCrescentId=cr.id;ce.hp-=(cr.big?5:3)*player.dmgMult;
        var ca=Math.atan2(ce.y-cr.y,ce.x-cr.x);
        ce.vx+=Math.cos(ca)*(cr.big?14:11);ce.vy+=Math.sin(ca)*(cr.big?14:11);ce.stun=Math.max(ce.stun||0,cr.big?60:50);
        burst(ce.x,ce.y,'#ff0',cr.big?9:6,true);anyCrHit=true;
      }
    }
    if(anyCrHit)cleanupDead();
    if(cr.life<=0||pointInObstacle(cr.x,cr.y)||cr.x<camX-60||cr.x>camX+W+60||cr.y<camY-60||cr.y>camY+H+60)crescents.splice(ci,1);
  }
  if(selChar==='laser'&&abActive){abTimer++;var abBeamW=p.beamSize*1.8;if(abTimer % 54 === 0 && abAutoT < 4+playerUpgrades.oblBeams){abAutoT++;var ang=Math.atan2(mouse.y-p.y,mouse.x-p.x);var ep=laserEP(p.x,p.y,ang);for(var i=0;i<enemies.length;i++){var e=enemies[i];if(pLineDst(e.x,e.y,p.x,p.y,ep.x,ep.y)<e.size+abBeamW){e.hp-=10*player.dmgMult;burst(e.x,e.y,'#f0f',10,true);e.vx+=(Math.cos(ang)*2);e.vy+=(Math.sin(ang)*2);}}addSW(p.x,p.y,220,'#f0f',15,5);burst(p.x,p.y,'#f0f',18,true);p.beamVisible=40;}if(abTimer>=p.abDur){abActive=false;abTimer=0;abAutoT=0;abCd=p.abCdMax;hudAb();}else if(abTimer%60===0)hudAb();}
  if(p.regen){regenTimer++;if(regenTimer>=600&&lives<maxLives){lives++;regenTimer=0;hudLives();}}
  if(bootsTimer>0){bootsTimer--;if(bootsTimer===0){p.speed=p.baseSpeed;hudStatus();}else if(bootsTimer%60===0)hudStatus();}
  for(var i=bullets.length-1;i>=0;i--){var b=bullets[i];b.x+=b.vx;b.y+=b.vy;if(b.x<camX-30||b.x>camX+W+30||b.y<camY-30||b.y>camY+H+30||pointInObstacle(b.x,b.y))bullets.splice(i,1);}
  for(var i=ebullets.length-1;i>=0;i--){var eb=ebullets[i];
    if(eb.homing){var ha=Math.atan2(player.y-eb.y,player.x-eb.x),curA=Math.atan2(eb.vy,eb.vx),spd=Math.sqrt(eb.vx*eb.vx+eb.vy*eb.vy);var dA=normA(ha-curA);var newA=curA+dA*0.07;eb.vx=Math.cos(newA)*spd;eb.vy=Math.sin(newA)*spd;}
    eb.x+=eb.vx;eb.y+=eb.vy;if(eb.x<camX-30||eb.x>camX+W+30||eb.y<camY-30||eb.y>camY+H+30||pointInObstacle(eb.x,eb.y)){ebullets.splice(i,1);continue;}if(p.invincible<=0&&dst(p.x,p.y,eb.x,eb.y)<p.size+5){ebullets.splice(i,1);hitPlayer();}else{for(var j=0;j<turrets.length;j++){var t=turrets[j];if(dst(t.x,t.y,eb.x,eb.y)<t.size+5){t.hp--;burst(t.x,t.y,'#fff',3);ebullets.splice(i,1);break;}}}}
  // Player bullets destroy homing ebullets
  for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi],bh=false;for(var ei=ebullets.length-1;ei>=0;ei--){if(ebullets[ei].homing&&dst(b.x,b.y,ebullets[ei].x,ebullets[ei].y)<10){burst(ebullets[ei].x,ebullets[ei].y,'#a0f',7,true);score+=5;ebullets.splice(ei,1);bullets.splice(bi,1);bh=true;break;}}if(bh)continue;}
  if(selMode==='bossrush'){
    bossRushSpawnTimer++;
    if(bossRushSpawnTimer>=bossRushSpawnRate){
      bossRushSpawnTimer=0;
      var miniCount=wave>5?Math.min(4,1+Math.floor((wave-5)/4)):1;
      var minisAlive=0;for(var mq=0;mq<enemies.length;mq++)if(enemies[mq].type==='miniboss'&&enemies[mq].hp>0)minisAlive++;
      var miniSlots=Math.max(0,BAL.rushMiniLimit+Math.floor(wave/10)-minisAlive);
      for(var mci=0;mci<Math.min(miniCount,miniSlots);mci++)spawnMini();
      bossRushSpawnRate=Math.max(170,bossRushSpawnRate-8);
    }
    if(wave>15){
      bigRushTimer++;
      if(bigRushTimer>=bigRushRate){
        var bigAlive=0,bigLimit=BAL.rushBossLimit+Math.floor(wave/20);
        for(var bq=0;bq<enemies.length;bq++)if(enemies[bq].type==='boss'&&enemies[bq].hp>0)bigAlive++;
        if(bigAlive>=bigLimit){bigRushTimer=bigRushRate;} // wait for a slot, then spawn right away
        else{
          bigRushTimer=0;spawnBoss();
          var bigMulti=Math.random()<0.35&&bigAlive+1<bigLimit;
          if(bigMulti)spawnBoss();
          announce(bigMulti?'BIG BOSS x2':'BIG BOSS','#f05',true);
          bigRushRate=Math.max(260,bigRushRate-10);
        }
      }
    }
    powerupSpawnTimer++;
    if(powerupSpawnTimer>=powerupSpawnRate){
      powerupSpawnTimer=0;powerupSpawnRate=380+Math.floor(Math.random()*260);
      var pux=camX+50+Math.random()*(W-100),puy=camY+50+Math.random()*(H-100);
      drops.push({x:pux,y:puy,type:rndItem(),life:500,maxLife:500,bob:Math.random()*Math.PI*2,vx:0,vy:0});
      floatTxt(pux,puy-22,'POWER-UP!','#ff0');
    }
  }else{
    spawnTimer++;if(spawnTimer>=spawnRate){spawnTimer=0;var sn=1;if(selMode==='blitz'&&wave>BAL.extraSpawnFrom)sn+=Math.floor((wave-BAL.extraSpawnFrom)/BAL.extraSpawnEvery);if(enemies.length<BAL.enemySafety){for(var sk=0;sk<sn;sk++)spawnEnemy();}}
  }
  var hasBoss=enemies.some(function(e){return e.type==='boss'||e.type==='miniboss';});
  if(selMode==='bossrush'&&wave>15){
    // big bosses now spawn continuously via their own timer above; skip the discrete per-wave check
  }else if(!bossSpawned&&!hasBoss){
    if(selMode==='bossrush'&&wave>10){
      if(wave%3===0){bossSpawned=true;spawnBoss();var midMulti=Math.random()<0.35;if(midMulti)spawnBoss();announce(midMulti?'BIG BOSS x2':'BIG BOSS','#f05',true);}
    }else if(wave%5===0){bossSpawned=true;spawnBoss();announce('BIG BOSS','#f05',true);}
    else if(selMode!=='bossrush'&&wave%4===0){bossSpawned=true;spawnMini();if(wave>=12)spawnMini();announce(wave>=12?'MINI BOSS x2':'MINI BOSS','#f90');}
  }
  for(var i=0;i<enemies.length;i++){
    var e=enemies[i];e.x+=e.vx;e.y+=e.vy;e.vx*=.87;e.vy*=.87;if(Math.abs(e.vx)<.05)e.vx=0;if(Math.abs(e.vy)<.05)e.vy=0;
    if(e.slow>0)e.slow--;if(e.stun>0){e.stun--;e.rot+=(e.rotSpeed||0);continue;}
    var spd=e.slow>0?e.baseSpeed*.45:e.baseSpeed;e.rot+=(e.rotSpeed||0);
    if(e.type==='boss')updBoss(e,spd);else if(e.type==='miniboss')updMini(e,spd);else if(e.type==='glower')updGlow(e,spd);else if(e.type==='sniper')updSniper(e);else if(e.type==='laser')updLaser(e);else{var tx=p.x,ty=p.y;for(var ti=0;ti<turrets.length;ti++){if(dst(e.x,e.y,turrets[ti].x,turrets[ti].y)<dst(e.x,e.y,tx,ty)){tx=turrets[ti].x;ty=turrets[ti].y;}}var a=Math.atan2(ty-e.y,tx-e.x);e.x+=Math.cos(a)*spd;e.y+=Math.sin(a)*spd;}
    resolveObstacles(e);
    if(selStage==='drift'){e.x=Math.max(0,Math.min(WORLD_W,e.x));e.y=Math.max(0,Math.min(WORLD_H,e.y));}
  }
  for(var i=0;i<turrets.length;i++) updTurret(turrets[i]);
  for(var i=turrets.length-1;i>=0;i--) if(turrets[i].hp<=0) turrets.splice(i,1);
  var sl=[];for(var bi=bullets.length-1;bi>=0;bi--){var b=bullets[bi],hit=false;for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];if(dst(b.x,b.y,e.x,e.y)<e.size+(b.big?9:4)){if(e.variant==='shielder'){var aA=normA(Math.atan2(-b.vy,-b.vx)-e.shieldAngle);if(Math.abs(aA)<Math.PI*.52){burst(b.x,b.y,'#d0f',4);bullets.splice(bi,1);hit=true;break;}}if(b.splash)sl.push({x:b.x,y:b.y,big:!!b.big});else{e.hp-=1*player.dmgMult;burst(b.x,b.y,e.color,5);}bullets.splice(bi,1);hit=true;break;}}}
  for(var s=0;s<sl.length;s++)doSplash(sl[s].x,sl[s].y,sl[s].big);cleanupDead();
  if(p.invincible<=0){for(var i=0;i<enemies.length;i++){if(dst(p.x,p.y,enemies[i].x,enemies[i].y)<p.size+enemies[i].size-5){hitPlayer();break;}}}
  for(var i=0;i<enemies.length;i++){for(var j=turrets.length-1;j>=0;j--){if(dst(enemies[i].x,enemies[i].y,turrets[j].x,turrets[j].y)<enemies[i].size+turrets[j].size){turrets[j].hp--;burst(turrets[j].x,turrets[j].y,'#0ff',2);break;}}}
  for(var i=shockwaves.length-1;i>=0;i--){var sw=shockwaves[i];sw.r+=sw.gr;sw.life-=.04;if(sw.r>=(sw.maxR||999)||sw.life<=0)shockwaves.splice(i,1);}
  for(var i=drops.length-1;i>=0;i--){var d=drops[i];d.x+=d.vx;d.y+=d.vy;d.vx*=.88;d.vy*=.88;d.x=Math.max(12,Math.min(curBW-12,d.x));d.y=Math.max(12,Math.min(curBH-12,d.y));d.life--;if(d.life<=0){drops.splice(i,1);continue;}if(dst(p.x,p.y,d.x,d.y)<p.size+13){pickupDrop(d);drops.splice(i,1);}}
  for(var i=floaters.length-1;i>=0;i--){var fl=floaters[i];fl.y-=0.45;fl.life--;if(fl.life<=0)floaters.splice(i,1);}
  for(var i=particles.length-1;i>=0;i--){var pt=particles[i];pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=.92;pt.vy*=.92;pt.life-=.024;if(pt.life<=0)particles.splice(i,1);}
  if(waveKills>=waveGoal){var wasBigBossRound=(wave%5===0);wave++;waveKills=0;
    if(selMode==='blitz'){waveGoal=blitzGoal(wave);autoApplyUpgrades(1);}
    else if(selMode==='bossrush'){waveGoal=Math.min(10,waveGoal+1);autoApplyUpgrades(wasBigBossRound?2:1);}
    else{waveGoal=Math.min(28,Math.floor(waveGoal*1.13));}
    spawnRate=Math.max(selMode==='blitz'?24:40,spawnRate-(selMode==='blitz'?3:2));bossSpawned=false;hudWave();hudBar();announce('WAVE '+wave,'#ff0');}
}

function draw(){ctx.setTransform(RK,0,0,RK,0,0);ctx.clearRect(0,0,W,H);ctx.fillStyle='#020208';ctx.fillRect(0,0,W,H);if(!player){ctx.save();drawGrid();ctx.restore();return;}ctx.save();ctx.translate(-camX,-camY);drawGrid();drawWorldBorder();obstacles.forEach(drawObstacle);shockwaves.forEach(drawShockwave);particles.forEach(drawParticle);drops.forEach(drawDrop);enemies.forEach(drawEnemy);turrets.forEach(drawTurret);drawLaserBeams();if(selChar==='laser'&&player.laserActive){var ang=Math.atan2(mouse.y-player.y,mouse.x-player.x);var ep=laserEP(player.x,player.y,ang);var pbw=(abActive?player.beamSize*1.8:player.beamSize)/2;gl('#f0f',35);ctx.strokeStyle='#f0f';ctx.lineWidth=pbw;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(ep.x,ep.y);ctx.stroke();ng();}if(selChar==='laser'&&player.beamVisible>0){var ang=Math.atan2(mouse.y-player.y,mouse.x-player.x);var ep=laserEP(player.x,player.y,ang);var abw=player.beamSize*1.8;gl('#f0f',60);ctx.strokeStyle='rgba(255,0,255,0.95)';ctx.lineWidth=abw*1.3;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(ep.x,ep.y);ctx.stroke();gl('#f0f',40);ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=abw*0.65;ctx.beginPath();ctx.moveTo(player.x,player.y);ctx.lineTo(ep.x,ep.y);ctx.stroke();ng();player.beamVisible--;}ebullets.forEach(drawEBullet);bullets.forEach(drawBullet);crescents.forEach(drawCrescent);if(state==='playing')drawPlayer();drawFloaters();ctx.restore();if(paused){ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillRect(0,0,W,H);}}
function drawObstacle(o){
  ctx.fillStyle='rgba(10,30,40,0.9)';ctx.fillRect(o.x,o.y,o.w,o.h);
  gl('#0ff',10);ctx.strokeStyle='rgba(0,255,255,0.6)';ctx.lineWidth=2;ctx.strokeRect(o.x,o.y,o.w,o.h);ng();
  ctx.strokeStyle='rgba(0,255,255,0.15)';ctx.lineWidth=1;
  for(var gx=o.x+10;gx<o.x+o.w;gx+=14){ctx.beginPath();ctx.moveTo(gx,o.y);ctx.lineTo(gx,o.y+o.h);ctx.stroke();}
}
var STEP=1000/60,acc=0,lastT=0,workEMA=0,workN=0;
function loop(now){
  requestAnimationFrame(loop);
  now=now||performance.now();
  if(!lastT)lastT=now;
  var dt=Math.min(100,now-lastT);lastT=now;
  var t0=performance.now();
  if(!paused){
    acc+=dt;var n=0;
    while(acc>=STEP&&n<5){acc-=STEP;gameTime+=STEP;update();n++;}
    if(n>=5)acc=0;
  }else acc=0;
  draw();
  adaptGlow(performance.now()-t0);
}
// Adaptive quality: if frames cost too much CPU time, shrink then drop the glow effects (only in AUTO quality)
var qualityMode='auto';
function adaptGlow(work){
  if(qualityMode!=='auto'||state!=='playing'||paused)return;
  workEMA=workN?workEMA*0.95+work*0.05:work;workN++;
  if(workN>120&&workEMA>11&&glowScale>0){glowScale=glowScale>0.5?0.5:0;workN=0;}
}
function setQuality(q){qualityMode=q;workN=0;glowScale=q==='low'?0:q==='high'?1:(isTouchDevice?0.6:1);}
