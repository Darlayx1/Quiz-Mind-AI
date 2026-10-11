/** Turn existing one-response provider fixtures into one-chunk SSE fixtures.
 * HTTP failures and non-Gemini requests keep their original behavior. */
export function streamingFixtureFetch(fetchFixture: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await fetchFixture(input, init);
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes(':streamGenerateContent') || !response.ok || !response.headers.get('content-type')?.includes('application/json')) return response;
    return new Response('data: ' + JSON.stringify(await response.json()) + '\n\n', {
      status: response.status, headers: { 'Content-Type': 'text/event-stream' }
    });
  };
}
