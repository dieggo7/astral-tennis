import * as THREE from "three";
import { clamp } from "./constants.js";

/** THREE.Color helper kept outside the shared physics/config module. */
export function orbColor(ratio, orbConfig, target = new THREE.Color()) {
  const stops = orbConfig.colorStops;
  const r = clamp(ratio, 0, 1);
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i], b = stops[i + 1];
    if (r >= a.t && r <= b.t) {
      const t = (r - a.t) / (b.t - a.t);
      return target.set(a.color).lerp(new THREE.Color(b.color), t);
    }
  }
  return target.set(stops[stops.length - 1].color);
}

/** World points the fixed camera must keep in frame. */
export function getFitPoints(court, barrier) {
  const hw = court.width / 2 + court.margin;
  const hl = court.length / 2 + court.margin;
  const points = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    points.push(new THREE.Vector3(sx * hw, -0.9, sz * hl));
    points.push(new THREE.Vector3(sx * (hw - 0.4), 4.6, sz * (hl - 0.4)));
    points.push(new THREE.Vector3((sx * court.width) / 2, 3.2, (sz * court.length) / 2));
  }
  points.push(new THREE.Vector3(-barrier.pillarX, 5.6, 0));
  points.push(new THREE.Vector3(barrier.pillarX, 5.6, 0));
  return points;
}
