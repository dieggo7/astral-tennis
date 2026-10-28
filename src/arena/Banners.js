import * as THREE from 'three';
import { makeCanvas } from '../utils/textures.js';

/** Estandarte com bússola dourada, borda dourada e ponta em V (recorte por alpha). */
function createBannerTexture() {
  const W = 256, H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  const tail = 70;

  // Forma com ponta em V
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(W, H);
  ctx.lineTo(W / 2, H - tail);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#4a2fb8');
  g.addColorStop(0.55, '#2a2f9a');
  g.addColorStop(1, '#1a1c6a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Brilho central
  const rg = ctx.createRadialGradient(W / 2, 200, 10, W / 2, 200, 190);
  rg.addColorStop(0, 'rgba(160,140,255,0.45)');
  rg.addColorStop(1, 'rgba(160,140,255,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Borda dourada seguindo a forma
  ctx.strokeStyle = '#ffd25e';
  ctx.lineWidth = 9;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(14, 14);
  ctx.lineTo(W - 14, 14);
  ctx.lineTo(W - 14, H - 38);
  ctx.lineTo(W / 2, H - tail - 22);
  ctx.lineTo(14, H - 38);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, W - 60, 22);

  // Bússola
  const cx = W / 2, cy = 215;
  ctx.fillStyle = '#ffd25e';
  ctx.strokeStyle = '#ffd25e';
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, 98, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, 82, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 98, cy + Math.sin(a) * 98);
    ctx.lineTo(cx + Math.cos(a) * 108, cy + Math.sin(a) * 108);
    ctx.stroke();
  }
  const star = (len, wid, rot, fill) => {
    for (let i = 0; i < 4; i += 1) {
      const a = rot + (i * Math.PI) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + ca * len, cy + sa * len);
      ctx.lineTo(cx - sa * wid, cy + ca * wid);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + ca * len, cy + sa * len);
      ctx.lineTo(cx + sa * wid, cy - ca * wid);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fillStyle = '#c99a2a';
      ctx.fill();
    }
  };
  star(66, 15, Math.PI / 4, '#ffe08a');
  star(92, 20, 0, '#ffd25e');
  ctx.fillStyle = '#2a2f9a';
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd25e';
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.font = 'bold 34px serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', cx, cy - 116);

  // Ornamentos inferiores
  ctx.beginPath();
  ctx.moveTo(cx, 380); ctx.lineTo(cx + 24, 410); ctx.lineTo(cx, 440); ctx.lineTo(cx - 24, 410);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const BANNER_W = 1.4, BANNER_H = 2.8;

export class Banners {
  constructor(courtConfig, barrierConfig) {
    this.group = new THREE.Group();
    this.timeUniform = { value: 0 };

    const tex = createBannerTexture();
    const clothMat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.3,
      side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.7,
    });
    const timeUniform = this.timeUniform;
    // Ondulação de tecido no vertex shader: amplitude cresce da haste (topo) para a ponta.
    clothMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = timeUniform;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
         float k = clamp((${(BANNER_H / 2).toFixed(2)} - position.y) / ${BANNER_H.toFixed(2)}, 0.0, 1.0);
         float ph = modelMatrix[3].x * 0.7 + modelMatrix[3].z * 1.3;
         float wv = sin(position.y * 2.2 - uTime * 2.4 + ph) + 0.5 * sin(position.y * 4.1 - uTime * 3.7 + ph * 1.7 + position.x * 2.0);
         transformed.z += wv * 0.13 * k * (0.4 + k);
         transformed.x -= k * k * 0.06 * sin(uTime * 1.8 + ph);`,
      );
    };

    const poleMat = new THREE.MeshStandardMaterial({ color: '#3b467f', roughness: 0.5, metalness: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#ffc94d', emissive: '#ffb02e', emissiveIntensity: 0.7, metalness: 0.9, roughness: 0.3 });
    const clothGeo = new THREE.PlaneGeometry(BANNER_W, BANNER_H, 8, 24);
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 1, 8);
    const barGeo = new THREE.CylinderGeometry(0.04, 0.04, BANNER_W + 0.3, 8);
    const finialGeo = new THREE.OctahedronGeometry(0.14, 0);

    const hw = courtConfig.width / 2 + courtConfig.margin - 0.35;
    const hl = courtConfig.length / 2 + courtConfig.margin - 0.35;
    const spots = [
      // 2 por obelisco (um de cada lado da barreira, na borda da laje)
      { x: -hw, z: 1.7, face: 0 }, { x: -hw, z: -1.7, face: 0 },
      { x: hw, z: 1.7, face: 0 }, { x: hw, z: -1.7, face: 0 },
      // 4 nos cantos, virados para o centro da quadra
      { x: -hw, z: -hl }, { x: hw, z: -hl }, { x: -hw, z: hl }, { x: hw, z: hl },
    ];
    const barY = 4.1;

    spots.forEach((s) => {
      const holder = new THREE.Group();
      holder.position.set(s.x, 0.15, s.z);
      holder.rotation.y = s.face !== undefined ? s.face : Math.atan2(-s.x, -s.z) + Math.PI;
      if (s.face === undefined) holder.rotation.y = Math.atan2(-s.x, -s.z);

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.scale.y = barY + 0.1;
      pole.position.y = (barY + 0.1) / 2;
      pole.castShadow = true;
      holder.add(pole);

      const bar = new THREE.Mesh(barGeo, goldMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = barY;
      holder.add(bar);

      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.scale.y = 1.6;
      finial.position.y = barY + 0.35;
      holder.add(finial);

      const cloth = new THREE.Mesh(clothGeo, clothMat);
      cloth.position.set(0, barY - BANNER_H / 2 - 0.06, 0.08);
      cloth.castShadow = true;
      holder.add(cloth);

      this.group.add(holder);
    });
  }

  update(time) {
    this.timeUniform.value = time;
  }
}
