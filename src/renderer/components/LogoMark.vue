<script setup lang="ts">
const CONE =
    'M6.2 18 10.9 6.2C11.6 4.3 13.2 3.2 15.2 3.3L17.6 3.5 15.7 4.3C14.4 4.8 13.8 5.9 14.1 7.1L17.8 18Z';
</script>

<template>
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <defs>
            <clipPath id="akko-hat-cone">
                <path :d="CONE" />
            </clipPath>
        </defs>
        <path fill="currentColor" :d="CONE" />
        <path
            fill="#c4b5fd"
            clip-path="url(#akko-hat-cone)"
            d="M4 13.1Q12 15 20 13.1V15.5Q12 17.4 4 15.5Z"
        />
        <ellipse fill="currentColor" cx="12" cy="18" rx="10" ry="2.6" />
    </svg>
</template>
