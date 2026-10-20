/** A button ID made from its label: "About us" → "about_us" (callback data is at most 64 bytes). */
export function buttonIdFrom(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
