import { useEffect, useMemo, useState, type RefObject } from 'react';
import { getStroke } from 'perfect-freehand';
import { elementBounds, layoutScene, type BoardView, type Camera, type ElementInput, type LaidElement, type Point } from '../../shared/board';
import { boardOutline, moveInput, rerouteInput, type BoardEdit } from '../../shared/boardEditing';
import type { BoardExportFormat } from '../../shared/boardExports';
import { exportPng, exportSvg } from './export';
type Tool = 'select' | 'pen' | 'arrow' | 'text' | 'eraser';
const newId = () => `user_${crypto.randomUUID().replace(/-/g,'').slice(0,28)}`;
function hit(elements: LaidElement[], p: Point) {
  return [...elements].reverse().find(e => { const b = elementBounds(e); if (p.x < b.x - 6 || p.x > b.x + b.width + 6 || p.y < b.y - 6 || p.y > b.y + b.height + 6) return false;
    if (e.kind !== 'arrow' && e.kind !== 'line') return true;
    return e.points.slice(1).some((q,i) => { const a=e.points[i],dx=q.x-a.x,dy=q.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1))); return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<12; }); });
}
export function useBoardEditor(view: BoardView | null, svg: RefObject<SVGSVGElement | null>, cam: Camera, hold: () => void) {
  const [tool,setTool]=useState<Tool>('select'),[selected,setSelected]=useState<string>(),[move,setMove]=useState<{id:string;dx:number;dy:number}>(),[stroke,setStroke]=useState<Point[]>([]);
  const [label,setLabel]=useState<{id:string;text:string;point?:Point}>(),[question,setQuestion]=useState('What does this part do?'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{setSelected(undefined);setMove(undefined);setStroke([]);setLabel(undefined);setTool('select');setMessage('');},[view?.id]);
  const elements = useMemo(()=>{
    if (!move || !view?.inputs) return view?.elements ?? [];
    return layoutScene(view.inputs.map(e=>e.id===move.id?moveInput(e,move.dx,move.dy):e.type==='arrow'&&(e.from===move.id||e.to===move.id)?rerouteInput(e):e));
  },[view?.elements,view?.inputs,move]);
  const outline=useMemo(()=>boardOutline(elements),[elements]);
  const edit=async(action:BoardEdit)=>{if(!view)return;const result=await window.kite.editBoard(view.id,action);if(!result.ok)setMessage(result.error??'Could not edit this element.');};
  const point=(x:number,y:number)=>{const matrix=svg.current?.getScreenCTM()?.inverse();if(!matrix)return{x:0,y:0};const p=new DOMPoint(x,y).matrixTransform(matrix);return{x:p.x,y:p.y};};
  const pause=()=>{hold();if(view?.status==='playing')window.kite.boardControl('pause');};
  const ask=async(ids:string[],text:string)=>{if(!view)return;pause();setMessage('');const result=await window.kite.askBoard(view.id,ids,text);if(!result.ok)setMessage(result.error??'Could not ask about the board.');};
  const start=(e:React.PointerEvent<HTMLDivElement>)=>{
    if ((e.target as Element).closest('button,input,form,details')) return true;
    if (view?.editable && !(e.target as Element).closest('.board-svg')) return true;
    if(!view?.editable||e.button!==0||e.altKey)return false;
    const p=point(e.clientX,e.clientY),found=hit(elements,p);
    if(tool==='select'&&!found){setSelected(undefined);return false;}
    pause();e.preventDefault();const target=e.currentTarget;
    if(tool==='text'){setLabel({id:newId(),text:'',point:p});return true;}
    if(tool==='eraser'){if(found){void edit({type:'delete',id:found.id});setSelected(undefined);}return true;}
    if(found&&tool==='select'){setSelected(found.id);setQuestion('What does this part do?');svg.current?.querySelector<SVGGElement>(`[data-focus="${CSS.escape(found.id)}"]`)?.focus();}
    target.setPointerCapture(e.pointerId);const points=[p];let dx=0,dy=0;
    const onMove=(m:PointerEvent)=>{const q=point(m.clientX,m.clientY);dx=q.x-p.x;dy=q.y-p.y;
      if(tool==='select')setMove({id:found.id,dx,dy});else{if(points.length<2048&&Math.hypot(q.x-points.at(-1).x,q.y-points.at(-1).y)>1/cam.scale)points.push(q);setStroke(tool==='arrow'?[p,q]:points.slice());}};
    const up=(m:PointerEvent)=>{target.removeEventListener('pointermove',onMove);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',cancel);
      if(tool==='select'){if(Math.hypot(dx,dy)>2){void edit({type:'move',id:found.id,dx,dy}).finally(()=>setMove(undefined));}else setMove(undefined);}
      else{const q=point(m.clientX,m.clientY);const last=hit(elements,q);if(Math.hypot(q.x-p.x,q.y-p.y)>3){const element:ElementInput={id:newId(),type:tool==='arrow'?'arrow':'line',points:tool==='arrow'?[p,q]:points,freehand:tool==='pen',user:true,
        ...(tool==='arrow'?{from:found?.kind==='shape'||found?.kind==='text'?found.id:undefined,to:last?.kind==='shape'||last?.kind==='text'?last.id:undefined}:{}),color:'blue'};void edit({type:'add',element});}setStroke([]);}};
    const cancel=()=>{target.removeEventListener('pointermove',onMove);target.removeEventListener('pointerup',up);target.removeEventListener('pointercancel',cancel);setMove(undefined);setStroke([]);};
    target.addEventListener('pointermove',onMove);target.addEventListener('pointerup',up);target.addEventListener('pointercancel',cancel);return true;
  };
  const editLabel=(id:string)=>{const e=view?.inputs?.find(e=>e.id===id);if(!e||!['rectangle','ellipse','diamond','text','arrow'].includes(e.type))return;pause();setSelected(id);setLabel({id,text:e.text??e.label??''});};
  const onKey=(e:React.KeyboardEvent)=>{
    if(!view?.editable||(e.target as HTMLElement).closest('input,textarea,select'))return;
    const id=(e.target as Element).closest('[data-focus]')?.getAttribute('data-focus');
    if(e.key==='Enter'&&id){e.preventDefault();void ask([id],'What does this part do?');}
    if(e.key===' '&&!(e.target as Element).closest('button,summary')){e.preventDefault();window.kite.boardControl(view.status==='playing'?'pause':'resume');}
    if((e.key==='Delete'||e.key==='Backspace')&&(id||selected)){e.preventDefault();void edit({type:'delete',id:id??selected});setSelected(undefined);}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();void edit({type:e.shiftKey?'redo':'undo'});}
    if(e.key==='F2'&&id){e.preventDefault();editLabel(id);}
    if(e.key==='Escape'){setSelected(undefined);setLabel(undefined);setTool('select');}
  };
  const share=async(format:BoardExportFormat)=>{if(!view||busy)return;setBusy(true);setMessage('');try{pause();const content=format==='svg'?await exportSvg(svg.current,view.elements):format==='pdf'?await exportPng(svg.current,view.elements):undefined;
    const result=await window.kite.exportBoardFile(format,view.id,view.revision,content);setMessage(result.ok?(format==='excalidraw-open'?'Opened in Excalidraw.':format==='excalidraw-clipboard'?'Copied editable elements.':'Saved to Documents › Kite Boards.'):result.error??'Could not export.');}catch{setMessage('Could not export the board.');}finally{setBusy(false);}};
  const selectedElement=elements.find(e=>e.id===selected),box=selectedElement&&elementBounds(selectedElement);
  const ink=getStroke(stroke.map(p=>[p.x,p.y]),{size:4,simulatePressure:true});
  const overlay=view?.editable?<g data-transient="1">
    {box&&<rect x={box.x-5} y={box.y-5} width={box.width+10} height={box.height+10} fill="none" stroke="#1971c2" strokeWidth={2/cam.scale} strokeDasharray={`${5/cam.scale} ${4/cam.scale}`} pointerEvents="none"/>}
    {!!stroke.length&&(tool==='arrow'?<path d={`M${stroke[0].x} ${stroke[0].y}L${stroke.at(-1).x} ${stroke.at(-1).y}`} stroke="#1971c2" strokeWidth={2} fill="none" pointerEvents="none"/>:<path d={`M${ink.map(p=>p.join(',')).join('L')}Z`} fill="#1971c2" pointerEvents="none"/>)}
  </g>:null;
  const ui=view?.editable?<>
    <div className="board-editor-tools" role="toolbar" aria-label="Sketch tools">{(['select','pen','arrow','text','eraser'] as Tool[]).map(t=><button key={t} aria-pressed={tool===t} onClick={()=>{pause();setTool(t);}}>{t[0].toUpperCase()+t.slice(1)}</button>)}
      <button disabled={!view.canUndo} onClick={()=>void edit({type:'undo'})}>Undo</button><button disabled={!view.canRedo} onClick={()=>void edit({type:'redo'})}>Redo</button>
      <button onClick={()=>void ask([],'Is my sketch on this board right? Please explain any mistakes.')}>Is this right?</button>
    </div>
    {selected&&!label&&<form className="board-ask-chip" onSubmit={e=>{e.preventDefault();void ask([selected],question);}}><label className="sr-only" htmlFor="board-question">Question about selected element</label><input id="board-question" maxLength={500} value={question} onChange={e=>setQuestion(e.target.value)}/><button type="submit">Ask about this</button><button type="button" onClick={()=>editLabel(selected)}>Edit label</button><button type="button" onClick={()=>{void edit({type:'delete',id:selected});setSelected(undefined);}}>Delete</button></form>}
    {label&&<form className="board-ask-chip" onSubmit={e=>{e.preventDefault();if(!label.text.trim())return;void edit(label.point?{type:'add',element:{id:label.id,type:'text',text:label.text,x:label.point.x,y:label.point.y}}:{type:'label',id:label.id,text:label.text});setLabel(undefined);}}><label htmlFor="board-label">Label</label><input id="board-label" autoFocus maxLength={500} value={label.text} onChange={e=>setLabel({...label,text:e.target.value})}/><button type="submit">Apply</button><button type="button" onClick={()=>setLabel(undefined)}>Cancel</button></form>}
    <details className="board-export-menu"><summary>Export</summary><div>{(['svg','excalidraw','excalidraw-clipboard','excalidraw-open','mermaid','pdf'] as BoardExportFormat[]).map(f=><button key={f} disabled={busy} onClick={()=>void share(f)}>{({'svg':'SVG','excalidraw':'.excalidraw','excalidraw-clipboard':'Copy editable elements','excalidraw-open':'Open in Excalidraw','mermaid':'Mermaid for GitHub','pdf':'PDF with notes'})[f]}</button>)}</div></details>
    <details className="board-outline"><summary>Board outline ({outline.length})</summary><ol>{outline.map(n=><li key={n.id}><button data-focus={n.id} onClick={()=>{setSelected(n.id);void ask([n.id],'What does this part do?');}}>{n.label}</button></li>)}</ol></details>
    {!!message&&<div className="board-editor-message" role="status">{message}</div>}
  </>:null;
  return{elements,outline,selected,start,onKey,editLabel,overlay,ui,setSelected};
}
