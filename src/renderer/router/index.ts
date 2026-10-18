import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';
import MediaInfo from '../pages/MediaInfo.vue';
import Player from '../pages/Player.vue';
import SettingsPage from '../pages/Settings.vue';
import { useSettingsStore } from '../stores/settings';
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', component: Dashboard },
        { path: '/search', component: () => import('../pages/Search.vue') },
        { path: '/library', component: () => import('../pages/Library.vue') },
        { path: '/media/:id', component: MediaInfo },
        { path: '/player', component: Player },
        { path: '/settings', component: SettingsPage },
        { path: '/setup', component: () => import('../pages/Setup.vue'), meta: { bare: true } },
        { path: '/playground', component: () => import('../pages/Playground.vue') },
    ],
});

router.beforeEach(async (to) => {
    const store = useSettingsStore();
    if (!store.settings) await store.load();
    const onboarded = store.settings?.onboarded ?? true;
    if (!onboarded && to.path !== '/setup') return '/setup';
    if (onboarded && to.path === '/setup') return '/';
});

export default router;
