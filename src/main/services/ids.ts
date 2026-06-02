export function createId(prefix: string): string {
  const entropy = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${entropy}`;
}

export function slugifyProjectTitle(title: string): string {
  const asciiSlug = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return asciiSlug || `project-${new Date().toISOString().slice(0, 10)}`;
}
