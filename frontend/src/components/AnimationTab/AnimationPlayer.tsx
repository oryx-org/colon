import { useState, useEffect, useRef, useCallback } from 'react';
import { LuPlay, LuPause, LuSkipForward, LuSkipBack, LuMaximize2, LuMinimize2 } from 'react-icons/lu';
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
    bg: hex('#0b0b18'), codeBg: hex('#0d0d1e'), vizBg: hex('#0d0d20'),
    border: hex('#1c1c36'), blue: hex('#3b82f6'), purple: hex('#8b5cf6'),
    teal: hex('#14b8a6'), amber: hex('#f59e0b'), red: hex('#ef4444'),
    green: hex('#10b981'), pink: hex('#ec4899'),
    text: hex('#e2e8f0'), dim: hex('#94a3b8'), muted: hex('#475569'),
    cell: hex('#161628'), cellHl: hex('#1e3a5f'), cellBdr: hex('#2a2a4a'),
    white: [255, 255, 255] as RGB,
};
const VPAL: RGB[] = [T.blue, T.purple, T.teal, T.amber, T.green, T.pink, T.red];

/* ── Syntax tokenizer ── */

const KW: Record<string, string> = {
    'def':'#C586C0','class':'#C586C0','return':'#C586C0','import':'#C586C0',
    'from':'#C586C0','if':'#C586C0','elif':'#C586C0','else':'#C586C0',
    'for':'#C586C0','while':'#C586C0','in':'#C586C0','not':'#C586C0',
    'and':'#C586C0','or':'#C586C0','try':'#C586C0','except':'#C586C0',
    'finally':'#C586C0','with':'#C586C0','as':'#C586C0','yield':'#C586C0',
    'lambda':'#C586C0','pass':'#C586C0','break':'#C586C0','continue':'#C586C0',
    'raise':'#C586C0','async':'#C586C0','await':'#C586C0',
    'const':'#569CD6','let':'#569CD6','var':'#569CD6','function':'#569CD6',
    'new':'#569CD6','this':'#569CD6','typeof':'#569CD6','instanceof':'#569CD6',
    'switch':'#C586C0','case':'#C586C0','default':'#C586C0',
    'public':'#569CD6','private':'#569CD6','protected':'#569CD6','static':'#569CD6',
    'void':'#569CD6','int':'#569CD6','float':'#569CD6','double':'#569CD6',
    'char':'#569CD6','boolean':'#569CD6','String':'#4EC9B0',
    'true':'#569CD6','false':'#569CD6','True':'#569CD6','False':'#569CD6',
    'None':'#569CD6','null':'#569CD6','undefined':'#569CD6',
    'print':'#DCDCAA','range':'#DCDCAA','len':'#DCDCAA','append':'#DCDCAA',
    'console':'#4EC9B0','log':'#DCDCAA','push':'#DCDCAA','pop':'#DCDCAA',
    'map':'#DCDCAA','filter':'#DCDCAA','reduce':'#DCDCAA',
    'Math':'#4EC9B0','System':'#4EC9B0','Arrays':'#4EC9B0',
};

