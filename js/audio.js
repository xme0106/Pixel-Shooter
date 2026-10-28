// ===== SOUND ENGINE (Web Audio API — no files needed) =====
var _ac=null,_master=null,_muted=false,_vol=0.8;
function getAC(){
  if(!_ac){
    _ac=new(window.AudioContext||window.webkitAudioContext)();
    _master=_ac.createGain();_master.gain.value=_muted?0:_vol;_master.connect(_ac.destination);
  }
  if(_ac.state==='suspended')_ac.resume(); // mobile browsers start suspended until a user gesture
  return _ac;
}
function unlockAudio(){try{getAC();}catch(e){}}
function setVolume(v){_vol=Math.max(0,Math.min(1,v));if(_master)_master.gain.value=_muted?0:_vol;}
function setMuted(m){_muted=!!m;if(_master)_master.gain.value=_muted?0:_vol;var b=document.getElementById('mute-btn');if(b)b.textContent=_muted?'\uD83D\uDD07':'\uD83D\uDD0A';}

function sfxTone(freq,type,dur,vol,freqEnd,delay){
  if(_muted)return;
  try{var c=getAC(),t=c.currentTime+(delay||0),o=c.createOscillator(),g=c.createGain();
  o.connect(g);g.connect(_master);o.type=type||'square';
  o.frequency.setValueAtTime(freq,t);
  if(freqEnd!=null)o.frequency.exponentialRampToValueAtTime(freqEnd,t+dur); // != null: callers pass null for 'no sweep'
  g.gain.setValueAtTime(Math.min(vol||0.12,1),t);
  g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.start(t);o.stop(t+dur);}catch(e){}
}
function sfxNoise(dur,vol,f1,f2,delay){
  if(_muted)return;
  try{var c=getAC(),t=c.currentTime+(delay||0),sr=c.sampleRate,n=Math.ceil(sr*dur),buf=c.createBuffer(1,n,sr),d=buf.getChannelData(0);
  for(var i=0;i<n;i++)d[i]=Math.random()*2-1;
  var src=c.createBufferSource();src.buffer=buf;
  var filt=c.createBiquadFilter();filt.type='bandpass';
  filt.frequency.setValueAtTime(f1||800,t);
  if(f2)filt.frequency.exponentialRampToValueAtTime(f2,t+dur);
  var g=c.createGain();g.gain.setValueAtTime(Math.min(vol||0.18,1),t);
  g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  src.connect(filt);filt.connect(g);g.connect(_master);
  src.start(t);src.stop(t+dur);}catch(e){}
}

function sfxShoot(){
  if(selChar==='tank'){sfxTone(180,'square',0.14,0.1,60);}
  else if(selChar==='scout'){sfxTone(700,'square',0.06,0.09,350);}
  else if(selChar==='gunner'){sfxTone(500,'square',0.07,0.07,280);}
  else if(selChar==='laser'){sfxTone(900,'sawtooth',0.05,0.04,1200);}
}
function sfxSwing(full){
  sfxNoise(0.13,full?0.28:0.18,full?250:600,full?70:180);
  sfxTone(full?120:220,'sawtooth',0.11,0.08,full?50:100);
}
function sfxKill(){sfxTone(320,'square',0.1,0.08,80);}
function sfxBossKill(){
  sfxNoise(0.6,0.35,600,30);sfxTone(100,'sawtooth',0.5,0.18,35);
  sfxTone(440,'square',0.15,0.1,110,0.1);
}
function sfxExplosion(){
  sfxNoise(0.4,0.35,900,35);sfxTone(70,'sine',0.35,0.22,28);
}
function sfxHurt(){
  sfxTone(160,'sawtooth',0.2,0.22,80);sfxNoise(0.15,0.18,180,90);
}
function sfxPickup(type){
  if(type==='heart'){sfxTone(523,'sine',0.09,0.13);sfxTone(784,'sine',0.12,0.13,null,0.09);}
  else if(type==='boots'){sfxTone(350,'square',0.08,0.1,900);}
  else if(type==='shield'){sfxTone(660,'sine',0.13,0.1);sfxTone(990,'sine',0.1,0.07);}
  else if(type==='sword'){sfxNoise(0.09,0.14,900,400);sfxTone(440,'sawtooth',0.12,0.08,220);}
  else{[523,659,784,1047].forEach(function(f,i){sfxTone(f,'sine',0.1,0.15,null,i*0.065);});}
}
function sfxWaveUp(){sfxTone(330,'square',0.07,0.1,660);sfxTone(440,'square',0.09,0.1,880,0.1);}
function sfxBossAlert(){
  sfxNoise(0.5,0.2,90,55);sfxTone(55,'sawtooth',0.7,0.22,40);
  sfxTone(220,'square',0.15,0.12,110,0.25);
}
function sfxAbility(){
  if(selChar==='tank'){sfxNoise(0.3,0.28,350,70);sfxTone(110,'sine',0.35,0.18,45);}
  else if(selChar==='scout'){sfxNoise(0.12,0.22,1400,250);}
  else if(selChar==='gunner'){sfxTone(440,'square',0.05,0.1,1100);}
  else if(selChar==='warrior'){sfxNoise(0.18,0.28,550,180);sfxTone(180,'sawtooth',0.28,0.15,90);}
  else if(selChar==='laser'){sfxTone(180,'sawtooth',0.07,0.18,1000);sfxNoise(0.2,0.22,500,1400);}
  else if(selChar==='turret'){sfxTone(440,'sine',0.12,0.1);sfxTone(880,'sine',0.09,0.1,null,0.06);}
}
function sfxGameOver(){
  [440,330,220,165].forEach(function(f,i){sfxTone(f,'sawtooth',0.35,0.14,f*0.65,i*0.22);});
}
// Turrets: quieter than the player's weapons so two or three firing together don't drown everything
function sfxTurretShot(){sfxTone(1050,'square',0.05,0.035,460);}
function sfxTurretLaser(){sfxTone(240,'sawtooth',0.3,0.05,1150);sfxNoise(0.2,0.05,2600,900);}
function sfxTurretPulse(){sfxNoise(0.2,0.08,750,180);sfxTone(170,'sine',0.2,0.08,65);}
function sfxLaserLoop(){sfxTone(85,'sawtooth',0.18,0.04,130);}
function toggleMute(){setMuted(!_muted);if(typeof settings!=='undefined'){settings.muted=_muted;saveSettings();}}
// ===== END SOUND ENGINE =====
