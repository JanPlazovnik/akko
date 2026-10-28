<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { X } from '@lucide/vue';
import {
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogRoot,
    DialogTitle,
} from 'reka-ui';
import SettingRow from './settings/SettingRow.vue';
import SelectMenu from './ui/SelectMenu.vue';
import NumberField from './ui/NumberField.vue';
import { listStatusLabel, mediaMeta } from '../lib/media-labels';
import { LIST_STATUSES, useListStore, type EntryPatch, type ListStatus } from '../stores/list';
import { useAccountsStore } from '../stores/accounts';
import { useMediaStore } from '../stores/media';
import { ignoreWindowControls } from '../lib/dialog';

const SCORE_FORMATS: Record<string, { max: number; step: number }> = {
    POINT_100: { max: 100, step: 1 },
    POINT_10_DECIMAL: { max: 10, step: 0.1 },
    POINT_10: { max: 10, step: 1 },
    POINT_5: { max: 5, step: 1 },
    POINT_3: { max: 3, step: 1 },
};

const BUTTON =
    'inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-40';

const props = defineProps<{ open: boolean; mediaId: number }>();
const emit = defineEmits<{ 'update:open': [open: boolean] }>();

const list = useListStore();
const accounts = useAccountsStore();
const mediaStore = useMediaStore();

const media = computed(() => mediaStore.mediaFor(props.mediaId));
const entry = computed(() => list.entryFor(props.mediaId));
const score = computed(
    () => SCORE_FORMATS[accounts.anilist?.scoreFormat ?? ''] ?? SCORE_FORMATS.POINT_10
);
const statusOptions = LIST_STATUSES.map((value) => ({ value, label: listStatusLabel(value) }));

const draft = reactive({ status: 'PLANNING' as ListStatus, progress: 0, score: 0, repeat: 0 });
const initial = { ...draft };
const saving = ref(false);
const confirmingRemove = ref(false);

watch(
    () => props.open,
    (open) => {
        if (!open) return;
        Object.assign(draft, {
            status: (entry.value?.status as ListStatus | undefined) ?? 'PLANNING',
            progress: entry.value?.progress ?? 0,
            score: entry.value?.score ?? 0,
            repeat: entry.value?.repeat ?? 0,
        });
        Object.assign(initial, draft);
        confirmingRemove.value = false;
    },
    { immediate: true }
);

const close = () => emit('update:open', false);

// Only changed fields are sent, so the list rules can fill in the rest (e.g. progress starts a show)
async function save() {
    const patch: EntryPatch = {};
    for (const key of ['status', 'progress', 'score', 'repeat'] as const) {
        if (draft[key] !== initial[key]) Object.assign(patch, { [key]: draft[key] });
    }
    if (entry.value && !Object.keys(patch).length) return close();
    saving.value = true;
    const saved = await list.save(props.mediaId, patch);
    saving.value = false;
    if (saved) close();
}

async function remove() {
    if (!confirmingRemove.value) {
        confirmingRemove.value = true;
        return;
    }
    saving.value = true;
    const removed = await list.remove(props.mediaId);
    saving.value = false;
    if (removed) close();
}
</script>

<template>
    <DialogRoot :open="open" @update:open="emit('update:open', $event)">
        <DialogPortal>
            <DialogOverlay class="dialog-overlay fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
            <DialogContent
                class="dialog-content no-drag fixed top-1/2 left-1/2 z-50 flex w-[min(520px,calc(100vw-48px))] -translate-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/70 outline-none"
                @interact-outside="ignoreWindowControls"
            >
                <header class="flex items-center gap-4 border-b border-line p-5">
                    <img
                        v-if="media?.coverImage?.large"
                        :src="media.coverImage.large"
                        class="aspect-2/3 w-14 shrink-0 rounded-lg object-cover"
                        alt=""
                    />
                    <div class="min-w-0 flex-1">
                        <DialogTitle class="truncate pr-8 font-display text-xl font-semibold">
                            {{ media ? accounts.titleOf(media) : $t('listEntry.fallbackTitle') }}
                        </DialogTitle>
                        <DialogDescription class="mt-1 text-xs text-white/45">
                            {{ entry ? $t('listEntry.edit') : $t('listEntry.add') }}
                            <template v-if="media">· {{ mediaMeta(media).join(' · ') }}</template>
                        </DialogDescription>
                    </div>
                    <DialogClose
                        class="absolute top-4 right-4 grid size-8 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <X :size="16" />
                    </DialogClose>
                </header>

                <div class="divide-y divide-line">
                    <SettingRow :title="$t('listEntry.status')">
                        <SelectMenu
                            :model-value="draft.status"
                            :options="statusOptions"
                            :placeholder="$t('listEntry.status')"
                            required
                            @update:model-value="draft.status = $event as ListStatus"
                        />
                    </SettingRow>
                    <SettingRow :title="$t('listEntry.progress')">
                        <NumberField
                            v-model="draft.progress"
                            :max="media?.episodes ?? undefined"
                            :suffix="
                                media?.episodes
                                    ? $t('listEntry.outOf', { max: media.episodes })
                                    : undefined
                            "
                            placeholder="0"
                        />
                    </SettingRow>
                    <SettingRow :title="$t('listEntry.score')">
                        <NumberField
                            v-model="draft.score"
                            :max="score.max"
                            :step="score.step"
                            :suffix="$t('listEntry.outOf', { max: score.max })"
                            placeholder="0"
                        />
                    </SettingRow>
                    <SettingRow :title="$t('listEntry.rewatches')">
                        <NumberField v-model="draft.repeat" placeholder="0" />
                    </SettingRow>
                </div>

                <footer class="flex items-center gap-2 border-t border-line p-4">
                    <button
                        v-if="entry"
                        :class="[BUTTON, 'text-red-400 hover:bg-red-500/10']"
                        :disabled="saving"
                        @click="remove"
                    >
                        {{
                            confirmingRemove
                                ? $t('listEntry.confirmRemove')
                                : $t('listEntry.remove')
                        }}
                    </button>
                    <button
                        :class="[BUTTON, 'ml-auto bg-white/8 hover:bg-white/14']"
                        @click="close"
                    >
                        {{ $t('common.cancel') }}
                    </button>
                    <button
                        :class="[BUTTON, 'bg-white text-black hover:bg-white/85']"
                        :disabled="saving"
                        @click="save"
                    >
                        {{ entry ? $t('common.save') : $t('listEntry.addToList') }}
                    </button>
                </footer>
            </DialogContent>
        </DialogPortal>
    </DialogRoot>
</template>
