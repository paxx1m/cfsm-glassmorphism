<script setup lang="ts">
import type { SelectRootEmits, SelectRootProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectRoot, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectRootProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SelectRootEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <SelectRoot data-slot="select" v-bind="forwarded">
    <slot />
  </SelectRoot>
</template>
