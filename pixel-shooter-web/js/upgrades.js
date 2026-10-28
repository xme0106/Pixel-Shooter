// ===== ROGUELIKE UPGRADE SYSTEM =====
// Rules (see BAL in game.js for tunables):
//  - Damage is ADDITIVE: base x (1 + sum of bonuses). Power Up adds +20% of base per stack, with no limit.
//  - Every other upgrade works normally up to a stack limit. Picks beyond the limit are never wasted: the card relabels
//    itself "(MAX)" and converts into +10% base damage (Vitality converts into a full heal and +1 shield).
var UPGRADE_DEFS={
  dmg:       {label:'POWER UP',   desc:'+20% BASE DAMAGE (ADDS UP, NO LIMIT)',         icon:'⚔', color:'#f90'},
  speed:     {label:'SWIFT FEET', desc:'+7% MOVEMENT SPEED (UP TO 10 STACKS)',          icon:'⚡', color:'#0f9'},
  firerate:  {label:'RAPID HANDS',desc:'-12% ATTACK COOLDOWN (UP TO 8 STACKS)',         icon:'🔥', color:'#ff0'},
  hp:        {label:'VITALITY',   desc:'+1 MAX HP, HEALS TOO (UP TO 12 STACKS)',        icon:'♥', color:'#f05'},
  extraproj: {label:'MULTI-SHOT', desc:'+1 EXTRA PROJECTILE (UP TO 5 STACKS)',          icon:'✦', color:'#0ff'},
  permshield:{label:'GUARDIAN',   desc:'+1 SHIELD NOW, AND +1 EVERY BOSS KILL PER STACK (UP TO 6)', icon:'🛡', color:'#4af'},
  tank_push: {label:'TITAN WAVE', desc:'+25% PUSH RADIUS AND STUN (UP TO 6 STACKS)',    icon:'💥', color:'#0cf'},
  scout_dash:{label:'BLUR STEP',  desc:'+30% DASH RANGE, -8% COOLDOWN (UP TO 5 STACKS)',icon:'💨', color:'#0f9'},
  gunner_rf: {label:'MINIGUN',    desc:'+2 SECONDS OF RAPID FIRE (UP TO 5 STACKS)',     icon:'🎯', color:'#f90'},
  warrior_spin:{label:'WHIRLWIND+',desc:'+15% SPIN RANGE, -6% COOLDOWN (UP TO 6 STACKS)',icon:'🌀', color:'#ff0'},
  laser_obl: {label:'OBLITERATE+',desc:'+1 OBLITERATE BEAM (UP TO 5 STACKS)',           icon:'☄', color:'#f0f'},
  turret_hp: {label:'FORTIFY',    desc:'+25% TURRET HP AND FIRE RATE (UP TO 8 STACKS)', icon:'🏰', color:'#0ff'}
};
var UPGRADE_LIMIT={speed:10,firerate:8,extraproj:5,hp:12,permshield:6,tank_push:6,scout_dash:5,gunner_rf:5,warrior_spin:6,laser_obl:5,turret_hp:8};
var CLASS_UPGRADE={tank:'tank_push',scout:'scout_dash',gunner:'gunner_rf',warrior:'warrior_spin',laser:'laser_obl',turret:'turret_hp'};
function isMaxed(id){var L=UPGRADE_LIMIT[id];return L!==undefined&&(ownedUpgrades[id]||0)>=L;}
function upgradeCard(id){
  var d=UPGRADE_DEFS[id];
  if(isMaxed(id))return{id:id,label:d.label+' (MAX)',desc:id==='hp'?'FULL HEAL + 1 SHIELD':'+'+Math.round(BAL.overflowDmg*100)+'% BASE DAMAGE',icon:d.icon,color:d.color};
  return{id:id,label:d.label,desc:d.desc,icon:d.icon,color:d.color};
}
// Upgrades that would do nothing for a class are never offered
function upgradeApplies(id){
  if(id==='extraproj'&&(selChar==='warrior'||selChar==='laser'))return false;
  if(id==='firerate'&&selChar==='laser')return false;
  return true;
}
function getUpgradePool(){
  var ids=['dmg','speed','firerate','hp','extraproj','permshield'];
  if(CLASS_UPGRADE[selChar])ids.push(CLASS_UPGRADE[selChar]);
  ids=ids.filter(upgradeApplies);
  for(var i=ids.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=ids[i];ids[i]=ids[j];ids[j]=t;}
  return ids.slice(0,3).map(upgradeCard);
}
function applyUpgradeEffect(id){
  var p=player,n=(ownedUpgrades[id]=(ownedUpgrades[id]||0)+1),L=UPGRADE_LIMIT[id];
  if(L!==undefined&&n>L){ // past the stack limit: convert
    if(id==='hp'){lives=maxLives;shieldHp=Math.min(shieldHp+1,6);hudLives();hudStatus();floatTxt(p.x,p.y-20,'MAX: HEAL + SHIELD','#f05');}
    else{p.dmgBonus+=BAL.overflowDmg;recalcDmg();floatTxt(p.x,p.y-20,'MAX: +'+Math.round(BAL.overflowDmg*100)+'% DMG',UPGRADE_DEFS[id].color);}
    hudUpgrades();return;
  }
  if(id==='dmg'){p.dmgBonus+=0.2;recalcDmg();floatTxt(p.x,p.y-20,'+20% DMG','#f90');}
  else if(id==='speed'){p.baseSpeed=p.speedStat*(1+0.07*n);p.speed=(selChar==='warrior'&&abActive)?p.baseSpeed*1.8:(bootsTimer>0?p.baseSpeed*1.7:p.baseSpeed);floatTxt(p.x,p.y-20,'+SPEED','#0f9');}
  else if(id==='firerate'){p.fireCd=Math.max(30,Math.floor(p.fireCdBase*Math.pow(0.88,n)));floatTxt(p.x,p.y-20,'-CD','#ff0');}
  else if(id==='hp'){maxLives++;lives=Math.min(lives+1,maxLives);hudLives();floatTxt(p.x,p.y-20,'+1 HP','#f05');}
  else if(id==='extraproj'){playerUpgrades.extraProj=n;floatTxt(p.x,p.y-20,'+SHOT','#0ff');}
  else if(id==='permshield'){playerUpgrades.permShield=n;shieldHp=Math.min(shieldHp+1,6);hudStatus();floatTxt(p.x,p.y-20,'+SHIELD','#4af');}
  else if(id==='tank_push'){p._pushRadius=165*(1+0.25*n);p._stunDur=Math.round(180*(1+0.25*n));floatTxt(p.x,p.y-20,'WAVE+','#0cf');}
  else if(id==='scout_dash'){p._dashDist=20*(1+0.3*n);p.abCdMax=Math.max(20,Math.floor(p.abCdBase*(1-0.08*n)));floatTxt(p.x,p.y-20,'DASH+','#0f9');}
  else if(id==='gunner_rf'){p.abDur=p.abDurBase+120*n;floatTxt(p.x,p.y-20,'RF+','#f90');}
  else if(id==='warrior_spin'){p._spinRange=82*(1+0.15*n);p.abCdMax=Math.max(30,Math.floor(p.abCdBase*(1-0.06*n)));floatTxt(p.x,p.y-20,'SPIN+','#ff0');}
  else if(id==='laser_obl'){playerUpgrades.oblBeams=n;p.abDur=54*(4+n);floatTxt(p.x,p.y-20,'OBL+','#f0f');}
  else if(id==='turret_hp'){
    playerUpgrades.turretBoost=n;
    var m=turretMaxHp();
    for(var i=0;i<turrets.length;i++){turrets[i].hp+=m-turrets[i].maxHp;turrets[i].maxHp=m;}
    floatTxt(p.x,p.y-20,'TURRET+','#0ff');
  }
  hudUpgrades();
}
function autoApplyUpgrades(count){
  for(var i=0;i<count;i++){
    var pool=getUpgradePool();
    var pick=pool[Math.floor(Math.random()*pool.length)];
    applyUpgradeEffect(pick.id);
    showUpgradeToast(pick);
  }
}
function showUpgradeToast(u){
  var stack=document.getElementById('toast-stack');
  var el=document.createElement('div');
  el.className='upgrade-toast';el.style.borderColor=u.color;
  var ic=document.createElement('span');ic.className='ut-icon';ic.textContent=u.icon;
  var lb=document.createElement('span');lb.className='ut-label';lb.style.color=u.color;lb.style.textShadow='0 0 6px '+u.color;lb.textContent=u.label;
  el.appendChild(ic);el.appendChild(lb);
  stack.appendChild(el);
  while(stack.children.length>4)stack.removeChild(stack.firstChild); // never let toasts pile up
  setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},2200);
}
// ===== END UPGRADE SYSTEM =====
