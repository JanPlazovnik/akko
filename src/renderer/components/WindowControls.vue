<script setup lang="ts">
import { Minus, Square, X } from '@lucide/vue';

const { minimizeWindow, maximizeWindow, closeWindow } = window.api;

const BUTTON =
    'no-drag w-11 flex items-center justify-center text-white/60 hover:text-white transition-colors';
</script>

<template>
    <div class="window-controls pointer-events-auto flex shrink-0 items-stretch self-stretch">
        <button
            :class="[BUTTON, 'hover:bg-white/10']"
            :title="$t('window.minimize')"
            @click="minimizeWindow()"
        >
            <Minus :size="14" />
        </button>
        <button
            :class="[BUTTON, 'hover:bg-white/10']"
            :title="$t('window.maximize')"
            @click="maximizeWindow()"
        >
            <Square :size="12" />
        </button>
        <button
            :class="[BUTTON, 'hover:bg-red-600']"
            :title="$t('window.close')"
            @click="closeWindow()"
        >
            <X :size="14" />
        </button>
    </div>
</template>
