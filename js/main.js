// ===== BOOT =====
loadSettings();
selMode=settings.mode;selStage=settings.stage;selChar=settings.char;
setVolume(settings.vol);setMuted(settings.muted);
setQuality(settings.quality);
if(isTouchDevice)document.body.classList.add('touch-device');
fitGame();
window.addEventListener('resize',fitGame);
window.addEventListener('orientationchange',function(){setTimeout(fitGame,120);});
document.addEventListener('fullscreenchange',function(){setTimeout(fitGame,120);});
if(window.ResizeObserver)new ResizeObserver(fitGame).observe(document.getElementById('stage'));
requestAnimationFrame(fitGame);
showMenu();
requestAnimationFrame(loop);
// Offline play + "Add to Home Screen". Skipped inside the Capacitor APK and on file://
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&!window.Capacitor){
  window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});
}
