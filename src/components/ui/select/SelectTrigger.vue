<script setup lang="ts">
import type { SelectTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectIcon, SelectTrigger, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectTrigger
    data-slot="select-trigger"
    v-bind="forwardedProps"
    :class="cn(
      'flex h-8 items-center justify-between gap-1 rounded-md border border-input bg-background/60 px-2.5 text-xs outline-none transition-colors hover:bg-background/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:truncate [&>span]:min-w-0',
      props.class,
    )"
  >
    <slot />
    <SelectIcon as-child>
      <svg
        xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="shrink-0 opacity-60" aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </SelectIcon>
  </SelectTrigger>
</template>
