<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{ title: string; sections: { id: string; label: string }[] }>();

const active = ref(props.sections[0]?.id);
let scroller: HTMLElement | null = null;

function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// The last section scrolled up to near the top, or the last one once the page scrolls to the
// bottom (not while it's still empty and loading)
function update() {
    if (!scroller) return;
    const { sections } = props;
    const bottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    if (scroller.scrollTop > 0 && bottom) {
        active.value = sections[sections.length - 1].id;
        return;
    }
    const threshold = scroller.getBoundingClientRect().top + 120;
    active.value =
        sections
            .filter(
                ({ id }) =>
                    (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <=
                    threshold
            )
            .pop()?.id ?? sections[0].id;
}

onMounted(() => {
    scroller = document.querySelector('main');
    scroller?.addEventListener('scroll', update, { passive: true });
    update();
});

onUnmounted(() => scroller?.removeEventListener('scroll', update));
</script>

<template>
    <aside class="sticky top-0 w-56 shrink-0 self-start px-5 py-8">
        <h1 class="px-3 font-display text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <nav class="mt-6 space-y-0.5">
            <button
                v-for="section in sections"
                :key="section.id"
                :class="[
                    'block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    active === section.id
                        ? 'bg-white/8 font-medium text-white'
                        : 'text-white/50 hover:text-white',
                ]"
                @click="scrollTo(section.id)"
            >
                {{ section.label }}
            </button>
        </nav>
    </aside>
</template>
