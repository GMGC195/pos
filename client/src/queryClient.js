import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds fresh
      gcTime: 1000 * 60 * 15, // 15 minutes garbage collection (TanStack Query v5)
    },
  },
});
