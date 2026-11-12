"use client";

import { useMutation, useQueryClient, type MutateOptions } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/context/auth-context";
import { assertBackendAuthSession, getBackendAuthSessionVersion } from "@/lib/api/backend-api-client";
import { refreshAccountQueries } from "@/features/watchlist/lib/account-query-cache";

export type AccountMutationContext = { userId: string; sessionVersion: number };
type Invocation<T> = { input: T; account: AccountMutationContext };

/** Bind intent before TanStack can pause it; check again at every actual request. */
export function useAccountMutation<TData, TVariables>(kind: string,
  operation: (input: TVariables, checkSession: () => void) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData, input: TVariables, account: AccountMutationContext) => void | Promise<unknown>;
    onSettled?: (data: TData | undefined, error: Error | null, input: TVariables, account: AccountMutationContext) => void | Promise<unknown>;
  },
) {
  const { user } = useAuth();
  const account = { userId: user?.id ?? "anonymous", sessionVersion: getBackendAuthSessionVersion() };
  const client = useQueryClient();
  const mutation = useMutation<TData, Error, Invocation<TVariables>, AccountMutationContext>({
    mutationKey: ["account-watchlist", account.userId, kind],
    onMutate: (invocation) => invocation.account,
    mutationFn: ({ input, account: owner }) => {
      const check = () => assertBackendAuthSession(owner.sessionVersion);
      check();
      return operation(input, check);
    },
    onSuccess: (data, invocation) => options?.onSuccess?.(data, invocation.input, invocation.account),
    onSettled: (data, error, invocation) => options?.onSettled
      ? options.onSettled(data, error, invocation.input, invocation.account)
      : refreshAccountQueries(client, invocation.account.userId, invocation.account.sessionVersion),
  });
  const callbacks = (value?: MutateOptions<TData, Error, TVariables, AccountMutationContext>): MutateOptions<TData, Error, Invocation<TVariables>, AccountMutationContext> | undefined => value && ({
    onSuccess: (data, invocation, context, info) => value.onSuccess?.(data, invocation.input, context, info),
    onError: (error, invocation, context, info) => value.onError?.(error, invocation.input, context, info),
    onSettled: (data, error, invocation, context, info) => value.onSettled?.(data, error, invocation.input, context, info),
  });
  return { ...mutation, variables: mutation.variables?.input,
    mutate: (input: TVariables, value?: MutateOptions<TData, Error, TVariables, AccountMutationContext>) => mutation.mutate({ input, account }, callbacks(value)),
    mutateAsync: (input: TVariables, value?: MutateOptions<TData, Error, TVariables, AccountMutationContext>) => mutation.mutateAsync({ input, account }, callbacks(value)),
  };
}
