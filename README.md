# Pizza Hell

> "Quick prototype that became production." — Dave, 2013

An intentionally legacy Node.js pizza ordering system, preserved exactly as it left Dave's hands over a decade ago. Every callback pyramid, every race condition, every hardcoded secret is real. This codebase exists to be studied, refactored, and fixed.

## What This Is

Pizza Hell is a teaching project for the Claude Code Hackathon. It demonstrates the kinds of architectural and coding problems that accumulated in real production Node.js applications during the early 2010s — before Promises, async/await, and modern patterns were mainstream.

The code runs. Customers can order pizzas. And yet something is deeply wrong at every layer.

## Getting Started

```bash
npm install
npm start
```

The app starts at [http://localhost:3000](http://localhost:3000).

**First run:** `mongodb-memory-server` will download a MongoDB binary (~1 minute). Subsequent starts are fast.

No external database or configuration required.

## Features

- Browse 15 pizzas across 4 categories (classic, specialty, vegetarian, meat)
- Session-based shopping cart with size selection and quantity limits
- Promo code support
- Checkout with credit card or PayPal (simulated)
- Order confirmation and history
- Admin stats dashboard at `/admin/stats`

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express 4 |
| Database | MongoDB via Mongoose |
| Dev DB | mongodb-memory-server (no setup needed) |
| Sessions | express-session |

## Project Structure

```
pizza-hell/
├── app.js              # Entry point, config, route mounting, DB seed
├── lib/
│   ├── payment.js      # Simulated payment gateway
│   └── validators.js   # Address and card validation
├── models/
│   ├── Pizza.js        # Pizza catalog
│   ├── Order.js        # Orders
│   ├── Cart.js         # Shopping cart
│   └── CategoryStat.js # Per-category aggregates
└── routes/
    ├── menu.js         # Menu browsing
    ├── cart.js         # Cart operations
    └── orders.js       # Checkout and order placement
```

## Test Payment Values

**Credit cards:**
| Card ending | Result |
|---|---|
| `0000` | Declined |
| `1111` | Insufficient funds |
| `2222` | Stolen card |
| anything else | Approved |

**PayPal:** `fail@example.com` is always declined. Any other address succeeds.

## The Antipatterns (That's the Point)

This codebase is intentionally broken in instructive ways:

- **Callback hell** — `POST /order/place` in `routes/orders.js` has 8 levels of nested callbacks
- **Race condition** — order number generation uses `count()` without atomicity; concurrent orders can get the same number
- **Critical bug** — if order persistence fails after payment is charged, the money is gone (no refund path)
- **Global state / memory leak** — `activeOrders` object in `app.js` grows unbounded
- **N+1 queries** — Pizza pre-save hook recounts all pizzas in a category on every save
- **Hardcoded secrets** — session secret, promo codes, and ZIP code prefixes are all in source
- **Copy-pasted code** — HTML helper functions duplicated across three route files
- **No caching** — full menu re-queried from MongoDB on every page load
- **Fire-and-forget email** — nodemailer is installed but never wired up; failures are silently dropped
- **All HTML in route handlers** — no template engine, strings assembled by hand

These are not accidents. They are the exercise.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |

## Known TODOs (From the Original Author)

From comments scattered throughout the code:

- "add proper logging (has been TODO since July 2013)"
- "TODO: cache this, it gets called on every menu page load"
- "we'll move to Redis when we scale"
- "TODO: queue for retry — for now it just gets lost"
- "CRITICAL BUG: payment already charged but order not persisted"
- "split this into separate files when we have time"
