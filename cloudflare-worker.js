/**
 * Abe's Baking — Stripe Webhook Handler (Cloudflare Worker)
 *
 * Listens for checkout.session.completed events from Stripe.
 * When a product is purchased, decrements its quantity in products.json on GitHub.
 * If quantity reaches 0, sets inStock: false (shows "Sold Out" on the website).
 *
 * ── SETUP (one-time, ~10 minutes) ──────────────────────────────────────────
 *
 * 1. Create a free Cloudflare account at cloudflare.com
 *
 * 2. Install Wrangler (Cloudflare's CLI):
 *    npm install -g wrangler
 *
 * 3. Login:
 *    wrangler login
 *
 * 4. Create a new worker project and copy this file in:
 *    wrangler init abes-baking-webhook
 *    (replace the generated index.js with this file)
 *
 * 5. Set your secrets (these are stored securely — not in code):
 *    wrangler secret put GITHUB_TOKEN
 *    (paste your GitHub personal access token — same one you use in the admin panel)
 *
 *    wrangler secret put STRIPE_WEBHOOK_SECRET
 *    (you'll get this from Stripe in step 7 — come back to this)
 *
 * 6. Deploy:
 *    wrangler deploy
 *    (note the worker URL shown, e.g. https://abes-baking-webhook.yourname.workers.dev)
 *
 * 7. In your Stripe Dashboard:
 *    → Developers → Webhooks → Add endpoint
 *    → URL: paste your worker URL from step 6
 *    → Events: select "checkout.session.completed"
 *    → After creating, click "Reveal" next to "Signing secret"
 *    → Run: wrangler secret put STRIPE_WEBHOOK_SECRET
 *       and paste the signing secret
 *
 * 8. In your Stripe Dashboard for each Payment Link:
 *    → Payment Links → click a link → copy the plink_... from the page URL
 *    → Paste it into the "Stripe Link ID" field in your admin panel
 *    → Save the menu
 *
 * That's it! Now when someone buys an item, the website automatically updates.
 * ────────────────────────────────────────────────────────────────────────────
 */

const GITHUB_API = 'https://api.github.com/repos/abemfortin/abesbaking/contents/products.json';

export default {
  async fetch(request, env) {
    if (request.method === 'GET') return new Response('Webhook endpoint is live.', { status: 200 });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const body = await request.text();
    const sig  = request.headers.get('stripe-signature');

    if (!sig || !env.STRIPE_WEBHOOK_SECRET) {
      return new Response('Missing signature or secret', { status: 400 });
    }

    const valid = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
    if (!valid) return new Response('Invalid signature', { status: 401 });

    let event;
    try { event = JSON.parse(body); } catch { return new Response('Bad JSON', { status: 400 }); }

    if (event.type !== 'checkout.session.completed') {
      return new Response('Event ignored: ' + event.type, { status: 200 });
    }

    const paymentLinkId = event.data?.object?.payment_link;
    if (!paymentLinkId) return new Response('No payment_link in session', { status: 200 });

    // Load current products.json
    const ghGet = await fetch(GITHUB_API, {
      headers: { 'Authorization': 'Bearer ' + env.GITHUB_TOKEN, 'User-Agent': 'abes-baking-webhook' }
    });
    if (!ghGet.ok) return new Response('GitHub read failed: ' + ghGet.status, { status: 500 });

    const fileData = await ghGet.json();
    let data;
    try {
      data = JSON.parse(atob(fileData.content.replace(/\n/g, '')));
    } catch (e) {
      return new Response('Failed to parse products.json: ' + e.message, { status: 500 });
    }

    // Find product by stripeLinkId
    const product = data.products.find(p => p.stripeLinkId === paymentLinkId);
    if (!product) {
      return new Response('No product found for payment link: ' + paymentLinkId, { status: 200 });
    }

    // Skip if unlimited stock (quantity: null)
    if (product.quantity === null || product.quantity === undefined) {
      return new Response('Product has unlimited stock — no change needed', { status: 200 });
    }

    // Decrement quantity
    if (product.quantity > 0) product.quantity -= 1;
    if (product.quantity <= 0) {
      product.quantity = 0;
      product.inStock  = false;
    }

    // Write back to GitHub
    const newContent = toBase64(JSON.stringify(data, null, 2));
    const ghPut = await fetch(GITHUB_API, {
      method: 'PUT',
      headers: {
        'Authorization':  'Bearer ' + env.GITHUB_TOKEN,
        'Content-Type':   'application/json',
        'User-Agent':     'abes-baking-webhook'
      },
      body: JSON.stringify({
        message: `Auto-update inventory: ${product.name} (${product.quantity} remaining)`,
        content: newContent,
        sha:     fileData.sha,
        branch:  'main'
      })
    });

    if (!ghPut.ok) {
      const err = await ghPut.json();
      return new Response('GitHub write failed: ' + (err.message || ghPut.status), { status: 500 });
    }

    return new Response(
      `Updated: ${product.name} — quantity now ${product.quantity}${product.quantity === 0 ? ' (SOLD OUT)' : ''}`,
      { status: 200 }
    );
  }
};

// ── Stripe webhook signature verification ────────────────────────────────────
async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = {};
  sigHeader.split(',').forEach(p => { const [k, v] = p.split('='); parts[k.trim()] = v; });
  const timestamp  = parts['t'];
  const signatures = sigHeader.match(/v1=([a-f0-9]+)/g) || [];
  if (!timestamp || !signatures.length) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false; // 5-min replay window

  const signedPayload = timestamp + '.' + payload;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac      = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = 'v1=' + Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return signatures.includes(expected);
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
