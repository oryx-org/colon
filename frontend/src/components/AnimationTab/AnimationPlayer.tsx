import { LuPlay, LuPause, LuChevronRight, LuChevronLeft, LuMaximize, LuMinimize } from 'react-icons/lu';
import { useState, useEffect, useRef, useCallback } from 'react';

import './AnimationPlayer.css';

/* ── Types ── */

interface Variable { name: string; value: string; color: string; changed?: boolean }
interface Visual {
    type: 'array' | 'stack' | 'linkedList' | 'callStack' | 'grid' | 'pointer';
    label: string; items: (string | number)[]; highlight?: number[];
    arrows?: { from: number; to: number }[]; cols?: number;
}
interface Frame {
    caption: string;
    code: { source: string; highlight: number[] };
    variables: Variable[]; output: string[]; visuals: Visual[];
}
export interface AnimationData { title: string; frames: Frame[] }
interface Props { animation: AnimationData; height?: number }

/* ── Color ── */

type RGB = [number, number, number];
function hex(h: string): RGB {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbS(c: RGB, a = 1): string {
    return a < 1 ? `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})` : `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}

/* ── Theme ── */

const T = {
    bg: hex('#1b1913'), codeBg: hex('#1b1913'), vizBg: hex('#1b1913'),
    border: hex('#49433a'), blue: hex('#8a6616'), purple: hex('#8a6616'),
    teal: hex('#8a6616'), amber: hex('#8a6616'), red: hex('#A1A1AA'),
    green: hex('#FAFAFA'), pink: hex('#8a6616'),
    text: hex('#FAFAFA'), dim: hex('#D4D4D8'), muted: hex('#A1A1AA'),
    cell: hex('#1b1913'), cellHl: hex('#49433a'), cellBdr: hex('#49433a'),
    white: [255, 255, 255] as RGB,
};
const VPAL: RGB[] = [T.blue, T.teal, T.amber, T.green, T.red, T.blue, T.teal];

/* ── Syntax tokenizer ── */

const KW: Record<string, string> = {
    'def':'#8a6616','class':'#8a6616','return':'#8a6616','import':'#8a6616',
    'from':'#8a6616','if':'#8a6616','elif':'#8a6616','else':'#8a6616',
    'for':'#8a6616','while':'#8a6616','in':'#8a6616','not':'#8a6616',
    'and':'#8a6616','or':'#8a6616','try':'#8a6616','except':'#8a6616',
    'finally':'#8a6616','with':'#8a6616','as':'#8a6616','yield':'#8a6616',
    'lambda':'#8a6616','pass':'#8a6616','break':'#8a6616','continue':'#8a6616',
    'raise':'#8a6616','async':'#8a6616','await':'#8a6616',
    'const':'#D4D4D8','let':'#D4D4D8','var':'#D4D4D8','function':'#D4D4D8',
    'new':'#D4D4D8','this':'#D4D4D8','typeof':'#D4D4D8','instanceof':'#D4D4D8',
    'switch':'#8a6616','case':'#8a6616','default':'#8a6616',
    'public':'#D4D4D8','private':'#D4D4D8','protected':'#D4D4D8','static':'#D4D4D8',
    'void':'#D4D4D8','int':'#D4D4D8','float':'#D4D4D8','double':'#D4D4D8',
    'char':'#D4D4D8','boolean':'#D4D4D8','String':'#D4D4D8',
    'true':'#D4AF37','false':'#D4AF37','True':'#D4AF37','False':'#D4AF37',
    'None':'#D4AF37','null':'#D4AF37','undefined':'#D4AF37',
    'print':'#D4D4D8','range':'#D4D4D8','len':'#D4D4D8','append':'#D4D4D8',
    'console':'#FAFAFA','log':'#D4D4D8','push':'#D4D4D8','pop':'#D4D4D8',
    'map':'#D4D4D8','filter':'#D4D4D8','reduce':'#D4D4D8',
    'Math':'#FAFAFA','System':'#FAFAFA','Arrays':'#FAFAFA',
};

function tokenize(line: string): { t: string; c: string }[] {
    const out: { t: string; c: string }[] = [];
    const re = /(#.*$|\/\/.*$|"[^"]*"|'[^']*'|\d+\.?\d*|\w+|\s+|.)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        const t = m[0];
        let c = '#FAFAFA'; // Default text color
        if (t.startsWith('#') || t.startsWith('//')) c = '#A1A1AA'; // comments
        else if (t.startsWith('"') || t.startsWith("'")) c = '#8a6616'; // strings (gold)
        else if (/^\d/.test(t)) c = '#8a6616'; // numbers (gold)
        else if (KW[t]) c = KW[t];
        else if (/^[A-Z]/.test(t)) c = '#D4D4D8';
        out.push({ t, c });
    }
    return out;
}

/* ── Canvas rounded rect helper ── */

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

/* ══════════════════════════════════════════════════════════
   Scene Element — has animated properties that smoothly
   interpolate toward targets every frame (60fps)
   ══════════════════════════════════════════════════════════ */

class El {
    id: string;
    kind: 'rect' | 'text' | 'line';

    /* current state (rendered) */
    x = 0; y = 0; w = 0; h = 0; o = 0; sc = 1;
    f: RGB = [0, 0, 0];
    s: RGB = [0, 0, 0];

    /* target state */
    tx = 0; ty = 0; tw = 0; th = 0; to = 1; tsc = 1;
    tf: RGB = [0, 0, 0];
    ts: RGB = [0, 0, 0];

    /* display */
    txt = ''; tc: RGB = [226, 232, 240];
    fs = 13; fw = '400'; r = 6;
    lineW = 2; lp: [number, number, number, number] = [0, 0, 0, 0];

    /* lifecycle */
    alive = true; exiting = false; glow = 0;

    constructor(id: string, kind: 'rect' | 'text' | 'line') {
        this.id = id; this.kind = kind;
    }

    enter(x: number, y: number) {
        this.x = x;
        this.y = this.kind === 'line' ? y : y - 35;
        this.o = 0;
        this.sc = this.kind === 'line' ? 1 : 0.2;
        this.to = 1; this.tsc = 1;
    }

    exit() {
        this.exiting = true;
        this.to = 0; this.tsc = 0.4;
        this.ty = this.y - 45;
    }

    setTarget(x: number, y: number, w: number, h: number, fill: RGB, stroke: RGB) {
        this.tx = x; this.ty = y; this.tw = w; this.th = h;
        this.tf[0] = fill[0]; this.tf[1] = fill[1]; this.tf[2] = fill[2];
        this.ts[0] = stroke[0]; this.ts[1] = stroke[1]; this.ts[2] = stroke[2];
        this.to = 1; this.tsc = 1;
    }

    update(dt: number) {
        const p = 1 - Math.exp(-6 * dt);
        const pc = 1 - Math.exp(-4.5 * dt);

        this.x += (this.tx - this.x) * p;
        this.y += (this.ty - this.y) * p;
        this.w += (this.tw - this.w) * p;
        this.h += (this.th - this.h) * p;
        this.o += (this.to - this.o) * p;
        this.sc += (this.tsc - this.sc) * p;

        for (let i = 0; i < 3; i++) {
            this.f[i] += (this.tf[i] - this.f[i]) * pc;
            this.s[i] += (this.ts[i] - this.s[i]) * pc;
        }

        if (this.glow > 0) this.glow = Math.max(0, this.glow - dt * 2);
        if (this.exiting && this.o < 0.02) this.alive = false;
    }

    draw(ctx: CanvasRenderingContext2D) {
        if (!this.alive || this.o < 0.01) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.max(0, this.o));
        ctx.translate(this.x, this.y);
        if (Math.abs(this.sc - 1) > 0.005) ctx.scale(this.sc, this.sc);

        if (this.kind === 'rect') this._rect(ctx);
        else if (this.kind === 'text') this._text(ctx);
        else this._line(ctx);

        ctx.restore();
    }

    _rect(ctx: CanvasRenderingContext2D) {
        const w = this.w, h = this.h;
        if (this.glow > 0) { ctx.shadowColor = rgbS(this.s); ctx.shadowBlur = 20 * this.glow; }
        rrect(ctx, -w / 2, -h / 2, w, h, this.r);
        ctx.fillStyle = rgbS(this.f);
        ctx.fill();
        ctx.strokeStyle = rgbS(this.s);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;
        if (this.txt) {
            ctx.fillStyle = rgbS(this.tc);
            ctx.font = `${this.fw} ${this.fs}px "JetBrains Mono",monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(this.txt, 0, 1);
        }
    }

    _text(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = rgbS(this.tc);
        ctx.font = `${this.fw} ${this.fs}px "JetBrains Mono",monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.txt, 0, 1);
    }

    _line(ctx: CanvasRenderingContext2D) {
        ctx.beginPath();
        ctx.moveTo(this.lp[0], this.lp[1]);
        ctx.lineTo(this.lp[2], this.lp[3]);
        ctx.strokeStyle = rgbS(this.s);
        ctx.lineWidth = this.lineW;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

/* ══════════════════════════════════════════════════════════
   Scene — Canvas 2D real-time animation engine
   Runs at 60fps. Each LLM frame is a keyframe: when the
   scene transitions to a new keyframe, all elements smoothly
   interpolate position/color/opacity toward their new targets.
   ══════════════════════════════════════════════════════════ */

class Scene {
    cvs: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    els = new Map<string, El>();
    W = 0; H = 0; cW = 0; vX = 0; vW = 0; dpr = 1;
    frames: Frame[] = [];
    fi = 0; playing = false; timer = 0;
    DUR = 2.8;
    raf = 0; t0 = 0; age = 0;
    hlY = 0; hlTY = 0;
    capTxt = '';
    prevVars = new Map<string, string>();
    onUpdate: ((fi: number, playing: boolean) => void) | null = null;
    showCaption = true;

    constructor(cvs: HTMLCanvasElement) {
        this.cvs = cvs;
        this.ctx = cvs.getContext('2d')!;
        this.dpr = window.devicePixelRatio || 1;
        this.resize();
    }

    resize() {
        const p = this.cvs.parentElement;
        if (!p) return;
        const r = p.getBoundingClientRect();
        if (r.width < 10 || r.height < 50) return;
        this.W = r.width;
        this.H = r.height - 42;
        this.cvs.width = this.W * this.dpr;
        this.cvs.height = Math.max(1, this.H) * this.dpr;
        this.cvs.style.width = `${this.W}px`;
        this.cvs.style.height = `${Math.max(1, this.H)}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        // Full width for visuals — no code panel
        this.cW = 0;
        this.vX = 0;
        this.vW = this.W;
    }

    setFrames(frames: Frame[]) {
        this.frames = frames;
        this.fi = 0; this.timer = 0;
        this.els.clear();
        this.prevVars.clear();
        if (frames.length > 0) this.applyFrame(0);
        this.onUpdate?.(0, this.playing);
    }

    getEl(id: string, kind: 'rect' | 'text' | 'line'): [El, boolean] {
        let el = this.els.get(id);
        if (el && el.alive && !el.exiting) return [el, false];
        el = new El(id, kind);
        this.els.set(id, el);
        return [el, true];
    }

    retire(pfx: string, keep: Set<string>) {
        this.els.forEach((el, id) => {
            if (id.startsWith(pfx) && !keep.has(id) && !el.exiting) el.exit();
        });
    }

    /* ── Apply keyframe: compute new targets for all scene elements ── */

    applyFrame(i: number) {
        if (i < 0 || i >= this.frames.length) return;
        const fr = this.frames[i];
        // Full canvas width: center everything
        const cx = this.W / 2;
        let vy = 60;

        /* Data structure visuals — full-width layout */
        const vk = new Set<string>();
        fr.visuals.forEach((vis, vi) => {
            const lid = `vl${vi}`;
            vk.add(lid);
            const [lbl, ln] = this.getEl(lid, 'text');
            lbl.txt = vis.label || ''; lbl.tc = T.dim; lbl.fs = 12; lbl.fw = '600';
            if (ln) lbl.enter(cx, vy);
            lbl.tx = cx; lbl.ty = vy; lbl.to = 1; lbl.tsc = 1;
            vy += 26;

            const items = vis.items || [], hl = vis.highlight || [];
            switch (vis.type) {
                case 'stack': this.layStack(vi, items, hl, cx, vy, vk); vy += items.length * 40 + 36; break;
                case 'callStack': this.layCStack(vi, items, hl, cx, vy, vk); vy += items.length * 33 + 18; break;
                case 'linkedList': this.layLinked(vi, items, hl, cx, vy, vk); vy += 60; break;
                case 'grid': this.layGrid(vi, items, hl, cx, vy, vk, vis.cols || 4);
                    vy += Math.ceil(items.length / (vis.cols || 4)) * 40 + 18; break;
                default: this.layArray(vi, items, hl, cx, vy, vk); vy += 72; break;
            }
            vy += 20;
        });
        this.retire('v', vk);

        /* Variables - shown as pills below visuals */
        const pk = new Set<string>();
        const varY = Math.max(vy + 12, this.H * 0.7);
        const pw = 120, ph = 30, pg = 8;
        const mc = Math.max(1, Math.floor((this.W - 40) / (pw + pg)));
        fr.variables.forEach((v, i) => {
            const col_i = i % mc, row = Math.floor(i / mc);
            const px = 20 + col_i * (pw + pg) + pw / 2;
            const py = varY + row * (ph + pg);
            const vid = `p_${v.name}`;
            pk.add(vid);
            const col = v.color ? hex(v.color) : VPAL[i % VPAL.length];
            const [el, isN] = this.getEl(vid, 'rect');
            el.txt = `${v.name} = ${v.value}`;
            el.tc = T.text; el.fs = 11; el.fw = '500'; el.r = 6;
            if (isN) {
                el.enter(px, py);
                el.w = pw; el.h = ph;
                el.f = [col[0] >> 3, col[1] >> 3, col[2] >> 3];
                el.s = [...col];
            }
            el.setTarget(px, py, pw, ph,
                [Math.round(col[0] * 0.12), Math.round(col[1] * 0.12), Math.round(col[2] * 0.12)] as RGB, col);
            const changed = v.changed || (this.prevVars.has(v.name) && this.prevVars.get(v.name) !== v.value);
            if (changed) el.glow = 1;
        });
        this.retire('p_', pk);

        this.prevVars.clear();
        fr.variables.forEach(v => this.prevVars.set(v.name, v.value));

        /* Caption */
        this.capTxt = fr.caption || '';
    }

    /* ── Layout helpers ── */

    layArray(vi: number, items: (string | number)[], hl: number[], cx: number, y: number, k: Set<string>) {
        const cw = 50, ch = 38, g = 4;
        const tw = items.length * (cw + g) - g;
        const sx = cx - tw / 2;
        items.forEach((item, i) => {
            const id = `v${vi}_${i}`; k.add(id);
            const isH = hl.includes(i);
            const [el, isN] = this.getEl(id, 'rect');
            const ex = sx + i * (cw + g) + cw / 2;
            el.txt = String(item); el.tc = isH ? T.white : T.text;
            el.fs = 13; el.fw = isH ? '700' : '400'; el.r = 6;
            if (isN) { el.enter(ex, y + ch / 2); el.w = cw; el.h = ch; el.f = [...T.cell]; el.s = [...T.cellBdr]; }
            el.setTarget(ex, y + ch / 2, cw, ch, isH ? T.cellHl : T.cell, isH ? T.blue : T.cellBdr);
            if (isH) el.glow = 0.6;
            // Index label
            const iid = `v${vi}_i${i}`; k.add(iid);
            const [idx, idxN] = this.getEl(iid, 'text');
            idx.txt = String(i); idx.tc = T.muted; idx.fs = 9; idx.fw = '400';
            if (idxN) idx.enter(ex, y + ch + 10);
            idx.tx = ex; idx.ty = y + ch + 10; idx.to = 1; idx.tsc = 1;
        });
    }

    layStack(vi: number, items: (string | number)[], hl: number[], cx: number, y: number, k: Set<string>) {
        const cw = 90, ch = 32, g = 3;
        const stackH = Math.max(items.length, 1) * (ch + g) + 10;
        const hw = cw / 2 + 10;
        // Walls
        (['wl', 'wr', 'wb'] as const).forEach(wid => {
            const id = `v${vi}_${wid}`; k.add(id);
            const [el, isN] = this.getEl(id, 'line');
            el.ts = [...T.blue]; el.lineW = 2.5;
            if (isN) { el.o = 0; el.to = 0.7; el.sc = 1; el.tsc = 1; el.x = cx; el.y = y; el.s = [...T.blue]; }
            el.tx = cx; el.ty = y; el.to = 0.7;
            if (wid === 'wl') el.lp = [-hw, 0, -hw, stackH];
            else if (wid === 'wr') el.lp = [hw, 0, hw, stackH];
            else el.lp = [-hw, stackH, hw, stackH];
        });
        // Items (bottom to top visually, but index 0 = top of stack)
        items.forEach((item, i) => {
            const id = `v${vi}_${i}`; k.add(id);
            const isH = hl.includes(i), isTop = i === 0;
            const [el, isN] = this.getEl(id, 'rect');
            const ey = y + i * (ch + g) + ch / 2 + 4;
            el.txt = String(item); el.tc = T.text;
            el.fs = 13; el.fw = isTop ? '700' : '400'; el.r = 5;
            if (isN) { el.enter(cx, y - 55); el.w = cw; el.h = ch; el.f = [...T.cell]; el.s = [...T.cellBdr]; }
            el.setTarget(cx, ey, cw, ch,
                isH ? [35, 23, 62] as RGB : isTop ? [15, 26, 50] as RGB : T.cell,
                isH ? T.purple : isTop ? T.blue : T.cellBdr);
            if (isTop || isH) el.glow = 0.4;
        });
        // Top pointer
        const pid = `v${vi}_ptr`; k.add(pid);
        const [ptr, pN] = this.getEl(pid, 'text');
        ptr.txt = '\u2190 top'; ptr.tc = T.blue; ptr.fs = 11; ptr.fw = '600';
        const topY = items.length > 0 ? y + ch / 2 + 4 : y;
        if (pN) ptr.enter(cx + cw / 2 + 38, topY);
        ptr.tx = cx + cw / 2 + 38; ptr.ty = topY;
        ptr.to = items.length > 0 ? 1 : 0; ptr.tsc = 1;
    }

    layCStack(vi: number, items: (string | number)[], hl: number[], cx: number, y: number, k: Set<string>) {
        const cw = 150, ch = 28, g = 3;
        items.forEach((item, i) => {
            const id = `v${vi}_${i}`; k.add(id);
            const isH = hl.includes(i), isTop = i === 0;
            const [el, isN] = this.getEl(id, 'rect');
            const ey = y + i * (ch + g) + ch / 2;
            el.txt = String(item); el.tc = T.text; el.fs = 11; el.r = 4;
            if (isN) { el.enter(cx, ey); el.w = cw; el.h = ch; el.f = [...T.cell]; el.s = [...T.cellBdr]; }
            el.setTarget(cx, ey, cw, ch,
                isH ? [49, 32, 2] as RGB : isTop ? [20, 20, 50] as RGB : T.cell,
                isH ? T.amber : isTop ? [99, 102, 241] as RGB : T.cellBdr);
            if (isTop) el.glow = 0.3;
        });
    }

    layLinked(vi: number, items: (string | number)[], hl: number[], cx: number, y: number, k: Set<string>) {
        const nw = 48, nh = 32, arw = 32;
        const tw = items.length * (nw + arw) - arw;
        const sx = cx - tw / 2;
        items.forEach((item, i) => {
            const id = `v${vi}_${i}`; k.add(id);
            const isH = hl.includes(i);
            const [el, isN] = this.getEl(id, 'rect');
            const nx = sx + i * (nw + arw) + nw / 2;
            el.txt = String(item); el.tc = T.text; el.fs = 12; el.r = 6;
            if (isN) { el.enter(nx, y + nh / 2); el.w = nw; el.h = nh; el.f = [...T.cell]; el.s = [...T.cellBdr]; }
            el.setTarget(nx, y + nh / 2, nw, nh, isH ? [4, 37, 33] as RGB : T.cell, isH ? T.teal : T.cellBdr);
            // Arrow
            if (i < items.length - 1) {
                const aid = `v${vi}_a${i}`; k.add(aid);
                const [arr, aN] = this.getEl(aid, 'line');
                arr.ts = [...T.purple]; arr.lineW = 2;
                const ax = nx + nw / 2 + arw / 2 + 2;
                if (aN) { arr.enter(ax, y + nh / 2); arr.s = [...T.purple]; }
                arr.tx = ax; arr.ty = y + nh / 2;
                arr.lp = [-arw / 2 + 3, 0, arw / 2 - 3, 0];
                arr.to = 0.7; arr.tsc = 1;
            }
        });
        // Null
        const nid = `v${vi}_null`; k.add(nid);
        const [nt, ntN] = this.getEl(nid, 'text');
        nt.txt = 'null'; nt.tc = T.muted; nt.fs = 10; nt.fw = '400';
        const nullX = items.length > 0 ? sx + items.length * (nw + arw) - arw + nw + 18 : cx;
        if (ntN) nt.enter(nullX, y + 16);
        nt.tx = nullX; nt.ty = y + 16; nt.to = 1; nt.tsc = 1;
    }

    layGrid(vi: number, items: (string | number)[], hl: number[], cx: number, y: number, k: Set<string>, cols: number) {
        const cw = 42, ch = 32, g = 3;
        const tw = cols * (cw + g) - g;
        const sx = cx - tw / 2;
        items.forEach((item, i) => {
            const id = `v${vi}_${i}`; k.add(id);
            const isH = hl.includes(i);
            const c = i % cols, r = Math.floor(i / cols);
            const [el, isN] = this.getEl(id, 'rect');
            const ex = sx + c * (cw + g) + cw / 2;
            const ey = y + r * (ch + g) + ch / 2;
            el.txt = String(item); el.tc = T.text; el.fs = 11; el.r = 4;
            if (isN) { el.enter(ex, ey); el.w = cw; el.h = ch; el.f = [...T.cell]; el.s = [...T.cellBdr]; }
            el.setTarget(ex, ey, cw, ch, isH ? T.cellHl : T.cell, isH ? T.blue : T.cellBdr);
        });
    }

    /* ── Drawing ── */

    drawBg() {
        const c = this.ctx;
        // Pure black background — no code panel divider
        c.fillStyle = rgbS(T.bg); c.fillRect(0, 0, this.W, this.H);
        // Single thin gold accent line at top
        c.fillStyle = '#8a6616'; c.fillRect(0, 0, this.W, 2);
    }

    drawCode(fr: Frame) {
        const c = this.ctx;
        if (!fr?.code?.source) return;
        const lines = fr.code.source.split('\n');
        const lh = 20, sy = 32, cx = 44;
        // Header
        c.fillStyle = 'rgba(15,15,34,0.9)'; c.fillRect(0, 2, this.cW, 22);
        [[12, '#ff5f57'], [24, '#ffbd2e'], [36, '#28c840']].forEach(([x, col]) => {
            c.beginPath(); c.arc(x as number, 12, 3.5, 0, Math.PI * 2);
            c.fillStyle = col as string; c.fill();
        });
        c.font = '600 9px "JetBrains Mono",monospace';
        c.fillStyle = rgbS(T.muted); c.textAlign = 'left'; c.fillText('CODE', 48, 14);

        c.save();
        c.beginPath(); c.rect(0, 24, this.cW, this.H - 24); c.clip();

        // Smooth highlight interpolation
        this.hlY += (this.hlTY - this.hlY) * 0.08;

        // Highlight bands
        if (fr.code.highlight) {
            for (const hl of fr.code.highlight) {
                const by = sy + (hl - 1) * lh - lh / 2;
                const gg = c.createLinearGradient(0, by, this.cW, by);
                gg.addColorStop(0, 'rgba(59,130,246,0.13)');
                gg.addColorStop(1, 'rgba(59,130,246,0.02)');
                c.fillStyle = gg; c.fillRect(3, by, this.cW - 6, lh);
                c.fillStyle = '#3b82f6'; c.fillRect(0, by, 3, lh);
            }
        }

        // Lines
        for (let i = 0; i < lines.length; i++) {
            const ly = sy + i * lh, ln = i + 1;
            const isH = fr.code.highlight?.includes(ln);
            c.textAlign = 'right'; c.font = '10px "JetBrains Mono",monospace';
            c.fillStyle = isH ? '#3b82f6' : rgbS(T.muted);
            c.fillText(`${ln}`, 28, ly);
            c.textAlign = 'left'; c.font = '12px "JetBrains Mono",monospace';
            let tx = cx;
            for (const tok of tokenize(lines[i])) {
                c.fillStyle = tok.c; c.fillText(tok.t, tx, ly);
                tx += c.measureText(tok.t).width;
            }
            if (isH) {
                c.fillStyle = '#3b82f6';
                c.globalAlpha = 0.4 + Math.sin(this.age * 4) * 0.35;
                c.beginPath(); c.arc(this.cW - 10, ly - 1, 3, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
            }
        }
        c.restore();
    }

    drawCaption() {
        const c = this.ctx;
        if (!this.capTxt) return;

        const panelH = 70;
        const panelY = this.H - panelH;

        // Dark panel background with subtle gradient
        const grad = c.createLinearGradient(0, panelY, 0, this.H);
        grad.addColorStop(0, 'rgba(13,17,23,0.98)');
        grad.addColorStop(1, 'rgba(6,8,12,1)');
        c.fillStyle = grad;
        c.fillRect(0, panelY, this.W, panelH);

        // Top border
        c.fillStyle = '#21262d';
        c.fillRect(0, panelY, this.W, 1);

        // Step badge — larger and more visible
        const badgeX = 18, badgeY = panelY + 20;
        rrect(c, badgeX, badgeY - 12, 30, 24, 5);
        c.fillStyle = 'rgba(59,130,246,0.15)'; c.fill();
        c.strokeStyle = 'rgba(59,130,246,0.3)'; c.lineWidth = 1; c.stroke();
        c.font = '700 12px "JetBrains Mono",monospace';
        c.textAlign = 'center'; c.fillStyle = '#3b82f6';
        c.fillText(`${this.fi + 1}`, badgeX + 15, badgeY + 1);

        // Step counter — "of N"
        c.font = '400 10px "JetBrains Mono",monospace';
        c.fillStyle = '#484f58';
        c.fillText(`/ ${this.frames.length}`, badgeX + 15, badgeY + 16);

        // Caption text — large, readable, word-wrapped
        const textX = 60;
        const textMaxW = this.W - textX - 20;
        c.font = '500 14px "Inter",-apple-system,sans-serif';
        c.textAlign = 'left';
        c.fillStyle = '#e6edf3';

        // Word wrap into max 2 lines
        const words = this.capTxt.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        for (const word of words) {
            const test = currentLine ? currentLine + ' ' + word : word;
            if (c.measureText(test).width > textMaxW && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = test;
            }
        }
        if (currentLine) lines.push(currentLine);

        // Draw max 2 lines
        const lineH = 20;
        const startY = lines.length === 1 ? panelY + 38 : panelY + 28;
        for (let i = 0; i < Math.min(lines.length, 2); i++) {
            let line = lines[i];
            if (i === 1 && lines.length > 2) {
                // Truncate with ellipsis if more than 2 lines
                line = line.slice(0, -3) + '…';
            }
            c.fillText(line, textX, startY + i * lineH);
        }
    }

    drawOutput(fr: Frame) {
        const c = this.ctx;
        if (!fr.output?.length) return;
        const ox = this.vX + 18;
        const oy = this.H - 48 - fr.output.length * 16;
        c.font = '600 9px "JetBrains Mono",monospace';
        c.fillStyle = rgbS(T.muted); c.textAlign = 'left';
        c.fillText('\u25B8 OUTPUT', ox, oy - 10);
        c.font = '11px "JetBrains Mono",monospace'; c.fillStyle = rgbS(T.teal);
        fr.output.forEach((line, i) => c.fillText(`\u276F ${line}`, ox, oy + 6 + i * 16));
    }

    drawArrowHead(x: number, y: number, col: RGB, a: number) {
        const c = this.ctx;
        c.save(); c.translate(x, y);
        c.beginPath(); c.moveTo(0, 0); c.lineTo(-7, -3.5); c.lineTo(-7, 3.5); c.closePath();
        c.fillStyle = rgbS(col, a); c.fill();
        c.restore();
    }

    /* ── Main loop ── */

    update(dt: number) {
        this.age += dt;
        this.els.forEach(el => el.update(dt));
        this.els.forEach((el, id) => { if (!el.alive) this.els.delete(id); });

        if (this.playing) {
            this.timer += dt;
            if (this.timer >= this.DUR) {
                this.timer = 0;
                if (this.fi < this.frames.length - 1) {
                    this.fi++;
                    this.applyFrame(this.fi);
                    this.onUpdate?.(this.fi, true);
                } else {
                    this.playing = false;
                    this.onUpdate?.(this.fi, false);
                }
            }
        }
    }

    render() {
        if (this.W < 10 || this.H < 10) { this.resize(); return; }
        const fr = this.frames[this.fi];
        if (!fr) return;

        this.drawBg();
        // No code panel — pure visualization canvas

        // z-order: lines → rects → text
        this.els.forEach(el => { if (el.kind === 'line') el.draw(this.ctx); });
        // arrow heads
        this.els.forEach(el => {
            if (el.kind === 'line' && el.id.includes('_a') && el.o > 0.05) {
                this.drawArrowHead(el.x + el.lp[2], el.y + el.lp[3], T.blue, el.o);
            }
        });
        this.els.forEach(el => { if (el.kind === 'rect') el.draw(this.ctx); });
        this.els.forEach(el => { if (el.kind === 'text') el.draw(this.ctx); });

        if (this.showCaption) this.drawCaption();
    }

    loop = (now: number) => {
        const dt = Math.min(0.05, (now - this.t0) / 1000);
        this.t0 = now;
        this.update(dt);
        this.render();
        this.raf = requestAnimationFrame(this.loop);
    };

    start() { this.t0 = performance.now(); this.raf = requestAnimationFrame(this.loop); }
    stop() { cancelAnimationFrame(this.raf); }

    play() {
        if (this.fi >= this.frames.length - 1) this.goTo(0);
        this.playing = true; this.timer = 0;
        this.onUpdate?.(this.fi, true);
    }
    pause() { this.playing = false; this.onUpdate?.(this.fi, false); }
    goTo(i: number) {
        if (i < 0 || i >= this.frames.length) return;
        this.fi = i; this.timer = 0;
        this.applyFrame(i);
        this.onUpdate?.(i, this.playing);
    }
}

