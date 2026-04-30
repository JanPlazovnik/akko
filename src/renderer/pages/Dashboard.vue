<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
</script>

<template>
    <div>
        <button @click="router.push('/player')">Go to Player</button>
    </div>
</template>
