/** 解析服务器分组（server_group 可能包含单组或逗号分隔的多组） */
export function parseNodeGroups(group: string | null | undefined): string[] {
  if (!group)
    return []
  return String(group)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}