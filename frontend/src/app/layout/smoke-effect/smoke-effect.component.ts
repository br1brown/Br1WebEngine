import { ChangeDetectionStrategy, Component, Input, ElementRef, ViewChild, AfterViewInit, DestroyRef, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SmokeSettings } from '../../site';

/**
 * SmokeEffectComponent — Effetto decorativo a particelle di fumo.
 *
 * Disegna particelle semitrasparenti su un elemento <canvas> HTML5 che si muovono
 * lentamente sullo schermo, creando un effetto visivo di fumo/nebbia.
 *
 * CONFIGURAZIONE:
 *   I parametri (densita', velocita', colore, opacita', raggio) si trovano in
 *   site.ts, sotto la chiave "smoke" (tipo SmokeSettings).
 *
 * COME DISABILITARLO:
 *   In site.ts, imposta "smoke: null" oppure "smoke: { enable: false, ... }".
 *
 * COME FUNZIONA:
 *   - Al caricamento, il canvas viene dimensionato alla finestra e vengono
 *     create N particelle in posizioni casuali (N = config.density).
 *   - Un loop di animazione (requestAnimationFrame) muove le particelle e le
 *     ridisegna con un gradiente radiale per l'effetto sfumato.
 *   - Le particelle che escono dal viewport rientrano dal lato opposto.
 *   - Al resize della finestra, il canvas si adatta automaticamente.
 *
 * CLEANUP:
 *   DestroyRef gestisce automaticamente la rimozione del listener di resize
 *   e la cancellazione dell'animazione quando il componente viene distrutto.
 */
@Component({
    selector: 'app-smoke-effect',
    templateUrl: './smoke-effect.component.html',
    styleUrl: './smoke-effect.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SmokeEffectComponent implements AfterViewInit {
    @Input() config!: SmokeSettings;
    @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

    private readonly destroyRef = inject(DestroyRef);
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    private animationId = 0;
    private particles: Particle[] = [];

    ngAfterViewInit(): void {
        if (!this.isBrowser) return;

        const canvas = this.canvasRef.nativeElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        this.resizeCanvas(canvas);

        // Listener di resize con cleanup automatico via DestroyRef
        const onResize = () => this.resizeCanvas(canvas);
        window.addEventListener('resize', onResize);

        this.initParticles(canvas);
        this.animate(canvas, ctx);

        // Cleanup quando il componente viene distrutto
        this.destroyRef.onDestroy(() => {
            cancelAnimationFrame(this.animationId);
            window.removeEventListener('resize', onResize);
        });
    }

    private resizeCanvas(canvas: HTMLCanvasElement): void {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    private initParticles(canvas: HTMLCanvasElement): void {
        const count = this.config.density;
        this.particles = [];
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * this.config.maximumVelocity * 0.02,
                vy: (Math.random() - 0.5) * this.config.maximumVelocity * 0.02,
                radius: 1 + Math.random() * Math.max(0, this.config.particleRadius - 1)
            });
        }
    }

    private animate(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const hex = this.config.color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        for (const p of this.particles) {
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < -p.radius) p.x = canvas.width + p.radius;
            if (p.x > canvas.width + p.radius) p.x = -p.radius;
            if (p.y < -p.radius) p.y = canvas.height + p.radius;
            if (p.y > canvas.height + p.radius) p.y = -p.radius;

            const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
            gradient.addColorStop(0, `rgba(${r},${g},${b},${this.config.opacity})`);
            gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        this.animationId = requestAnimationFrame(() => this.animate(canvas, ctx));
    }
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}
