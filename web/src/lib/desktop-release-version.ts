type ParsedVersion = { numbers: [number, number, number]; prerelease: string[] | null };

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number);
  if (numbers.some((number) => !Number.isSafeInteger(number) || number < 0)) return null;
  const prerelease = match[4] ? match[4].split(".") : null;
  if (prerelease?.some((part) => !part || !/^[0-9A-Za-z-]+$/.test(part))) return null;
  return { numbers: numbers as [number, number, number], prerelease };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const a = left.replace(/^0+(?=\d)/, "");
    const b = right.replace(/^0+(?=\d)/, "");
    return a.length !== b.length ? a.length < b.length ? -1 : 1 : a < b ? -1 : a > b ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareReleaseVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) {
      return a.numbers[index] < b.numbers[index] ? -1 : 1;
    }
  }
  if (a.prerelease === null && b.prerelease === null) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (compared !== 0) return compared;
  }
  return a.prerelease.length === b.prerelease.length
    ? 0
    : a.prerelease.length < b.prerelease.length ? -1 : 1;
}
