import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Vue3Toastify, { type ToastContainerOptions } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import App from './App.vue';
import './assets/index.css';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.use(Vue3Toastify, {
    autoClose: 4000,
    theme: 'dark',
    position: 'bottom-right',
    transition: 'slide',
} satisfies ToastContainerOptions);
app.mount('#app');
