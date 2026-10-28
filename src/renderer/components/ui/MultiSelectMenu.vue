<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ChevronDown, Check } from '@lucide/vue';
import {
    DropdownMenuRoot,
    DropdownMenuTrigger,
    DropdownMenuPortal,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuSeparator,
    DropdownMenuItem,
} from 'reka-ui';

const props = defineProps<{
    modelValue: string[];
    options: { value: string; label: string }[];
    placeholder: string;
    searchable?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const open = ref(false);
const query = ref('');
const searchEl = ref<HTMLInputElement | null>(null);

// Long lists show what's picked first, and narrow down as you type
const visible = computed(() => {
    if (!props.searchable) return props.options;
    const text = query.value.trim().toLowerCase();
    if (text) return props.options.filter((o) => o.label.toLowerCase().includes(text));
    const picked = props.options.filter((o) => props.modelValue.includes(o.value));
    return [...picked, ...props.options.filter((o) => !props.modelValue.includes(o.value))];
});

watch(open, async (isOpen) => {
    if (!isOpen || !props.searchable) return;
    query.value = '';
    await nextTick();
    searchEl.value?.focus();
});

// The menu's type-ahead would otherwise take the keys meant for the search box
const MENU_KEYS = ['ArrowDown', 'ArrowUp', 'Escape', 'Tab'];
function keepTyping(e: KeyboardEvent) {
    if (!MENU_KEYS.includes(e.key)) e.stopPropagation();
}

function toggle(value: string, checked: boolean) {
    const arr = [...props.modelValue];
    if (checked) arr.push(value);
    else arr.splice(arr.indexOf(value), 1);
    emit('update:modelValue', arr);
}
</script>

<template>
    <DropdownMenuRoot v-model:open="open">
        <DropdownMenuTrigger as-child>
            <button
                :class="[
                    'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs transition-colors outline-none cursor-pointer',
                    modelValue.length
                        ? 'bg-white/15 text-white'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white/70',
                ]"
            >
                {{ placeholder }}{{ modelValue.length ? ` (${modelValue.length})` : '' }}
                <ChevronDown
                    :size="12"
                    :class="['transition-transform duration-150', open ? 'rotate-180' : '']"
                />
            </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
            <DropdownMenuContent
                class="z-50 bg-[#1c1c1c] border border-white/8 rounded-xl shadow-2xl overflow-hidden min-w-44"
                :side-offset="6"
                align="start"
            >
                <div v-if="searchable" class="border-b border-white/8 p-1.5">
                    <input
                        ref="searchEl"
                        v-model="query"
                        :placeholder="$t('menu.search', { name: placeholder.toLocaleLowerCase() })"
                        class="w-full rounded-md bg-white/5 px-2.5 py-1.5 text-xs outline-none placeholder:text-white/30"
                        @keydown="keepTyping"
                    />
                </div>
                <div class="max-h-60 overflow-y-auto py-1">
                    <p v-if="!visible.length" class="px-4 py-2 text-xs text-white/35">
                        {{ options.length ? $t('menu.noMatches') : $t('common.loading') }}
                    </p>
                    <DropdownMenuCheckboxItem
                        v-for="opt in visible"
                        :key="opt.value"
                        :checked="modelValue.includes(opt.value)"
                        :class="[
                            'flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer outline-none select-none rounded-md mx-1 transition-colors',
                            'data-[highlighted]:bg-white/8',
                            modelValue.includes(opt.value) ? 'text-white' : 'text-white/50',
                        ]"
                        @select.prevent="toggle(opt.value, !modelValue.includes(opt.value))"
                    >
                        <span
                            :class="[
                                'w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                                modelValue.includes(opt.value)
                                    ? 'bg-white border-white'
                                    : 'border-white/20',
                            ]"
                        >
                            <Check
                                v-if="modelValue.includes(opt.value)"
                                :size="9"
                                stroke-width="3"
                                class="text-black"
                            />
                        </span>
                        {{ opt.label }}
                    </DropdownMenuCheckboxItem>
                </div>

                <template v-if="modelValue.length">
                    <DropdownMenuSeparator class="border-t border-white/8" />
                    <div class="py-1">
                        <DropdownMenuItem
                            class="px-3 py-1.5 text-[11px] text-white/35 cursor-pointer outline-none select-none rounded-md mx-1 data-[highlighted]:text-white/60 transition-colors"
                            @select="emit('update:modelValue', [])"
                        >
                            {{ $t('menu.clearAll') }}
                        </DropdownMenuItem>
                    </div>
                </template>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
