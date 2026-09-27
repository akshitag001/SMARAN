import { useEffect, useRef } from 'react';

/**
 * A scrolling level meter while recording. Uses the microphone level when the
 * browser allows it; otherwise draws a speech-like rhythm so the mentor can see
 * the app is listening.
 */
export function Waveform({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const levels: number[] = [];
    let raf = 0;
    let lastPush = 0;
    let stream: MediaStream | null = null;
    let actx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let buf: Uint8Array<ArrayBuffer> | null = null;
    const t0 = performance.now();
    let cancelled = false;

    if (active && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => {
          if (cancelled) return s.getTracks().forEach((t) => t.stop());
          stream = s;
          actx = new AudioContext();
          analyser = actx.createAnalyser();
          analyser.fftSize = 512;
          actx.createMediaStreamSource(s).connect(analyser);
          buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        })
        .catch(() => {
          /* no level meter; the synthetic rhythm is used */
        });
    }

    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== Math.round(w * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const g = c.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(document.documentElement);
      const on = css.getPropertyValue('--quink').trim() || '#2A3F9D';
      const idle = css.getPropertyValue('--rule-strong').trim() || '#B6BFC8';
      const step = 6;
      const n = Math.floor(w / step);

      if (active && now - lastPush > 70) {
        lastPush = now;
        let lv: number;
        if (analyser && buf) {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          lv = Math.min(1, Math.sqrt(sum / buf.length) * 4);
        } else {
          const t = (now - t0) / 1000;
          const talking = Math.sin(t * 1.3) > -0.55 ? 1 : 0.15;
          lv = talking * (0.18 + 0.5 * Math.abs(Math.sin(t * 4.1) * Math.sin(t * 2.3 + 1))) + Math.random() * 0.18 * talking;
        }
        levels.push(lv);
        if (levels.length > n) levels.shift();
      }

      const off = n - levels.length;
      for (let i = 0; i < n; i++) {
        const lv = i >= off ? levels[i - off] : 0;
        const bh = Math.max(3, lv * (h - 6));
        g.fillStyle = active && i >= off ? on : idle;
        g.beginPath();
        g.roundRect(i * step, (h - bh) / 2, 3, bh, 1.5);
        g.fill();
      }
      if (active) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      actx?.close().catch(() => {});
    };
  }, [active]);

  return <canvas id="wave" ref={canvas} aria-hidden="true" />;
}
