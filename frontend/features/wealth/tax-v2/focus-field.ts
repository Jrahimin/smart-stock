/** Prefer the exact control, then an actionable member of the affected group. */
export function focusField(root: HTMLElement | null, path: string) {
  const fields = [...(root?.querySelectorAll<HTMLElement>("[data-path]") ?? [])];
  const target = fields.find((field) => field.dataset.path === path)
    ?? fields.find((field) => field.dataset.path?.startsWith(path + "."))
    ?? fields.filter((field) => field.dataset.path && path.startsWith(field.dataset.path + "."))
      .sort((left, right) => right.dataset.path!.length - left.dataset.path!.length)[0];
  if (!target) return false;
  for (let parent: HTMLElement | null = target; parent && parent !== root; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  const interactive = "input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)";
  const control = target.matches(interactive) ? target : (target.querySelector<HTMLElement>("input:not(:disabled),select:not(:disabled),textarea:not(:disabled)") ?? target.querySelector<HTMLElement>(interactive));
  for (let parent = control?.parentElement; parent && parent !== target; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  (control ?? target.querySelector<HTMLElement>("summary") ?? target)?.focus();
  return true;
}
