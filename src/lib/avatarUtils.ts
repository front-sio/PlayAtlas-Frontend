export function getInitials(name?: string) {
  if (!name) return '';
  const nameParts = name.trim().split(' ').filter(Boolean);
  const firstInitial = nameParts[0]?.[0] || '';
  const lastInitial = nameParts.length > 1 ? nameParts[nameParts.length - 1]?.[0] || '' : '';
  return (firstInitial + lastInitial).toUpperCase();
}

export function generateColor(name?: string) {
  if (!name) return '#64748b';
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }
  return color;
}
