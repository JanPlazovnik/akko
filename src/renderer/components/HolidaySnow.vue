<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useAmbientEffects } from '../lib/holidays';

const FLAKES = 70;

const canvas = ref<HTMLCanvasElement | null>(null);
const ambient = useAmbientEffects();
const snowing = ref(false);

type Flake = { x: number; y: number; r: number; speed: number; sway: number; phase: number };
let flakes: Flake[] = [];
let width = 0;
let height = 0;
let frame = 0;
let last = 0;

const newFlake = (y: number): Flake => ({
    x: Math.random() * width,
    y,
    r: 0.8 + Math.random() * 1.8,
    speed: 14 + Math.random() * 30,
    sway: 6 + Math.random() * 14,
    phase: Math.random() * Math.PI * 2,
});

function resize() {
    const el = canvas.value;
    if (!el) return;
    width = el.clientWidth;
    height = el.clientHeight;
    el.width = width * devicePixelRatio;
    el.height = height * devicePixelRatio;
    if (!flakes.length)
        flakes = Array.from({ length: FLAKES }, () => newFlake(Math.random() * height));
}

function draw(time: number) {
    const ctx = canvas.value?.getContext('2d');
    if (!ctx) return;
    const dt = Math.min((time - last) / 1000, 0.1);
    last = time;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    for (const flake of flakes) {
        flake.y += flake.speed * dt;
        flake.phase += dt;
        if (flake.y > height + 4) Object.assign(flake, newFlake(-4));
        ctx.globalAlpha = 0.35 + flake.r / 5;
        ctx.beginPath();
        ctx.arc(flake.x + Math.sin(flake.phase) * flake.sway, flake.y, flake.r, 0, Math.PI * 2);
        ctx.fill();
    }
    frame = requestAnimationFrame(draw);
}

const observer = new ResizeObserver(resize);
onMounted(() => canvas.value && observer.observe(canvas.value));
onUnmounted(() => {
    observer.disconnect();
    cancelAnimationFrame(frame);
});

watch(
    () => ambient.value === 'CHRISTMAS',
    (active) => {
        snowing.value = active;
        cancelAnimationFrame(frame);
        if (active) {
            last = performance.now();
            frame = requestAnimationFrame(draw);
        }
    },
    { immediate: true }
);
</script>

<template>
    <canvas
        ref="canvas"
        :class="[
            'pointer-events-none absolute inset-0 size-full mask-b-from-60% transition-opacity duration-1000',
            snowing ? 'opacity-100' : 'opacity-0',
        ]"
    />
</template>
