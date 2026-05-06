<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { toast } from 'vue3-toastify';
import { RefreshCw, FlaskConical } from '@lucide/vue';
import { useLoadingStore } from '../stores/loading';
import { useMediaStore } from '../stores/media';
import { useExtensionStore } from '../stores/extensions';
import SelectMenu from '../components/ui/SelectMenu.vue';
import MultiSelectMenu from '../components/ui/MultiSelectMenu.vue';

const selectVal = ref('');
const multiVal = ref<string[]>([]);
const DEMO_OPTIONS = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
    { value: 'c', label: 'Option C' },
    { value: 'd', label: 'Option D' },
];
const DEMO_MULTI = [
    { value: 'action', label: 'Action' },
    { value: 'comedy', label: 'Comedy' },
    { value: 'drama', label: 'Drama' },
    { value: 'fantasy', label: 'Fantasy' },
    { value: 'horror', label: 'Horror' },
];

const loadingBar = useLoadingStore();
const mediaStore = useMediaStore();
const extensions = useExtensionStore();

onMounted(() => extensions.refresh());

async function testLoadingBar() {
    loadingBar.start();
    await new Promise((r) => setTimeout(r, 2000));
    loadingBar.finish();
}

// --- Extension update checker ---

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | { version: string } | { error: string };

const updateStatuses = ref<Record<string, UpdateStatus>>({});

async function checkAllUpdates() {
    if (!extensions.installed.length) return;
    for (const ext of extensions.installed) updateStatuses.value[ext.id] = 'checking';
    try {
        const updates = await window.api.extensions.checkUpdates();
        const updateMap = new Map(updates.map((u) => [u.id, u.newVersion]));
        for (const ext of extensions.installed) {
            const newVersion = updateMap.get(ext.id);
            updateStatuses.value[ext.id] = newVersion ? { version: newVersion } : 'up-to-date';
        }
        await extensions.refresh();
    } catch (e) {
        for (const ext of extensions.installed) {
            updateStatuses.value[ext.id] = { error: e instanceof Error ? e.message : String(e) };
        }
    }
}

function statusLabel(s: UpdateStatus): string {
    if (s === 'idle') return '';
    if (s === 'checking') return 'checking…';
    if (s === 'up-to-date') return 'up to date';
    if ('version' in s) return `v${s.version} available`;
    if ('error' in s) return `error: ${s.error}`;
    return '';
}

function statusTextColor(s: UpdateStatus): string {
    if (s === 'idle') return 'text-white/30';
    if (s === 'checking') return 'text-blue-300';
    if (s === 'up-to-date') return 'text-emerald-300';
    if ('version' in s) return 'text-amber-300';
    if ('error' in s) return 'text-red-300';
    return '';
}

// --- Per-extension test ---

type TestStatus = 'idle' | 'running' | { ok: boolean } | { error: string };
const testStatuses = ref<Record<string, TestStatus>>({});

async function runTest(id: string) {
    testStatuses.value[id] = 'running';
    try {
        const ok = await window.api.extensions.test(id);
        testStatuses.value[id] = { ok };
    } catch (e) {
        testStatuses.value[id] = { error: e instanceof Error ? e.message : String(e) };
    }
}

function testLabel(s: TestStatus): string {
    if (s === 'idle') return '';
    if (s === 'running') return 'running…';
    if ('ok' in s) return s.ok ? 'pass' : 'fail';
    if ('error' in s) return `error: ${s.error}`;
    return '';
}

function testTextColor(s: TestStatus): string {
    if (s === 'running') return 'text-blue-300';
    if (s !== 'idle' && 'ok' in s) return s.ok ? 'text-emerald-300' : 'text-red-300';
    if (s !== 'idle' && 'error' in s) return 'text-red-300';
    return 'text-white/30';
}
</script>

