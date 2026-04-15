"use client";
import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
const CITY_INTERVAL=2*60*1000;
const HOME_INTERVAL=3*60*1000;
export default function AutoRefresh(){
  const router=useRouter();
  const pathname=usePathname();
  const isHovering=useRef(false);
  useEffect(()=>{
    const interval=pathname?.startsWith('/city/')?CITY_INTERVAL:HOME_INTERVAL;
    const onEnter=()=>{isHovering.current=true;};
    const onLeave=()=>{isHovering.current=false;};
    document.addEventListener('mouseenter',onEnter,true);
    document.addEventListener('mouseleave',onLeave,true);
    const id=setInterval(()=>{ if(!isHovering.current) router.refresh(); },interval);
    return()=>{ clearInterval(id); document.removeEventListener('mouseenter',onEnter,true); document.removeEventListener('mouseleave',onLeave,true); };
  },[router,pathname]);
  return null;
}