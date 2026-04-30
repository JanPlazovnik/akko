<script setup lang="ts">
import { ref } from 'vue';

const magnetUri = ref('');
const videoSrc = ref('');

const onSubmit = async () => {
    const { streamUrl } = await window.api.startStream(magnetUri.value);
    videoSrc.value = streamUrl;
};
</script>

<template>
    <div>
        <input v-model="magnetUri" type="text" placeholder="Magnet" class="border p-2 rounded" />
        <button @click="onSubmit" class="bg-blue-500 text-white p-2 rounded">Play</button>
        <video v-if="videoSrc" :src="videoSrc" controls autoplay />
    </div>
</template>
