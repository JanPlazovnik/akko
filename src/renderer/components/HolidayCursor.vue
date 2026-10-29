<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAmbientEffects, type Holiday } from '../lib/holidays';
import { useSettingsStore } from '../stores/settings';

const ARROW = 'M3 2v17l4.5-4.2 2.9 6.4 2.6-1.2-2.8-6.3h6.2Z';

const ARROW_COLORS: Record<Holiday, [fill: string, stroke: string]> = {
    HALLOWEEN: ['#2a1640', '#fb923c'],
    CHRISTMAS: ['#ffffff', '#ef4444'],
    NEW_YEAR: ['#1a1530', '#fcd34d'],
};

const arrowCursor = ([fill, stroke]: [string, string]) =>
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="${ARROW}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    )}") 3 2`;

const GHOST = new Path2D('M0-9C-4-9-6-6-6-2.5V7l2-1.6L-2 7l2-1.6L2 7l2-1.6L6 7v-9.5C6-6 4-9 0-9Z');
const SPARKLE = new Path2D('M0-1Q.12-.12 1 0 .12.12 0 1-.12.12-1 0-.12-.12 0-1Z');

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    age: number;
    size: number;
    color: string;
    shape: 'dot' | 'sparkle' | 'ring' | 'flake';
    spin: number;
};

type Theme = {
    colors: string[];
    shapes: Particle['shape'][];
    gravity: number;
    speed: number;
    life: [number, number];
    size: [number, number];
};

const THEMES: Record<Holiday, Theme> = {
    HALLOWEEN: {
        colors: ['#a855f7', '#c084fc', '#7c3aed', '#fb923c', '#f97316'],
        shapes: ['dot', 'dot', 'dot', 'sparkle', 'ring'],
        gravity: -6,
        speed: 12,
        life: [0.4, 0.8],
        size: [1.5, 3.5],
    },
    CHRISTMAS: {
        colors: ['#ffffff', '#e0f2fe', '#bae6fd', '#fca5a5'],
        shapes: ['dot', 'dot', 'flake'],
        gravity: 30,
        speed: 14,
        life: [0.5, 0.9],
        size: [1.5, 3.5],
    },
    NEW_YEAR: {
        colors: ['#fde68a', '#fcd34d', '#fff7d6', '#f9a8d4', '#a5f3fc'],
        shapes: ['dot', 'dot', 'sparkle'],
        gravity: 160,
        speed: 60,
        life: [0.3, 0.6],
        size: [1.2, 2.8],
    },
};

// The companion fades out once the pointer has rested this long, which also lets the loop stop
const IDLE_AFTER = 3;

const canvas = ref<HTMLCanvasElement | null>(null);
const settings = useSettingsStore();
const effects = useAmbientEffects();
const ambient = computed(() => (settings.settings?.holidayCursor === false ? null : effects.value));

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

let particles: Particle[] = [];
const pointer = { x: -100, y: -100, inside: false, movedAt: 0 };
const buddy = { x: -100, y: -100, alpha: 0, facing: 1, tilt: 0, spin: 0, travelled: 0 };
let width = 0;
let height = 0;
let frame = 0;
let last = 0;

function resize() {
    const el = canvas.value;
    if (!el) return;
    width = window.innerWidth;
    height = window.innerHeight;
    el.width = width * devicePixelRatio;
    el.height = height * devicePixelRatio;
}

function emit(theme: Theme, x: number, y: number) {
    const angle = Math.random() * Math.PI * 2;
    const speed = between(0.3, 1) * theme.speed;
    particles.push({
        x: x + between(-3, 3),
        y: y + between(-3, 3),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (theme.gravity > 100 ? theme.speed * 0.5 : 0),
        life: between(...theme.life),
        age: 0,
        size: between(...theme.size),
        color: pick(theme.colors),
        shape: pick(theme.shapes),
        spin: between(-3, 3),
    });
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
    const t = p.age / p.life;
    ctx.globalAlpha = (1 - t) * (t < 0.1 ? t * 10 : 1);
    ctx.fillStyle = ctx.strokeStyle = ctx.shadowColor = p.color;
    ctx.shadowBlur = p.size * 3;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin * p.age);
    const size = p.size * (1 - t * 0.5);
    if (p.shape === 'dot') {
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
    } else if (p.shape === 'ring') {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.6, 0, Math.PI * 2);
        ctx.stroke();
    } else if (p.shape === 'sparkle') {
        ctx.scale(size * 2.2, size * 2.2);
        ctx.fill(SPARKLE);
    } else {
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI;
            ctx.moveTo(Math.cos(a) * size * 1.8, Math.sin(a) * size * 1.8);
            ctx.lineTo(-Math.cos(a) * size * 1.8, -Math.sin(a) * size * 1.8);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawBuddy(ctx: CanvasRenderingContext2D, holiday: Holiday, time: number) {
    ctx.globalAlpha = buddy.alpha;
    ctx.save();
    ctx.translate(buddy.x, buddy.y + Math.sin(time * 3) * 1.5);
    if (holiday === 'HALLOWEEN') {
        ctx.rotate(buddy.tilt);
        ctx.scale(buddy.facing * 1.4, 1.4);
        ctx.shadowColor = 'rgb(192 132 252 / 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#f5f3ff';
        ctx.fill(GHOST);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1e1030';
        ctx.beginPath();
        ctx.ellipse(-0.5, -3, 1.1, 1.6, 0, 0, Math.PI * 2);
        ctx.ellipse(3, -3, 1.1, 1.6, 0, 0, Math.PI * 2);
        ctx.fill();
    } else if (holiday === 'CHRISTMAS') {
        ctx.rotate(buddy.spin);
        ctx.strokeStyle = '#ffffff';
        ctx.shadowColor = 'rgb(186 230 253 / 0.9)';
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -8);
            ctx.moveTo(-2.5, -5.5);
            ctx.lineTo(0, -3.8);
            ctx.lineTo(2.5, -5.5);
            ctx.rotate(Math.PI / 3);
        }
        ctx.stroke();
    } else {
        ctx.rotate(buddy.spin);
        ctx.fillStyle = '#fff7d6';
        ctx.shadowColor = '#fcd34d';
        ctx.shadowBlur = 14;
        ctx.scale(9, 9);
        ctx.fill(SPARKLE);
        ctx.rotate(Math.PI / 4);
        ctx.scale(0.5, 0.5);
        ctx.fill(SPARKLE);
    }
    ctx.restore();
}

function draw(time: number) {
    const ctx = canvas.value?.getContext('2d');
    const holiday = ambient.value;
    if (!ctx || !holiday) return;
    const theme = THEMES[holiday];
    const now = time / 1000;
    const dt = Math.min(now - last, 0.05);
    last = now;

    const idle = now - pointer.movedAt > IDLE_AFTER;
    const shown = pointer.inside && !idle;
    buddy.alpha += ((shown ? 1 : 0) - buddy.alpha) * Math.min(dt * (shown ? 8 : 3), 1);

    // Trails a little behind and above the pointer, so it never covers what's being pointed at
    const tx = pointer.x - 14 * buddy.facing;
    const ty = pointer.y - 10;
    const ease = 1 - Math.exp(-dt * 9);
    const dx = (tx - buddy.x) * ease;
    const dy = (ty - buddy.y) * ease;
    buddy.x += dx;
    buddy.y += dy;
    if (Math.abs(dx) > 1) buddy.facing = dx > 0 ? 1 : -1;
    buddy.tilt += (Math.max(-0.4, Math.min(0.4, dx * 0.05)) - buddy.tilt) * ease;
    buddy.spin += dt * (holiday === 'CHRISTMAS' ? 0.8 : 1.6) + Math.hypot(dx, dy) * 0.02;

    if (buddy.alpha > 0.3) {
        buddy.travelled += Math.hypot(dx, dy);
        while (buddy.travelled > 9) {
            buddy.travelled -= 9;
            emit(theme, buddy.x, buddy.y + (holiday === 'HALLOWEEN' ? 8 : 0));
        }
    }

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    particles = particles.filter((p) => (p.age += dt) < p.life);
    for (const p of particles) {
        p.vx *= 1 - dt * 1.5;
        p.vy += theme.gravity * dt;
        p.x += p.vx * dt + (holiday === 'CHRISTMAS' ? Math.sin(p.age * 4 + p.spin) * 0.3 : 0);
        p.y += p.vy * dt;
        drawParticle(ctx, p);
    }
    ctx.shadowBlur = 0;
    if (buddy.alpha > 0.01) drawBuddy(ctx, holiday, now);

    frame = buddy.alpha > 0.01 || particles.length || shown ? requestAnimationFrame(draw) : 0;
}

function wake() {
    if (frame || !ambient.value) return;
    last = performance.now() / 1000;
    frame = requestAnimationFrame(draw);
}

function onMove(event: PointerEvent) {
    if (!pointer.inside && buddy.alpha < 0.01) {
        buddy.x = event.clientX;
        buddy.y = event.clientY;
    }
    Object.assign(pointer, {
        x: event.clientX,
        y: event.clientY,
        inside: true,
        movedAt: performance.now() / 1000,
    });
    wake();
}

function onLeave(event: PointerEvent) {
    if (!event.relatedTarget) pointer.inside = false;
}

onMounted(() => {
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onLeave);
});
onUnmounted(() => {
    window.removeEventListener('resize', resize);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerout', onLeave);
    cancelAnimationFrame(frame);
    delete document.documentElement.dataset.holidayCursor;
});

watch(
    ambient,
    (holiday) => {
        const root = document.documentElement;
        if (holiday) {
            root.dataset.holidayCursor = holiday;
            root.style.setProperty('--holiday-cursor', arrowCursor(ARROW_COLORS[holiday]));
            pointer.movedAt = performance.now() / 1000;
            wake();
        } else {
            delete root.dataset.holidayCursor;
            cancelAnimationFrame(frame);
            frame = 0;
            particles = [];
            buddy.alpha = 0;
            canvas.value
                ?.getContext('2d')
                ?.clearRect(0, 0, canvas.value.width, canvas.value.height);
        }
    },
    { immediate: true }
);
</script>

<template>
    <canvas ref="canvas" class="pointer-events-none fixed inset-0 z-80 size-full" />
</template>
