// A separate process with two blank editors; the parent tests exact-window focus and paste.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),readline=require('node:readline');
app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'kite-focus-editor-')));
const windows=[];
const reply=value=>process.stdout.write(JSON.stringify(value)+'\n');
app.whenReady().then(async()=>{
  for(const name of ['A','B']) {
    const win=new BrowserWindow({title:'Kite focus fixture '+name,width:480,height:280,x:100+(name==='A'?0:500),y:100,show:false});
    await win.loadURL('data:text/html,'+encodeURIComponent(`<html><head><title>Kite focus fixture ${name}</title></head><body><label>Test editor ${name}<textarea autofocus></textarea></label></body></html>`));windows.push(win);
  }
  readline.createInterface({input:process.stdin}).on('line',async line=>{
    try {const r=JSON.parse(line),win=windows[r.window??0];let result;
      if(r.op==='focus'){win.show();win.focus();await win.webContents.executeJavaScript("document.querySelector('textarea').focus()");result=true;}
      else if(r.op==='value')result=await win.webContents.executeJavaScript("document.querySelector('textarea').value");
      else if(r.op==='rename'){win.setTitle('Changed fixture');await win.webContents.executeJavaScript("document.title='Changed fixture'");result=true;}
      else if(r.op==='close'){win.destroy();result=true;}
      else if(r.op==='quit'){app.quit();return;}
      reply({id:r.id,result});
    }catch{reply({error:'Fixture request failed'});}
  });
  reply({ready:true});
});