<template>
    <div class="min-h-full bg-neutral-900 text-white p-8 space-y-10">
        <div>
            <p class="text-[10px] uppercase tracking-[0.16em] text-white/30 mb-1">Dev</p>
            <h1 class="text-2xl font-bold">Playground</h1>
        </div>

        <!-- Extensions -->
        <section class="space-y-3">
            <div class="flex items-center justify-between">
                <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                    Extensions
                </h2>
                <button
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-neutral-800 hover:bg-neutral-700 transition-colors disabled:opacity-40"
                    :disabled="
                        !extensions.installed.length ||
                        Object.values(updateStatuses).some((s) => s === 'checking')
                    "
                    @click="checkAllUpdates"
                >
                    <RefreshCw
                        :size="12"
                        :class="{
                            'animate-spin': Object.values(updateStatuses).some(
                                (s) => s === 'checking'
                            ),
                        }"
                    />
                    Check updates
                </button>
            </div>

            <div v-if="extensions.installed.length" class="space-y-2">
                <div
                    v-for="ext in extensions.installed"
                    :key="ext.id"
                    class="bg-neutral-800 rounded-lg p-3"
                >
                    <div class="flex items-center justify-between gap-3">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="text-sm font-medium truncate">{{ ext.name }}</span>
                            <span class="text-[11px] text-white/30 font-mono shrink-0"
                                >v{{ ext.version }}</span
                            >
                            <span
                                :class="[
                                    'text-[10px] px-1.5 py-0.5 rounded shrink-0',
                                    ext.enabled
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : 'bg-white/6 text-white/30',
                                ]"
                            >
                                {{ ext.enabled ? 'enabled' : 'disabled' }}
                            </span>
                        </div>

                        <div class="flex items-center gap-3 shrink-0">
                            <span
                                :class="[
                                    'text-[11px] font-mono',
                                    statusTextColor(updateStatuses[ext.id] ?? 'idle'),
                                ]"
                            >
                                {{ statusLabel(updateStatuses[ext.id] ?? 'idle') }}
                            </span>
                            <span
                                :class="[
                                    'text-[11px] font-mono',
                                    testTextColor(testStatuses[ext.id] ?? 'idle'),
                                ]"
                            >
                                {{ testLabel(testStatuses[ext.id] ?? 'idle') }}
                            </span>
                            <button
                                class="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs bg-white/6 hover:bg-white/12 transition-colors disabled:opacity-40"
                                :disabled="!ext.enabled || testStatuses[ext.id] === 'running'"
                                @click="runTest(ext.id)"
                            >
                                <FlaskConical :size="11" />
                                Test
                            </button>
                        </div>
                    </div>
                    <p class="text-[10px] text-white/20 font-mono mt-1.5">{{ ext.id }}</p>
                </div>
            </div>

            <p v-else class="text-sm text-white/30">No extensions installed.</p>

            <!-- Store state -->
            <div class="bg-neutral-800/50 rounded-lg p-3 text-xs space-y-0.5">
                <p class="text-white/40">
                    installed: {{ extensions.installed.length }} · loading:
                    {{ extensions.loading }} · pending updates: {{ extensions.updates.length }}
                </p>
                <p class="text-white/40">error: {{ extensions.error ?? 'null' }}</p>
            </div>
        </section>

        <!-- UI Components -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                UI Components
            </h2>
            <div class="flex flex-wrap gap-3 items-center">
                <SelectMenu v-model="selectVal" :options="DEMO_OPTIONS" placeholder="SelectMenu" />
                <MultiSelectMenu
                    v-model="multiVal"
                    :options="DEMO_MULTI"
                    placeholder="MultiSelectMenu"
                />
            </div>
            <div class="text-xs text-white/30 font-mono space-y-1">
                <p>SelectMenu: {{ selectVal || 'empty' }}</p>
                <p>MultiSelectMenu: {{ multiVal.length ? multiVal.join(', ') : 'empty' }}</p>
            </div>
        </section>

        <!-- Toasts -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">Toasts</h2>
            <div class="flex flex-wrap gap-2">
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.success('Success')"
                >
                    Success
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.error('Error')"
                >
                    Error
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.warn('Warning')"
                >
                    Warning
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="toast.info('Info')"
                >
                    Info
                </button>
            </div>
        </section>

        <!-- Loading bar -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Loading Bar
            </h2>
            <div class="flex gap-2">
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="testLoadingBar()"
                >
                    Simulate 2s load
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="loadingBar.start()"
                >
                    Start
                </button>
                <button
                    class="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm transition-colors"
                    @click="loadingBar.finish()"
                >
                    Finish
                </button>
            </div>
        </section>

        <!-- Store state -->
        <section class="space-y-3">
            <h2 class="text-sm font-semibold text-white/60 uppercase tracking-wider">
                Store State
            </h2>
            <div class="grid grid-cols-2 gap-3">
                <div class="bg-neutral-800 rounded-lg p-4 space-y-1.5 text-xs">
                    <p class="font-semibold text-white/80">Media</p>
                    <p class="text-white/40">dashboardLoading: {{ mediaStore.dashboardLoading }}</p>
                    <p class="text-white/40">
                        dashboardError: {{ mediaStore.dashboardError?.message ?? 'null' }}
                    </p>
                    <p class="text-white/40">
                        selectedMedia: {{ mediaStore.selectedMedia?.id ?? 'null' }}
                    </p>
                    <p class="text-white/40">
                        trending: {{ mediaStore.dashboard?.trending?.media?.length ?? 0 }} items
                    </p>
                </div>
                <div class="bg-neutral-800 rounded-lg p-4 space-y-1.5 text-xs">
                    <p class="font-semibold text-white/80">Loading Bar</p>
                    <p class="text-white/40">visible: {{ loadingBar.visible }}</p>
                    <p class="text-white/40">progress: {{ loadingBar.progress.toFixed(1) }}%</p>
                </div>
            </div>
        </section>
    </div>
</template>
