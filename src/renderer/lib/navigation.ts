import type { Router } from 'vue-router';

export function goBack(router: Router) {
    if (window.history.state?.back) router.back();
    else void router.push('/');
}
