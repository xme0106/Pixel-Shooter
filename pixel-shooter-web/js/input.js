// ===== INPUT: keyboard, mouse, touch sticks =====
function releaseInputs(){keys={};mouseHeld=false;joyMove.active=false;touchAim.active=false;}
var stageEl=document.getElementById('stage');

// ---- mouse (pointer events with pointerType 'mouse' only, so touches never fake a mouse) ----
window.addEventListener('pointermove',function(e){
  if(e.pointerType!=='mouse')return;
  var r=C.getBoundingClientRect();
  mouseScreen.x=(e.clientX-r.left)*(W/r.width);mouseScreen.y=(e.clientY-r.top)*(H/r.height);mouseMoved=true;
});
stageEl.addEventListener('pointerdown',function(e){
  if(e.pointerType!=='mouse'||state!=='playing')return;
  e.preventDefault();unlockAudio();
  try{stageEl.setPointerCapture(e.pointerId);}catch(err){}
  if(e.button===2)activateAbility();
  else if(e.button===0){mouseHeld=true;shoot();}
});
window.addEventListener('pointerup',function(e){if(e.pointerType==='mouse'&&e.button===0)mouseHeld=false;});
window.addEventListener('pointercancel',function(){mouseHeld=false;});
document.addEventListener('contextmenu',function(e){if(isTouchDevice||(e.target.closest&&e.target.closest('#stage')))e.preventDefault();});

// ---- keyboard ----
document.addEventListener('keydown',function(e){
  if(e.target&&e.target.tagName==='INPUT')return;
  var k=e.key.toLowerCase();
  if(state==='playing'&&(k===' '||k.indexOf('arrow')===0))e.preventDefault();
  keys[k]=true;
  if(e.repeat)return;
  unlockAudio();
  if(k==='p'||k==='escape'){togglePause();e.preventDefault();}
  else if(k==='m')toggleMute();
  else if(k==='shift')doDodge();
  else if(k==='e')activateAbility();
});
document.addEventListener('keyup',function(e){
  var k=e.key.toLowerCase();keys[k]=false;
  if(k===' '&&state==='playing')e.preventDefault(); // stops Space from "clicking" a focused HUD button
});

// ---- HUD buttons: never keep keyboard focus after a click/tap ----
(function(){
  var map={'pause-hud-btn':togglePause,'mute-btn':toggleMute,'fs-btn':toggleFullscreen};
  Object.keys(map).forEach(function(id){
    var b=document.getElementById(id);
    b.addEventListener('mousedown',function(e){e.preventDefault();});
    b.addEventListener('click',function(){unlockAudio();map[id]();b.blur();});
  });
  if(isTouchDevice&&canFullscreen())document.getElementById('fs-btn').hidden=false;
})();

// ---- touch sticks (pointer events + capture, so two thumbs work independently) ----
function setupStick(el,onMove,onEnd){
  var pid=null,cx=0,cy=0,maxR=40,nub=el.querySelector('.joy-nub');
  function upd(e){
    var dx=e.clientX-cx,dy=e.clientY-cy,d=Math.sqrt(dx*dx+dy*dy),k=d>maxR?maxR/d:1;dx*=k;dy*=k;
    nub.style.transform='translate('+dx+'px,'+dy+'px)';
    onMove(dx/maxR,dy/maxR,Math.min(1,d/maxR));
  }
  function end(e){
    if(e.pointerId!==pid)return;
    pid=null;nub.style.transform='';el.classList.remove('held');onEnd();
  }
  el.addEventListener('pointerdown',function(e){
    if(pid!==null)return;
    e.preventDefault();unlockAudio();pid=e.pointerId;
    try{el.setPointerCapture(pid);}catch(err){}
    var r=el.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;maxR=r.width*0.34;
    el.classList.add('held');upd(e);
  });
  el.addEventListener('pointermove',function(e){if(e.pointerId===pid){e.preventDefault();upd(e);}});
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
}
setupStick(document.getElementById('joy-move'),function(nx,ny,mag){
  if(mag<0.18){joyMove.active=false;return;}
  var m=Math.min(1,(mag-0.18)/0.67); // dead zone, then ramps to full speed before the rim
  joyMove.active=true;joyMove.x=nx/mag*m;joyMove.y=ny/mag*m;
},function(){joyMove.active=false;});
setupStick(document.getElementById('joy-aim'),function(nx,ny,mag){
  if(mag<0.2){touchAim.active=false;return;}
  touchAim.active=true;touchAim.angle=Math.atan2(ny,nx);
},function(){touchAim.active=false;});
function bindTouchButton(id,fn){
  document.getElementById(id).addEventListener('pointerdown',function(e){e.preventDefault();unlockAudio();fn();});
}
bindTouchButton('ability-btn',activateAbility);
bindTouchButton('dodge-btn',doDodge);

// ---- losing focus pauses the run and clears held keys ----
function autoPause(){releaseInputs();if(state==='playing'&&!paused)togglePause();}
window.addEventListener('blur',autoPause);
document.addEventListener('visibilitychange',function(){if(document.hidden)autoPause();});
