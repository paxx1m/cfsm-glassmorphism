import type { NodeData } from '@/stores/nodes'

/**
 * 节点搜索：匹配名称、地区、操作系统、CPU 型号、分组与标签。
 * CF-Server-Monitor 公开接口不暴露真实 IP，因此不按 IP 搜索。
 */
export function isNodeMatchSearch(node: NodeData, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase()
  if (!normalized)
    return true

  const haystacks = [
    node.name,
    node.region,
    node.os,
    node.cpu_info,
    node.server_group,
    node.tags,
    node.kernel_version,
    node.arch,
  ]

  return haystacks.some(haystack =>
    String(haystack ?? '').toLowerCase().includes(normalized),
  )
}