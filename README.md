# AntiClickBaitLinks

**Reveal the truth behind clickbait headlines instantly with AI.**

AntiClickBaitLinks is a progressive web app (PWA) that summarizes any article, YouTube video, or PDF in seconds — cutting through sensationalist headlines to give you the real story. Available at [anticlickbaitlinks.com](https://anticlickbaitlinks.com).

---

## Features

- **Instant summaries** — paste any public link and get a concise, accurate summary
- **Anti-hype by design** — the AI is prompted to correct exaggerated headlines and preserve important context (scope, limitations, caveats)
- **Three summary lengths** — Short (1–2 sentences), Detailed (3–5 sentences), Full (multi-paragraph)
- **YouTube support** — summarizes video content from transcripts
- **PDF support** — paste a PDF URL or upload a file directly
- **Multi-API with automatic fallback** — supports Gemini, OpenRouter, Mistral, and DeepSeek; if one reaches its quota limit the app switches automatically
- **10 interface languages** — Spanish, English, Portuguese, French, German, Italian, Russian, Hindi, Arabic, Chinese
- **Freemium model** — 10 free summaries per 24 hours (IP-based server limit), unlimited with a Premium token
- **PWA installable** — works as a native-like app on Android, iOS, and desktop
- **Web Share Target** — share links directly to AntiClickBaitLinks from any app on your phone
- **Text-to-speech** — listen to summaries out loud
- **Privacy first** — API keys are stored only in your browser, never on our servers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS + custom glass morphism |
| Animations | Motion (Framer Motion) |
| Backend | Node.js + Express + tsx |
| Database | Upstash Redis (token & usage storage) |
| PDF parsing | pdfjs-dist |
| Web scraping | Cheerio + Jina Reader fallback |
| Deployment | Railway (backend) + Caddy (static) |
| Emails | Brevo (transactional) |
| Payments | PayPal Webhooks |
| AI providers | Google Gemini, OpenRouter, Mistral AI, DeepSeek |

---

## Project Structure

```
├── server.ts              # Express backend (scraping, PDF, AI proxies, webhooks)
├── src/
│   ├── App.tsx            # Root component
│   ├── translations.ts    # All UI strings in 10 languages + FAQ + use cases
│   ├── components/
│   │   ├── TopBar.tsx     # Navigation bar, settings, language selector
│   │   ├── InfoPanel.tsx  # Info popup with FAQ and tips tabs
│   │   ├── LockModal.tsx  # Freemium limit modal
│   │   └── ResultCard.tsx # Summary display with expansion buttons
│   ├── hooks/
│   │   └── useAppState.ts # All app state, handlers, and business logic
│   └── services/
│       └── geminiService.ts # AI provider calls, fallback logic, content fetching
├── public/
│   ├── manifest.json      # PWA manifest with Web Share Target
│   └── sw.js              # Service worker
└── index.html
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- An API key from at least one supported provider:
  - [Gemini](https://aistudio.google.com/app/apikey) (free, not available in EU)
  - [OpenRouter](https://openrouter.ai/keys) (free tier, 200 req/day, works everywhere)
  - [Mistral](https://console.mistral.ai/api-keys) (free tier, European)
  - [DeepSeek](https://platform.deepseek.com/api_keys) (free credits on signup)

### Installation

```bash
git clone https://github.com/adrianic21/AntiClickBaitLinks
cd AntiClickBaitLinks
npm install
```

### Environment Variables

Create a `.env` file in the root:

```env
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
BREVO_API_KEY=your_brevo_key
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
ADMIN_SECRET=your_admin_secret
YOUR_EMAIL=your_notification_email
```

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm run start
```

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/fetch-url` | POST | Scrapes and extracts article text (Cheerio + Jina fallback) |
| `/api/youtube` | POST | Extracts YouTube video content |
| `/api/pdf-upload` | POST | Parses uploaded PDF files |
| `/api/mistral` | POST | Proxy for Mistral API (avoids CORS) |
| `/api/deepseek` | POST | Proxy for DeepSeek API (avoids CORS) |
| `/api/validate-token` | POST | Validates Premium tokens with device binding |
| `/api/check-limit` | POST | Checks and records IP-based usage |
| `/api/paypal-webhook` | POST | Handles PayPal payment events |

---

## How the AI summarization works

1. The server fetches the article content using Cheerio (direct scrape) or falls back to Jina Reader for JS-rendered or bot-protected pages
2. The extracted text is sent to the selected AI provider along with a strict system prompt that enforces accuracy, anti-hype, and scope preservation
3. If the primary provider fails or hits its quota, the app automatically tries the next available provider
4. The summary is returned in whichever interface language the user has selected

---

## Premium System

Premium tokens are UUIDs generated on payment via PayPal webhook. Each token is stored in Upstash Redis and bound to a single device on first activation. Tokens cannot be shared across devices.

---

## PWABuilder Store Readiness

The app is prepared for PWABuilder packaging with:

- Valid web manifest (`id`, `scope`, shortcuts, categories, share target)
- Service worker with cached shell + offline fallback page
- Installability metadata for Android, iOS web app mode, and Windows/PWA packaging

Before publishing to stores, complete this checklist:

1. Ensure production is served over `https://` and that `/manifest.json` + `/sw.js` are reachable.
2. Run Lighthouse (PWA category) and resolve any critical installability warnings.
3. Generate and upload store assets in PWABuilder:
   - screenshots (phone + desktop/tablet),
   - feature graphic / hero image,
   - app icons requested by each store package.
4. Configure legal pages in production (privacy policy, terms, support contact) because stores require them.
5. For store submission accounts:
   - Google Play Console (Android)
   - Microsoft Partner Center (Windows)
   - Apple Developer account + App Store Connect (iOS packaging/signing flow)

Recommended env vars for production hardening:

- `PREMIUM_TRANSFER_ON_MISMATCH=true` (default-enabled in code)
- `DEVICE_FINGERPRINT_SALT=<strong-random-secret>`

---

## License

MIT