function tokenize(line: string): { t: string; c: string }[] {
    const out: { t: string; c: string }[] = [];
    const re = /(#.*$|\/\/.*$|"[^"]*"|'[^']*'|\d+\.?\d*|\w+|\s+|.)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        const t = m[0];
        let c = '#D4D4D4';
        if (t.startsWith('#') || t.startsWith('//')) c = '#6A9955';
        else if (t.startsWith('"') || t.startsWith("'")) c = '#CE9178';
        else if (/^\d/.test(t)) c = '#B5CEA8';
        else if (KW[t]) c = KW[t];
        else if (/^[A-Z]/.test(t)) c = '#4EC9B0';
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
        this.cW = Math.floor(this.W * 0.44);
        this.vX = this.cW;
        this.vW = this.W - this.cW;
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
        const cx = this.vX + this.vW / 2;
        let vy = 55;

        /* Data structure visuals */
        const vk = new Set<string>();
        fr.visuals.forEach((vis, vi) => {
            const lid = `vl${vi}`;
            vk.add(lid);
            const [lbl, ln] = this.getEl(lid, 'text');
            lbl.txt = vis.label || ''; lbl.tc = T.dim; lbl.fs = 11; lbl.fw = '600';
            if (ln) lbl.enter(cx, vy);
            lbl.tx = cx; lbl.ty = vy; lbl.to = 1; lbl.tsc = 1;
            vy += 22;

            const items = vis.items || [], hl = vis.highlight || [];
            switch (vis.type) {
                case 'stack': this.layStack(vi, items, hl, cx, vy, vk); vy += items.length * 36 + 30; break;
                case 'callStack': this.layCStack(vi, items, hl, cx, vy, vk); vy += items.length * 33 + 15; break;
                case 'linkedList': this.layLinked(vi, items, hl, cx, vy, vk); vy += 55; break;
                case 'grid': this.layGrid(vi, items, hl, cx, vy, vk, vis.cols || 4);
                    vy += Math.ceil(items.length / (vis.cols || 4)) * 38 + 15; break;
                default: this.layArray(vi, items, hl, cx, vy, vk); vy += 65; break;
            }
            vy += 12;
        });
        this.retire('v', vk);

        /* Variables */
        const pk = new Set<string>();
        const varY = Math.max(vy + 8, this.H * 0.55);
        const pw = 110, ph = 28, pg = 8;
        const mc = Math.max(1, Math.floor((this.vW - 30) / (pw + pg)));
        fr.variables.forEach((v, i) => {
            const c = i % mc, r = Math.floor(i / mc);
            const px = this.vX + 15 + c * (pw + pg) + pw / 2;
            const py = varY + r * (ph + pg);
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

        /* Code highlight */
        if (fr.code?.highlight?.length) this.hlTY = 32 + (fr.code.highlight[0] - 1) * 20;

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
        c.fillStyle = rgbS(T.bg); c.fillRect(0, 0, this.W, this.H);
        c.fillStyle = rgbS(T.codeBg); c.fillRect(0, 0, this.cW, this.H);
        c.fillStyle = rgbS(T.border); c.fillRect(this.cW, 0, 1, this.H);
        const g = c.createLinearGradient(0, 0, this.W, 0);
        g.addColorStop(0, '#3b82f6'); g.addColorStop(0.33, '#8b5cf6');
        g.addColorStop(0.66, '#14b8a6'); g.addColorStop(1, '#3b82f6');
        c.fillStyle = g; c.fillRect(0, 0, this.W, 2);
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
        const y = this.H - 14;
        c.fillStyle = 'rgba(13,13,30,0.95)'; c.fillRect(0, this.H - 30, this.W, 30);
        c.fillStyle = rgbS(T.border); c.fillRect(0, this.H - 30, this.W, 1);
        rrect(c, 10, y - 9, 22, 18, 3);
        c.fillStyle = 'rgba(59,130,246,0.15)'; c.fill();
        c.font = '700 10px "JetBrains Mono",monospace';
        c.textAlign = 'center'; c.fillStyle = '#3b82f6';
        c.fillText(`${this.fi + 1}`, 21, y + 1);
        c.font = '12px "Inter",-apple-system,sans-serif';
        c.textAlign = 'left'; c.fillStyle = rgbS(T.dim);
        const maxW = this.W - 60;
        let txt = this.capTxt;
        while (c.measureText(txt).width > maxW && txt.length > 5) txt = txt.slice(0, -4) + '\u2026';
        c.fillText(txt, 40, y + 1);
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
        this.drawCode(fr);

        // z-order: lines → rects → text
        this.els.forEach(el => { if (el.kind === 'line') el.draw(this.ctx); });
        // arrow heads
        this.els.forEach(el => {
            if (el.kind === 'line' && el.id.includes('_a') && el.o > 0.05) {
                this.drawArrowHead(el.x + el.lp[2], el.y + el.lp[3], T.purple, el.o);
            }
        });
        this.els.forEach(el => { if (el.kind === 'rect') el.draw(this.ctx); });
        this.els.forEach(el => { if (el.kind === 'text') el.draw(this.ctx); });

        this.drawOutput(fr);
        this.drawCaption();
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
   React Component
   ══════════════════════════════════════════════════════════ */

function AnimationPlayer({ animation, height = 300 }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef<Scene | null>(null);
    const [fi, setFi] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const total = animation.frames?.length || 0;

    useEffect(() => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const scene = new Scene(cvs);
        sceneRef.current = scene;
        scene.onUpdate = (f, p) => { setFi(f); setPlaying(p); };
        scene.setFrames(animation.frames || []);
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

    useEffect(() => { setTimeout(() => sceneRef.current?.resize(), 80); }, [expanded]);

    const onPlay = useCallback(() => sceneRef.current?.play(), []);
    const onPause = useCallback(() => sceneRef.current?.pause(), []);
    const onFwd = useCallback(() => { sceneRef.current?.pause(); sceneRef.current?.goTo((sceneRef.current?.fi ?? 0) + 1); }, []);
    const onBack = useCallback(() => { sceneRef.current?.pause(); sceneRef.current?.goTo((sceneRef.current?.fi ?? 0) - 1); }, []);
    const onScrub = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        sceneRef.current?.pause(); sceneRef.current?.goTo(Number(e.target.value));
    }, []);

    if (total === 0) return <div className="anim-player-empty">No animation data</div>;

    return (
        <div ref={containerRef} className={`anim-player ${expanded ? 'expanded' : ''}`}
            style={{ height: expanded ? '100%' : `${height}px` }}>
            <canvas ref={canvasRef} className="anim-canvas-el" />
            <div className="anim-controls">
                <button onClick={onBack} disabled={fi === 0} title="Previous"><LuSkipBack size={14} /></button>
                {playing
                    ? <button className="anim-play-btn" onClick={onPause} title="Pause"><LuPause size={16} /></button>
                    : <button className="anim-play-btn" onClick={onPlay} title="Play"><LuPlay size={16} /></button>}
                <button onClick={onFwd} disabled={fi >= total - 1} title="Next"><LuSkipForward size={14} /></button>
                <div className="anim-scrubber-track">
                    <div className="anim-scrubber-fill" style={{ width: `${(fi / Math.max(total - 1, 1)) * 100}%` }} />
                    <input type="range" className="anim-scrubber" min={0} max={total - 1} value={fi} onChange={onScrub} />
                </div>
                <span className="anim-step-label">{fi + 1}/{total}</span>
                <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Minimize' : 'Expand'}>
                    {expanded ? <LuMinimize2 size={14} /> : <LuMaximize2 size={14} />}
                </button>
            </div>
        </div>
    );
}

export default AnimationPlayer;
