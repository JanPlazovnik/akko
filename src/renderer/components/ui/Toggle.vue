<script setup lang="ts">
defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>();
defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
    <button
        type="button"
        role="switch"
        :aria-checked="modelValue"
        :aria-label="label"
        :disabled="disabled"
        :class="[
            'relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-40',
            modelValue ? 'bg-accent' : 'bg-white/15',
        ]"
        @click="$emit('update:modelValue', !modelValue)"
    >
        <span
            :class="[
                'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]',
                modelValue ? 'left-[calc(100%-1.125rem)]' : 'left-0.5',
            ]"
        />
    </button>
</template>
