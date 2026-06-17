export function isSectionLoading<T>(isLoading: boolean, data: T | undefined): boolean {
  return isLoading && data === undefined;
}
