const MAX_SLUG = 50;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Lowercase a-z0-9 slug of the title, plus the local date: "hello-world-2026-10-20.md". */
export function fileNameFor(title: string, createdAt: number, ext: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  const date = new Date(createdAt);
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${slug || 'note'}-${stamp}.${ext}`;
}

/** Downloads text as a file. */
export function downloadText(name: string, text: string, mime: string): void {
  downloadBlob(name, new Blob([text], { type: mime }));
}

export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
