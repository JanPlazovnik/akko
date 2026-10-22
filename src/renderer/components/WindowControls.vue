<script setup lang="ts">
import { Minus, Square, X } from '@lucide/vue';

const { minimizeWindow, maximizeWindow, closeWindow } = window.api;

const BUTTON =
    'no-drag w-11 flex items-center justify-center text-white/60 hover:text-white transition-colors';
</script>

<template>
    <!-- Above dialog backdrops, so the window can still be minimized or closed -->
    <div
        class="window-controls pointer-events-auto relative z-60 flex shrink-0 items-stretch self-stretch"
    >
        <button :class="[BUTTON, 'hover:bg-white/10']" title="Minimize" @click="minimizeWindow()">
            <Minus :size="14" />
        </button>
        <button :class="[BUTTON, 'hover:bg-white/10']" title="Maximize" @click="maximizeWindow()">
            <Square :size="12" />
        </button>
        <button :class="[BUTTON, 'hover:bg-red-600']" title="Close" @click="closeWindow()">
            <X :size="14" />
        </button>
    </div>
</template>
