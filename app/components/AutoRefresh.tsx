"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refresca los datos SSR cada INTERVAL ms usando router.refresh()
// sin recargar la pagina — actualiza la linea OBS con el METAR mas reciente
const INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

export default function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);
  return null; // componente invisible
}