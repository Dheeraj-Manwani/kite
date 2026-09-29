// Reproducible local measurement. Fresh profile, no keys/network calls, simulated cursor.
const { app, BrowserWindow, screen, session }=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'kite-perf-')));
process.env.KITE_TEST_MODE='1';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let moving=false,started=performance.now();
app.whenReady().then(()=>{
  const bounds=screen.getPrimaryDisplay().bounds;
  screen.getCursorScreenPoint=()=>({x:bounds.x+Math.round(bounds.width/2+(moving?Math.sin((performance.now()-started)/350)*220:0)),y:bounds.y+Math.round(bounds.height/2+(moving?Math.cos((performance.now()-started)/500)*100:0))});
  const original=session.defaultSession.setPermissionRequestHandler.bind(session.defaultSession);
  session.defaultSession.setPermissionRequestHandler=()=>original((_w,_p,cb)=>cb(false));
});
require('../.vite/build/main.js');
const timeout=setTimeout(()=>{console.error('perf timeout');app.exit(1);},95000);
app.whenReady().then(async()=>{
  try {
    const win=BrowserWindow.getAllWindows()[0];if(win.webContents.isLoading())await new Promise(r=>win.webContents.once('did-finish-load',r));
    const sample=()=>win.webContents.executeJavaScript('window.kite.getPerf()');
    console.log('Settling to doze for 35 seconds…');await delay(35000);await sample();
    const idle=[];for(let i=0;i<12;i++){await delay(1000);idle.push(await sample());}
    moving=true;started=performance.now();await delay(1500);const motion=[];for(let i=0;i<12;i++){await delay(1000);motion.push(await sample());}
    const avg=(arr,key)=>arr.reduce((sum,x)=>sum+x[key],0)/arr.length;
    const report={measuredAt:new Date().toISOString(),os:process.getSystemVersion(),cpu:os.cpus()[0].model,electron:process.versions.electron,
      method:'Production Vite bundle in Electron, fresh profile, microphone denied, no model/TTS keys, synthetic stationary cursor after 35s then moving cursor; 12 one-second samples per phase. MB is process working-set sum (shared pages may be counted more than once). CPU is summed Electron process percentCPUUsage, not system-wide CPU.',
      idle:{cpuPercent:avg(idle,'cpu'),totalMB:avg(idle,'totalMB'),mainMB:avg(idle,'mainMB'),rendererMB:avg(idle,'rendererMB'),fps:avg(idle,'rendererFPS')},
      moving:{cpuPercent:avg(motion,'cpu'),totalMB:avg(motion,'totalMB'),fps:avg(motion,'rendererFPS'),frameWorkMs:avg(motion,'frameMs')},
      voiceMedianMs:null,voiceSamples:0,idleSamples:idle,movingSamples:motion};
    fs.mkdirSync('docs/performance',{recursive:true});fs.writeFileSync('docs/performance/latest.json',JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({idle:report.idle,moving:report.moving,voiceSamples:0}));
  }catch(e){console.error(e);process.exitCode=1;}
  finally{clearTimeout(timeout);app.exit(process.exitCode||0);}
});
