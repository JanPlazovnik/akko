<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, Check } from '@lucide/vue';
import {
    DropdownMenuRoot,
    DropdownMenuTrigger,
    DropdownMenuPortal,
    DropdownMenuContent,
    DropdownMenuItem,
} from 'reka-ui';

const props = defineProps<{
    modelValue: string;
    options: { value: string; label: string }[];
    placeholder: string;
    scrollable?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref(false);

function select(value: string) {
    emit('update:modelValue', props.modelValue === value ? '' : value);
}
</script>

<template>
    <DropdownMenuRoot v-model:open="open">
        <DropdownMenuTrigger as-child>
            <button
                :class="[
                    'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs transition-colors outline-none cursor-pointer',
                    modelValue
                        ? 'bg-white/15 text-white'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white/70',
                ]"
            >
                {{ modelValue ? options.find((o) => o.value === modelValue)?.label : placeholder }}
                <ChevronDown
                    :size="12"
                    :class="['transition-transform duration-150', open ? 'rotate-180' : '']"
                />
            </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
            <DropdownMenuContent
                :class="[
                    'z-50 bg-[#1c1c1c] border border-white/8 rounded-xl shadow-2xl py-1 min-w-36',
                    scrollable ? 'max-h-64 overflow-y-auto' : '',
                ]"
                :side-offset="6"
                align="start"
            >
                <DropdownMenuItem
                    v-for="opt in options"
                    :key="opt.value"
                    :class="[
                        'flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer outline-none select-none rounded-md mx-1 transition-colors',
                        'data-[highlighted]:bg-white/8',
                        modelValue === opt.value ? 'text-white' : 'text-white/50',
                    ]"
                    @select="() => select(opt.value)"
                >
                    {{ opt.label }}
                    <Check
                        v-if="modelValue === opt.value"
                        :size="11"
                        class="ml-3 shrink-0 text-white/60"
                    />
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
