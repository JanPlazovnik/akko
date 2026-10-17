<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
    modelValue: number;
    suffix?: string;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const draft = ref(props.modelValue ? String(props.modelValue) : '');

watch(
    () => props.modelValue,
    (value) => (draft.value = value ? String(value) : '')
);

function commit() {
    const value = Number(draft.value) || 0;
    if (value !== props.modelValue) emit('update:modelValue', value);
}
</script>

<template>
    <label
        class="flex h-9 w-36 items-center rounded-lg bg-white/5 px-3 ring-1 ring-line focus-within:ring-accent/60"
    >
        <input
            v-model="draft"
            type="number"
            :min="min ?? 0"
            :max="max"
            :step="step ?? 1"
            :placeholder="placeholder"
            class="w-full min-w-0 [appearance:textfield] bg-transparent text-sm tabular-nums outline-none placeholder:text-white/35 [&::-webkit-inner-spin-button]:appearance-none"
            @change="commit"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span v-if="suffix" class="ml-2 shrink-0 text-xs text-white/40">{{ suffix }}</span>
    </label>
</template>