/* ══════════════════════════════════════════════════════════
   React Component — with Focus Mode
   ══════════════════════════════════════════════════════════ */

function AnimationPlayer({ animation, height = 300 }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<Scene | null>(null);
    const stepsRef = useRef<HTMLDivElement>(null);
    const [fi, setFi] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [isFocused, setIsFocused] = useState(false);

    const total = animation.frames?.length || 0;
    const frames = animation.frames || [];

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const scene = new Scene(cvs);
        sceneRef.current = scene;
        scene.onUpdate = (f, p) => { setFi(f); setPlaying(p); };
        scene.setFrames(frames);
        scene.start();
        return () => scene.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { sceneRef.current?.setFrames(animation.frames || []); }, [animation]);

    useEffect(() => {
        const ro = new ResizeObserver(() => sceneRef.current?.resize());
        if (containerRef.current) ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Toggle caption visibility and resize when focus mode changes
    useEffect(() => {
        if (sceneRef.current) {
            sceneRef.current.showCaption = !isFocused;
        }
        setTimeout(() => sceneRef.current?.resize(), 50);
        setTimeout(() => sceneRef.current?.resize(), 200);
    }, [isFocused]);

    // Escape key exits focus mode
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFocused) setIsFocused(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isFocused]);

    // Auto-scroll the steps list to keep current step visible
    useEffect(() => {
        if (!isFocused || !stepsRef.current) return;
        const activeStep = stepsRef.current.querySelector('.anim-step.active');
        if (activeStep) {
            activeStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [fi, isFocused]);

    const onPlay = useCallback(() => sceneRef.current?.play(), []);
    const onPause = useCallback(() => sceneRef.current?.pause(), []);
    const onFwd = useCallback(() => { sceneRef.current?.pause(); sceneRef.current?.goTo((sceneRef.current?.fi ?? 0) + 1); }, []);
    const onBack = useCallback(() => { sceneRef.current?.pause(); sceneRef.current?.goTo((sceneRef.current?.fi ?? 0) - 1); }, []);
    const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        sceneRef.current?.pause(); sceneRef.current?.goTo(Number(e.target.value));
    }, []);
    const goToStep = useCallback((i: number) => {
        sceneRef.current?.pause(); sceneRef.current?.goTo(i);
    }, []);

    if (total === 0) return <div className="anim-player-empty">No animation data</div>;

    /* ── Controls bar (shared between normal and focus mode) ── */
    const controls = (
        <div className="anim-controls">
            <button onClick={onBack} disabled={fi === 0} title="Previous"><LuChevronLeft size={14} /></button>
            {playing
                ? <button className="anim-play-btn" onClick={onPause} title="Pause"><LuPause size={16} /></button>
                : <button className="anim-play-btn" onClick={onPlay} title="Play"><LuPlay size={16} /></button>}
            <button onClick={onFwd} disabled={fi >= total - 1} title="Next"><LuChevronRight size={14} /></button>
            <div className="anim-scrubber-track">
                <div className="anim-scrubber-fill" style={{ width: `${(fi / Math.max(total - 1, 1)) * 100}%` }} />
                <input type="range" className="anim-scrubber" min={0} max={total - 1} value={fi} onChange={onScrub} />
            </div>
            <span className="anim-step-label">{fi + 1}/{total}</span>
            <button onClick={() => setIsFocused(f => !f)} title={isFocused ? 'Close' : 'Focus'}>
                {isFocused ? <LuMinimize size={14} /> : <LuMaximize size={14} />}
            </button>
        </div>
    );

    return (
        <div ref={containerRef} className={`anim-player ${isFocused ? 'focused' : ''}`}
            style={{ height: isFocused ? undefined : `${height}px` }}>

            {/* ── Backdrop (focus mode only) ── */}
            {isFocused && <div className="anim-focus-backdrop" onClick={() => setIsFocused(false)} />}

            <div className="anim-player-inner">
                {/* ── Close button (focus mode only) ── */}
                {isFocused && (
                    <button className="anim-focus-close" onClick={() => setIsFocused(false)} title="Close (Esc)">✕</button>
                )}

                {/* ── Left panel: step-by-step explanations (focus mode only) ── */}
                {isFocused && (
                    <div className="anim-focus-left">
                        <div className="anim-focus-left-header">
                            <span className="anim-focus-left-title">Step-by-Step Explanation</span>
                            <span className="anim-focus-left-count">{total} steps</span>
                        </div>
                        <div className="anim-focus-steps" ref={stepsRef}>
                            {frames.map((frame, i) => (
                                <div
                                    key={i}
                                    className={`anim-step ${i === fi ? 'active' : ''} ${i < fi ? 'completed' : ''}`}
                                    onClick={() => goToStep(i)}
                                >
                                    <div className="anim-step-num">{i + 1}</div>
                                    <div className="anim-step-body">
                                        <p className="anim-step-text">{frame.caption || `Step ${i + 1}`}</p>
                                        {frame.visuals?.map((vis, vi) => (
                                            <span key={vi} className="anim-step-tag">{vis.type}: {vis.label}</span>
                                        ))}
                                    </div>
                                    {i === fi && <div className="anim-step-indicator">▶</div>}
                                    {i < fi && <div className="anim-step-check">✓</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Right panel: canvas + controls ── */}
                <div className="anim-focus-right">
                    <canvas ref={canvasRef} className="anim-canvas-el" />
                    {controls}
                </div>
            </div>
        </div>
    );
}

export default AnimationPlayer;

