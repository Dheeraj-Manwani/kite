// Reproducible Phase 4 validation uses the public editor SDK only in this dev fixture.
const path=require('node:path'),{spawnSync}=require('node:child_process');
(async()=>{const root=path.join(__dirname,'..');await require('vite').build({configFile:false,root,base:'./',logLevel:'error',build:{minify:false,reportCompressedSize:false,outDir:'.vite/phase4-validation',emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/fixtures/board-owned.html')}}});
 const result=spawnSync(require('electron'),[path.join(root,'tests/board-owned-native.cjs')],{stdio:'inherit',cwd:root});process.exitCode=result.status??1;
})().catch(e=>{console.error(e);process.exitCode=1;});
