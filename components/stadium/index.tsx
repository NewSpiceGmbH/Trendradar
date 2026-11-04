"use client";

import dynamic from "next/dynamic";

/** Das Stadion läuft nur im Browser (WebGL, Adresse und lokaler Fortschritt). */
export const StadiumView = dynamic(() => import("./stadium-view"), {
  ssr: false,
  loading: () => <p className="grid h-[calc(100dvh-57px)] place-items-center text-muted">Stadion wird aufgebaut …</p>,
});
