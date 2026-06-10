/**
 * 把 items 中 index 处的元素朝 direction 方向与相邻元素交换，返回新数组。
 * 越界或到达边界时返回原数组引用（调用方可据此判断 no-op）。纯函数，便于单测。
 */
export function moveInOrder<T>(
  items: T[],
  index: number,
  direction: 'up' | 'down',
): T[] {
  const target = direction === 'up' ? index - 1 : index + 1
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  ) {
    return items
  }
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
