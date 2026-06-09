"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/context/auth-context";
import { getMoneySnapshot, patchMoneySnapshot } from "@/lib/api/wealth-api";

export function useMoneySnapshot() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "anonymous";

  const snapshotQuery = useQuery({
    queryKey: ["wealth", "snapshot", userId],
    queryFn: getMoneySnapshot,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const patchMutation = useMutation({
    mutationFn: patchMoneySnapshot,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wealth", "snapshot", userId] });
      await queryClient.invalidateQueries({ queryKey: ["wealth", "dashboard", userId] });
    },
  });

  return {
    snapshot: snapshotQuery.data,
    isLoading: snapshotQuery.isLoading,
    isError: snapshotQuery.isError,
    patchSnapshot: patchMutation.mutateAsync,
    isSaving: patchMutation.isPending,
    refetch: snapshotQuery.refetch,
  };
}
