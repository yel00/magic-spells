// POST /api/tasting  { seeds: [{ title, artist, album?, year? }], note?, count? }
// Runs a music tasting session: works out what the listener's songs share and
// proposes songs from other genres with the same qualities. Uses Claude through
// the Anthropic API; needs ANTHROPIC_API_KEY. The key stays on the server.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { bearer, spotifyUser } from './_lib/auth.js';
import { buildPrompt, cleanRequest, isAllowed, readApiKey, status, SYSTEM, takeQuota, TastingSchema } from './_lib/tasting.js';

// A thoughtful answer takes around half a minute; allow up to a minute.
export const config = { maxDuration: 60 };

const used = new Map();
let client;
let clientKey = '';

/** One request to the model. `withFallback` adds Anthropic's hand-off to another model if this one declines. */
function ask(request, withFallback) {
  return client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(request) }],
    output_config: { effort: 'medium', format: betaZodOutputFormat(TastingSchema) },
    ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  // Opening this address in a browser shows whether the feature is switched on.
  if (req.method === 'GET') return res.status(200).json(status(process.env));
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const apiKey = readApiKey(process.env);
  if (!apiKey) return res.status(501).json({ error: 'No Anthropic key is set on the server. Add ANTHROPIC_API_KEY to the Production environment in Vercel and redeploy.' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Sign in with Spotify first.' });
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const request = cleanRequest(body);
  if (!request) return res.status(400).json({ error: 'Choose at least one song to start from.' });

  let userId;
  try {
    userId = await spotifyUser(token);
  } catch {
    return res.status(502).json({ error: 'Couldn’t confirm your Spotify sign-in just now.' });
  }
  if (!userId) return res.status(401).json({ error: 'Spotify did not recognise this sign-in.' });
  if (!isAllowed(userId, process.env.AI_ALLOWED_USERS)) return res.status(403).json({ error: 'Tasting sessions aren’t enabled for this account.' });
  if (!takeQuota(used, userId, Date.now(), Number(process.env.AI_DAILY_LIMIT) || undefined)) {
    return res.status(429).json({ error: 'That’s today’s limit for tasting sessions. Try again tomorrow.' });
  }

  // No automatic retries: one attempt has to fit inside the function's time limit.
  if (!client || clientKey !== apiKey) {
    client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });
    clientKey = apiKey;
  }
  try {
    let message;
    try {
      message = await ask(request, true);
    } catch (e) {
      // The hand-off option is newer than the rest of the request. If an account doesn't accept it,
      // the request is refused straight away, so ask again without it rather than fail.
      if (!(e instanceof Anthropic.BadRequestError || e instanceof Anthropic.PermissionDeniedError)) throw e;
      message = await ask(request, false);
    }
    if (message.stop_reason === 'refusal') return res.status(422).json({ error: 'The guide declined that request. Try different songs or wording.' });
    if (message.stop_reason === 'max_tokens' || !message.parsed_output) return res.status(502).json({ error: 'The guide’s answer came back incomplete. Please try again.' });
    return res.status(200).json(message.parsed_output);
  } catch (e) {
    // These are problems with the owner's Anthropic account or key; say what Anthropic said so they can be fixed.
    if (e instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: `Anthropic rejected the API key (${reason(e)}). Check the key in Vercel, then redeploy.` });
    if (e instanceof Anthropic.PermissionDeniedError) return res.status(502).json({ error: `Anthropic refused this account’s request (${reason(e)}).` });
    if (e instanceof Anthropic.BadRequestError) return res.status(502).json({ error: `Anthropic didn’t accept the request (${reason(e)}).` });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'The AI service is busy or this key’s limit was reached. Try again in a minute.' });
    if (e instanceof Anthropic.APIConnectionTimeoutError) return res.status(504).json({ error: 'The guide took too long to answer. Please try again.' });
    if (e instanceof Anthropic.APIError) {
      console.error('tasting failed', e.status, e.message);
      return res.status(502).json({ error: `The AI service returned an error (${e.status ?? 'no status'}). Please try again.` });
    }
    // Not an HTTP error: the SDK could not read the answer as the expected structure (for example, it was cut short).
    if (e instanceof Anthropic.AnthropicError) return res.status(502).json({ error: 'The guide’s answer came back incomplete. Please try again.' });
    console.error('tasting failed', e);
    return res.status(502).json({ error: 'Something went wrong running the session.' });
  }
}

/** Anthropic's own short explanation of an error, e.g. "invalid x-api-key" or "credit balance is too low". */
function reason(e) {
  const text = e?.error?.error?.message || e?.message || 'no reason given';
  return String(text).replace(/\s+/g, ' ').slice(0, 200);
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
