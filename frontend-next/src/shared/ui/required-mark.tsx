/**
 * Marks a field that is required to submit an experiment. Visual-only asterisk
 * with an accessible label so screen readers announce it.
 */
export function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" title="提交前必填">
      <span aria-hidden>*</span>
      <span className="sr-only">（必填）</span>
    </span>
  )
}
