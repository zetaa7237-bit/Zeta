export function paginate(items, page = 0, size = 5) {
  const totalPages = Math.max(1, Math.ceil(items.length / size)); const index = Math.min(Math.max(0, Number(page) || 0), totalPages - 1);
  return { items: items.slice(index * size, (index + 1) * size), page: index, totalPages };
}
