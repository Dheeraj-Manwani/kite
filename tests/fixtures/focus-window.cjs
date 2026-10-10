// A separate process with two blank editors; the parent tests exact-window focus and paste.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'kite-focus-editor-')));
const windows=[];
const channel=process.argv[process.argv.length-1];
const reply=value=>fs.writeFileSync(path.join(channel,'response.json'),JSON.stringify(value));
reply({starting:true});
app.whenReady().then(async()=>{
  for(const name of ['A','B']) {
    const win=new BrowserWindow({title:'Kite focus fixture '+name,width:480,height:280,x:100+(name==='A'?0:500),y:100,show:false,webPreferences:{backgroundThrottling:false}});
    await win.loadURL('data:text/html,'+encodeURIComponent(`<html><head><title>Kite focus fixture ${name}</title></head><body><label>Test editor ${name}<textarea autofocus></textarea></label></body></html>`));windows.push(win);
  }
  let busy=false,last=0;
  setInterval(async()=>{
    if(busy||!fs.existsSync(path.join(channel,'request.json')))return;
    const r=JSON.parse(fs.readFileSync(path.join(channel,'request.json'),'utf8'));if(r.id===last)return;last=r.id;busy=true;
    try {const win=windows[r.window??0];let result;
      if(r.op==='focus'){win.show();win.focus();await win.webContents.executeJavaScript("document.querySelector('textarea').focus()");const handle=win.getNativeWindowHandle();result={hwnd:Number(handle.length===8?handle.readBigUInt64LE():handle.readUInt32LE()),pid:process.pid};}
      else if(r.op==='value')result=await win.webContents.executeJavaScript("document.querySelector('textarea').value");
      else if(r.op==='rename'){win.setTitle('Changed fixture');await win.webContents.executeJavaScript("document.title='Changed fixture'");result=true;}
      else if(r.op==='close'){win.destroy();result=true;}
      else if(r.op==='quit'){app.quit();return;}
      reply({id:r.id,result});
    }catch{reply({id:r.id,error:'Fixture request failed'});}finally{busy=false;}
  },20);
  reply({ready:true});
});
