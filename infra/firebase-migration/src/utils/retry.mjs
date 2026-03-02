export async function withRetry(task, {
  retries = 5,
  baseMs = 500,
  maxMs = 10_000,
  shouldRetry = () => true,
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await task(attempt);
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
}
