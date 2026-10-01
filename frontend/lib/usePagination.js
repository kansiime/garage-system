import { useEffect, useMemo, useState } from 'react';

export function usePagination(items, defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex]
  );

  // Reset to page 1 whenever the items list changes length
  useEffect(() => { setPage(1); }, [items.length, pageSize]);

  const goTo = (p) => setPage(Math.max(1, Math.min(totalPages, p)));

  return {
    page: safePage,
    setPage: goTo,
    pageSize,
    setPageSize,
    totalPages,
    startIndex,
    endIndex,
    pageItems,
  };
}