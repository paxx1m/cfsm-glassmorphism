<script setup lang="ts">
import type { SwitchRootEmits, SwitchRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SwitchRoot, SwitchThumb, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SwitchRootProps & { class?: HTMLAttributes['class'] }>()

const emits = defineEmits<SwitchRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SwitchRoot
    v-slot="slotProps"
    data-slot="switch"
    v-bind="forwarded"
    :class="cn(
      'peer inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-selection data-[state=unchecked]:bg-slate-500/30',
      props.class,
    )"
  >
    <SwitchThumb
      data-slot="switch-thumb"
      :class="cn(
        'pointer-events-none block size-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
      )"
    >
      <slot v-bind="slotProps" name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>
