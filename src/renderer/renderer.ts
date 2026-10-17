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

const SPLASH_MIN_MS = 400;

const visible = new Promise<number>((resolve) => {
    if (document.visibilityState === 'visible') return resolve(performance.now());
    document.addEventListener('visibilitychange', () => resolve(performance.now()), { once: true });
});

void Promise.all([visible, router.isReady()]).then(([shownAt]) => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    setTimeout(
        () => {
            splash.classList.add('is-hidden');
            splash.addEventListener('transitionend', () => splash.remove(), { once: true });
        },
        Math.max(0, SPLASH_MIN_MS - (performance.now() - shownAt))
    );
});
