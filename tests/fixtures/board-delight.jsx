import React from 'react';
import {createRoot} from 'react-dom/client';
import {BoardLayer} from '../../src/renderer/board/BoardLayer';
import {exportPng,exportSvg} from '../../src/renderer/board/export';
import {recordBoardVideo} from '../../src/renderer/board/video';
import '../../src/renderer/tokens.css';
import '../../src/renderer/styles/base.css';
import '../../src/renderer/styles/board.css';
createRoot(document.getElementById('root')).render(<BoardLayer/>);
window.phase5={
 async svg(elements){return exportSvg(document.querySelector('.board-svg'),elements);},
 async png(elements){return Array.from(await exportPng(document.querySelector('.board-svg'),elements));},
 async record(plan){return Array.from(await recordBoardVideo(plan,async beat=>{const reply=await window.kite.boardNarration(plan.token,beat);if(!reply.ok)throw Error(reply.error);return reply.audio;},new AbortController().signal,()=>{}));},
 async cancel(plan){const controller=new AbortController();setTimeout(()=>controller.abort(),200);try{await recordBoardVideo(plan,async beat=>(await window.kite.boardNarration(plan.token,beat)).audio,controller.signal,()=>{});return false;}catch{return document.querySelectorAll('div[style*="10000"]').length===0;}},
 async decode(bytes){const data=new Uint8Array(bytes),audio=new AudioContext(),buffer=await audio.decodeAudioData(data.slice().buffer).catch(e=>{throw Error('Audio decoding: '+e.message)}),samples=buffer.getChannelData(0),rms=Math.sqrt(samples.reduce((s,n)=>s+n*n,0)/samples.length);await audio.close();
   const url=URL.createObjectURL(new Blob([data],{type:'video/webm'})),video=document.createElement('video');video.muted=true;video.src=url;
   await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error('Video decoding: '+video.error?.message));});
   if (!Number.isFinite(video.duration)) await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error(video.error?.message));video.currentTime=1e6;});
   const duration=Number.isFinite(video.duration)?video.duration:video.currentTime;
   const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const ctx=canvas.getContext('2d');
   const frames=[];for(const time of [.25,duration-.3]){await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=()=>reject(Error(video.error?.message));video.currentTime=time;});await video.play();await new Promise(resolve=>setTimeout(resolve,120));video.pause();ctx.drawImage(video,0,0);let ink=0;const pixels=ctx.getImageData(0,0,canvas.width,600).data;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])>200)ink++;frames.push({time,ink,png:canvas.toDataURL('image/png')});}
   URL.revokeObjectURL(url);video.src='';return{duration,audioSeconds:buffer.duration,rms,width:canvas.width,height:canvas.height,frames};
 }
};
