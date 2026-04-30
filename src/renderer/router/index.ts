import { createRouter, createWebHashHistory } from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';
import MediaInfo from '../pages/MediaInfo.vue';
import Player from '../pages/Player.vue';
import Settings from '../pages/Settings.vue';

export default createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', component: Dashboard },
        { path: '/media/:id', component: MediaInfo },
        { path: '/player', component: Player },
        { path: '/settings', component: Settings },
    ],
});
