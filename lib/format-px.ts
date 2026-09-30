export function formatPxDistance(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value < 1) return `${value.toFixed(2)} px`;
  if (value < 100) return `${value.toFixed(1)} px`;
  return `${Math.round(value)} px`;
}
