const ink = '#8d9e94';

function niceStep(span, count = 4) {
  const raw = Math.max(span / count, 1e-12);
  const scale = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / scale;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * scale;
}

function number(value) {
  if (Math.abs(value) >= 10000) return `${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) < 0.001 && value !== 0) return value.toExponential(0);
  return Number(value.toPrecision(3)).toString();
}

export class Plot {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = { color: '#a2d7a4', xLabel: 'r / R', ...options };
    this.points = [];
    this.hover = null;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
    canvas.addEventListener('pointermove', event => {
      const rect = canvas.getBoundingClientRect();
      this.hover = event.clientX - rect.left;
      this.draw();
    });
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }

  set(points, options = {}) { this.points = points; Object.assign(this.options, options); this.draw(); }

  draw() {
    const canvas = this.canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const p = { left: 43, right: 14, top: 13, bottom: 32 };
    const w = width - p.left - p.right;
    const h = height - p.top - p.bottom;
    const valid = this.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
    const xmin = this.options.xMin ?? (valid.length ? Math.min(...valid.map(p => p.x)) : 0);
    const xmax = this.options.xMax ?? (valid.length ? Math.max(...valid.map(p => p.x)) : 1);
    let low = valid.length ? Math.min(...valid.map(p => p.y)) : 0;
    let high = valid.length ? Math.max(...valid.map(p => p.y)) : 1;
    if (this.options.zero) low = Math.min(0, low);
    if (high === low) { high += Math.max(0.1, Math.abs(high) * 0.2); low -= Math.max(0.1, Math.abs(low) * 0.2); }
    const step = niceStep(high - low);
    const ymin = Math.floor(low / step) * step;
    const ymax = Math.ceil(high / step) * step;
    const x = value => p.left + (value - xmin) / (xmax - xmin || 1) * w;
    const y = value => p.top + h - (value - ymin) / (ymax - ymin || 1) * h;
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = ink;
    ctx.lineWidth = 0.7;
    for (let value = ymin; value <= ymax + step * 0.01; value += step) {
      const py = y(value);
      ctx.strokeStyle = '#303936';
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(p.left, py); ctx.lineTo(width - p.right, py); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(this.options.log ? `1e${Math.round(value)}` : number(value), p.left - 8, py + 3);
    }
    for (let i = 0; i <= 4; i += 1) {
      const value = xmin + (xmax - xmin) * i / 4;
      ctx.textAlign = 'center'; ctx.fillText(number(value), x(value), height - 18);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#697b70';
    ctx.fillText(this.options.xLabel, width - p.right, height - 3);
    ctx.setLineDash([]);
    if (!valid.length) {
      ctx.textAlign = 'center'; ctx.fillStyle = ink;
      ctx.fillText('No data', p.left + w / 2, p.top + h / 2);
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(p.left - 2, p.top - 2, w + 4, h + 4); ctx.clip();
    ctx.strokeStyle = this.options.color; ctx.fillStyle = this.options.color; ctx.lineWidth = 1.6;
    if (this.options.bars) {
      const bw = Math.max(2, w / valid.length * 0.48);
      for (const point of valid) ctx.fillRect(x(point.x) - bw / 2, y(point.y), bw, p.top + h - y(point.y));
    } else {
      let drawing = false;
      ctx.beginPath();
      for (const point of this.points) {
        if (!Number.isFinite(point.y)) { drawing = false; continue; }
        if (!drawing) ctx.moveTo(x(point.x), y(point.y)); else ctx.lineTo(x(point.x), y(point.y));
        drawing = true;
      }
      ctx.stroke();
      for (const point of valid) { ctx.beginPath(); ctx.arc(x(point.x), y(point.y), valid.length < 15 ? 2.3 : 1.3, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    if (this.hover !== null) {
      const point = valid.reduce((a, b) => Math.abs(x(a.x) - this.hover) < Math.abs(x(b.x) - this.hover) ? a : b);
      ctx.strokeStyle = '#8da895'; ctx.lineWidth = 0.7; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x(point.x), p.top); ctx.lineTo(x(point.x), p.top + h); ctx.stroke(); ctx.setLineDash([]);
      const label = `${number(point.x)} : ${number(point.y)}`;
      const boxWidth = ctx.measureText(label).width + 14;
      const left = Math.min(width - boxWidth - 2, Math.max(p.left, x(point.x) - boxWidth / 2));
      ctx.fillStyle = '#283b2e'; ctx.fillRect(left, 0, boxWidth, 17);
      ctx.fillStyle = '#e6eee8'; ctx.textAlign = 'left'; ctx.fillText(label, left + 7, 12);
    }
  }
}
