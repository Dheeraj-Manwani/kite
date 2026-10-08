import React from 'react';
import {createRoot} from 'react-dom/client';
import {loadFromBlob, restoreElements} from '@excalidraw/excalidraw';
import mermaid from 'mermaid';
import {BoardLayer} from '../../src/renderer/board/BoardLayer';
import {exportPng,exportSvg} from '../../src/renderer/board/export';
import '../../src/renderer/tokens.css';
import '../../src/renderer/styles/base.css';
import '../../src/renderer/styles/board.css';
mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'default'});
createRoot(document.getElementById('root')).render(<BoardLayer/>);
let counter=0;
window.phase4={
 async validate(json){const loaded=await loadFromBlob(new Blob([JSON.stringify(json)],{type:'application/json'}),null,null);const clipboard=restoreElements(json.elements,null,{repairBindings:true});return {elements:loaded.elements,files:loaded.files,clipboard};},
 async mermaid(source){const result=await mermaid.render(`diagram${counter++}`,source);return result.svg;},
 async svg(elements){return exportSvg(document.querySelector('.board-svg'),elements);},
 async png(elements){return Array.from(await exportPng(document.querySelector('.board-svg'),elements));}
};
