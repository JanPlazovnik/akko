import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';
import MediaInfo from '../pages/MediaInfo.vue';
import Player from '../pages/Player.vue';
import SettingsPage from '../pages/Settings.vue';
const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', component: Dashboard },
        { path: '/search', component: () => import('../pages/Search.vue') },
        { path: '/media/:id', component: MediaInfo },
        { path: '/player', component: Player },
        { path: '/settings', component: SettingsPage },
        { path: '/playground', component: () => import('../pages/Playground.vue') },
    ],
});

export default router;
