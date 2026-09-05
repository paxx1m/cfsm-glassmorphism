<script setup lang="ts">
import type { SelectContentEmits, SelectContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import { SelectContent, SelectPortal, SelectViewport, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(), {
  position: 'popper',
  sideOffset: 4,
})
const emits = defineEmits<SelectContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')
const forwarded = useForwardPropsEmits(delegatedProps, emits)

// 模态 Dialog 会把 body 设为 pointer-events:none，portal 到 body 的弹层会收不到点击。
// 弹层挂载后 reka-ui 才设置该样式，这里在 open-auto-focus（晚于挂载）时把 body 放行为 auto，
// Dialog 关闭时 reka-ui 会自行清除 body 样式，无需恢复。
function onOpenAutoFocus(): void {
  if (document.body.style.pointerEvents === 'none')
    document.body.style.pointerEvents = 'auto'
}
</script>

<template>
  <SelectPortal>
    <SelectContent
      data-slot="select-content"
      v-bind="{ ...forwarded, ...$attrs }"
      :class="[
        'fixed z-[200] max-h-(--reka-select-content-available-height) min-w-32 overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md pointer-events-auto',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        props.class,
      ]"
      @open-auto-focus="onOpenAutoFocus"
    >
      <SelectViewport class="p-1">
        <slot />
      </SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
