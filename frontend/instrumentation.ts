export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") {
    return;
  }

  if (!process.env.SERVER_API_BASE_URL?.trim()) {
    console.error(
      "[dashboard-ssr] SERVER_API_BASE_URL is required in production for internal backend SSR fetches.",
    );
  }
}
