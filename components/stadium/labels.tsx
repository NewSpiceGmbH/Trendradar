"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/**
 * Beschriftungen als normale HTML-Ebene über der Szene (statt drei/Html mit eigenem React-Root je Label):
 * Die Szene meldet für jede Beschriftung einen 3D-Anker, der Projector schreibt pro Bild die Bildschirmposition
 * direkt in den Style des Elements. Die Elemente selbst rendert React im normalen Baum (Tastatur, Fokus, Screenreader).
 */
export interface LabelRegistry {
  anchors: Map<string, (out: THREE.Vector3) => boolean>;
  elements: Map<string, HTMLElement>;
}

export const createRegistry = (): LabelRegistry => ({ anchors: new Map(), elements: new Map() });

/** Ref-Callback für ein Label-Element */
export const labelRef = (reg: LabelRegistry, id: string) => (el: HTMLElement | null) => {
  if (el) reg.elements.set(id, el);
  else reg.elements.delete(id);
};

// DOM-Schreibzugriffe außerhalb der Komponente: Positionen ändern sich pro Bild, nicht über React-State
function hide(el: HTMLElement) {
  el.style.visibility = "hidden";
}
function place(el: HTMLElement, x: number, y: number) {
  el.style.visibility = "visible";
  el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
}

function project(registry: LabelRegistry, camera: THREE.Camera, width: number, height: number, v: THREE.Vector3) {
  for (const [id, el] of registry.elements) {
    const anchor = registry.anchors.get(id);
    if (!anchor || !anchor(v)) {
      hide(el);
      continue;
    }
    v.project(camera);
    if (v.z > 1) hide(el);
    else place(el, ((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height);
  }
}

export function Projector({ registry }: { registry: LabelRegistry }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => project(registry, camera, size.width, size.height, v));
  return null;
}
