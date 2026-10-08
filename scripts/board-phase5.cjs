const path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{const root=path.join(__dirname,'..');await require('vite').build({configFile:false,root,base:'./',logLevel:'error',build:{outDir:'.vite/phase5-validation',emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/fixtures/board-delight.html')}}});
 const result=spawnSync(require('electron'),[path.join(root,'tests/board-delight-native.cjs'),...process.argv.slice(2)],{stdio:'inherit',cwd:root});process.exitCode=result.status??1;
})().catch(e=>{console.error(e);process.exitCode=1;});
