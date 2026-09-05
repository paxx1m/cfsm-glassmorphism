<script setup lang="ts">
import type { SelectItemProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectItem, SelectItemIndicator, SelectItemText, useForwardProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = reactiveOmit(props, 'class')
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectItem
    data-slot="select-item"
    v-bind="forwardedProps"
    :class="cn(
      'relative flex w-full cursor-default select-none items-center gap-1.5 rounded-sm py-1.5 pl-2 pr-6 text-xs outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <SelectItemText>
      <slot />
    </SelectItemText>
    <SelectItemIndicator class="absolute right-2 inline-flex">
      <svg
        xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
        class="opacity-70" aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </SelectItemIndicator>
  </SelectItem>
</template>
