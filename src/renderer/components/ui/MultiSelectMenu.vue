<script setup lang="ts">
import { ref } from 'vue';
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
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const open = ref(false);

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
                <div class="max-h-60 overflow-y-auto py-1">
                    <DropdownMenuCheckboxItem
                        v-for="opt in options"
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
                            Clear all
                        </DropdownMenuItem>
                    </div>
                </template>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
