// Renders the 1200x675 share card (16:9, fits X/Twitter previews).
import type { DeviceInfo } from './device';
import type { CellResult } from './bench';
import { WORKLOADS } from './workloads';

const C = {
  bg: '#0b0d10', panel: '#111419', line: '#262b33', text: '#f2f3f5', text2: '#b6bcc6', text3: '#858c98',
  noir: '#d95926', circom: '#3987e5',
};
const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)} s` : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`);

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

const bh0 = (rowH: number) => Math.max(12, rowH * 0.3);

export async function drawCard(canvas: HTMLCanvasElement, device: DeviceInfo, results: CellResult[]) {
  await document.fonts.ready;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W * 0.05, 0, 0, W * 0.05, 0, 520);
  g1.addColorStop(0, 'rgba(217,89,38,0.16)'); g1.addColorStop(1, 'rgba(217,89,38,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W * 0.95, 0, 0, W * 0.95, 0, 620);
  g2.addColorStop(0, 'rgba(57,135,229,0.14)'); g2.addColorStop(1, 'rgba(57,135,229,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

  const P = 64;
  // brand
  ctx.fillStyle = C.noir; rr(ctx, P, 58, 20, 6, 3);
  ctx.fillStyle = C.circom; rr(ctx, P, 68, 32, 6, 3);
  ctx.fillStyle = C.text; ctx.font = '700 26px "Space Grotesk", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillText('ProveBench', P + 46, 66);
  ctx.fillStyle = C.text3; ctx.font = '500 18px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
  ctx.fillText('ZK proving, in the browser', W - P, 66);
  ctx.textAlign = 'left';

  // device line
  ctx.fillStyle = C.text; ctx.font = '700 44px "Space Grotesk", sans-serif'; ctx.textBaseline = 'alphabetic';
  const title = `${device.model ?? (device.kind === 'phone' ? 'Phone' : device.os)} · ${device.browser}`;
  ctx.fillText(title.length > 40 ? title.slice(0, 39) + '…' : title, P, 158);
  ctx.fillStyle = C.text2; ctx.font = '400 20px "JetBrains Mono", monospace';
  ctx.fillText(`${device.os} · ${device.cores ?? '?'} threads${device.memory_gb_hint ? ` · ${device.memory_gb_hint} GB hint` : ''} · median prove time`, P, 196);

  // rows
  const ws = WORKLOADS.filter((w) => results.some((r) => r.workload === w.id && !r.error)).slice(0, 5);
  const top = 236, rowH = Math.min(104, (H - top - 84) / Math.max(ws.length, 1));
  const labelW = 250, barX = P + labelW, barMax = W - P - barX - 150;
  ws.forEach((w, i) => {
    const y = top + i * rowH;
    const rs = (['noir-ultrahonk', 'circom-groth16'] as const).map((s) => results.find((r) => r.workload === w.id && r.system === s && !r.error));
    const max = Math.max(...rs.map((r) => r?.prove_ms.median ?? 0), 1);
    ctx.fillStyle = C.text; ctx.font = '500 22px "Space Grotesk", sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText(w.short, P, y + 4 + bh0(rowH) + 3);
    rs.forEach((r, j) => {
      const bh = Math.max(12, rowH * 0.3);
      const by = y + 4 + j * (bh + 6);
      if (!r) {
        ctx.fillStyle = C.text3; ctx.font = '400 15px "JetBrains Mono", monospace';
        ctx.fillText(j === 0 ? 'Noir: n/a' : 'Groth16: n/a', barX, by + bh / 2);
        return;
      }
      const bw = Math.max(4, (r.prove_ms.median / max) * barMax);
      ctx.fillStyle = j === 0 ? C.noir : C.circom;
      rr(ctx, barX, by, bw, bh, 4);
      ctx.fillStyle = C.text; ctx.font = '500 18px "JetBrains Mono", monospace';
      ctx.fillText(fmt(r.prove_ms.median), barX + bw + 12, by + bh / 2);
    });
  });

  // legend + footer
  const fy = H - 44;
  ctx.font = '500 17px "Space Grotesk", sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = C.noir; rr(ctx, P, fy - 7, 14, 14, 3);
  ctx.fillStyle = C.text2; ctx.fillText('Noir / UltraHonk (bb.js)', P + 24, fy);
  ctx.fillStyle = C.circom; rr(ctx, P + 270, fy - 7, 14, 14, 3);
  ctx.fillStyle = C.text2; ctx.fillText('Circom / Groth16 (snarkjs)', P + 294, fy);
  ctx.fillStyle = C.text3; ctx.font = '400 16px "JetBrains Mono", monospace'; ctx.textAlign = 'right';
  ctx.fillText('same circuits · same inputs · @0xholmesdev', W - P, fy);
  ctx.textAlign = 'left';
}
