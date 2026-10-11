---
title: Consensus · Identity Lab
emoji: 🏙️
colorFrom: green
colorTo: yellow
sdk: docker
app_port: 7860
---

# Django Identity Lab (synthetic only)

Optional Hugging Face Docker Space for the Django API. This service accepts only four synthetic numeric values; it does not accept images, identify people, determine a real voter's eligibility, or write anything to Stellar.

## Configure a Docker Space

Create a Docker Space from this folder so the Space repository root contains this `README.md` and `Dockerfile`. The container binds to port 7860, as declared in the Space metadata. Configure the following in Space Settings; never put secrets in the repository:

- Secret `DJANGO_SECRET_KEY`: random private key of at least 32 characters.
- Variable `DJANGO_ALLOWED_HOSTS`: the exact `<owner>-<space>.hf.space` host.
- Variable `IDENTITY_CORS_ORIGINS`: exact public HTTPS origin(s) of the Vercel frontend.

For a public synthetic-score demo, leave `ADMIN_API_TOKEN` and `TOTP_SECRET` unset; the administrative verification endpoint then returns `503` and cannot unlock admin actions. Keep the Space private or put it behind a managed WAF before configuring either secret. A public Space by itself does **not** include this repository's OWASP CRS WAF or rate-limiting proxy. Do not expose the TOTP endpoint publicly without those protections and an operational review.

## Local Docker Compose

Compose overrides `PORT=8001` for each Django replica and keeps the OWASP CRS proxy in front of Nginx. Use the repository root `.env.example` only as a key list; replace values with locally generated secrets in an ignored `.env` file.

The Space hosts Python only. Publish the TypeScript UI separately (see `../../frontend/DEPLOYMENT.md`), and use Stellar Testnet for chain operations. Python's synthetic score is not part of consensus or vote counting.
