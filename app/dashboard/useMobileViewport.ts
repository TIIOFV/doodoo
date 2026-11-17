'use client';
import {useEffect} from 'react';

/** Match the visible viewport in Safari and standalone mode, including the software keyboard. */
export function useMobileViewport(){
 useEffect(()=>{
  const viewport=window.visualViewport, root=document.documentElement;
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   if((viewport?.scale||1)>1.05)return;
   const mobile=window.matchMedia('(max-width:1023px)').matches;
   const height=mobile?(viewport?.height||window.innerHeight):window.innerHeight;
   const editing=document.activeElement?.matches('input,textarea,[contenteditable=true]');
   root.style.setProperty('--app-viewport-height',height+'px');root.style.setProperty('--app-viewport-top',(mobile?viewport?.offsetTop||0:0)+'px');
   root.dataset.keyboardOpen=mobile&&editing&&window.innerHeight-height>120?'true':'false';
  });};
  viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update);document.addEventListener('focusin',update);document.addEventListener('focusout',update);update();
  return()=>{cancelAnimationFrame(frame);viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);document.removeEventListener('focusin',update);document.removeEventListener('focusout',update);root.style.removeProperty('--app-viewport-height');root.style.removeProperty('--app-viewport-top');delete root.dataset.keyboardOpen;};
 },[]);
}
