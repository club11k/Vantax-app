# VANTAX — plataforma de análisis XAU/USD y DXY

App completa: registro de usuarios, suscripción mensual con Stripe, panel de
administrador, y un motor de análisis diario generado con la API de
Anthropic (Claude) sobre datos de mercado reales.

Stack: **Next.js 14 (App Router) + TypeScript + Prisma + PostgreSQL +
NextAuth + Stripe**, pensado para desplegarse en **Render** usando el
**GitHub** que ya tenés.

---

## 0. Diferencia importante con el panel anterior

El panel VANTAX que viste antes era un Artifact (una página estática
publicada por Claude). Esto es otra cosa: una aplicación real con su propio
servidor y base de datos, que corre en tu infraestructura (Render), no en la
sesión de Claude. Una vez desplegada, **el servidor sí tiene acceso normal a
internet**, así que puede llamar APIs de datos de mercado reales de verdad
(FRED, Twelve Data) — eso resuelve la limitación que tenía el Artifact.

---

## 1. Subir el código a GitHub

```bash
cd vantax-app
git init
git add .
git commit -m "Primer commit de VANTAX"
gh repo create vantax-app --private --source=. --push
# o si preferís hacerlo a mano: creá el repo en github.com y luego
# git remote add origin <url> && git push -u origin main
```

## 2. Crear la base de datos en Render

1. Entrá a [render.com](https://render.com) → **New** → **PostgreSQL**.
2. Nombre: `vantax-db`, región cercana a tus usuarios (ej. Frankfurt para
   España), plan gratuito o el que prefieras.
3. Cuando esté lista, copiá la **Internal Database URL** (la vas a usar como
   `DATABASE_URL`).

## 3. Crear la cuenta de Stripe (España, EUR)

1. Creá tu cuenta en [dashboard.stripe.com](https://dashboard.stripe.com) y
   completá los datos de tu negocio (España).
2. Mientras completás la verificación podés trabajar en **modo test**
   (claves que empiezan con `sk_test_`/`pk_test_`) sin cobrar de verdad.
3. **Developers → API keys**: copiá la *Secret key* (`STRIPE_SECRET_KEY`) y
   la *Publishable key* (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`).
4. **Product catalog → Add product**: creá un producto por cada plan (ej.
   "VANTAX Básico", "VANTAX Pro") con un **Price recurrente mensual en EUR**
   (ej. 29,00€/mes). Copiá el `Price ID` de cada uno (empieza con `price_`)
   — lo vas a pegar en `/admin/plans` una vez desplegada la app.
5. Todavía no configures el webhook — lo hacemos en el paso 6, después de
   tener la URL pública de la app.

## 4. Crear el Web Service en Render

1. **New → Web Service**, conectá tu repo de GitHub `vantax-app`.
2. Runtime: **Node**. Build command: `npm run build`. Start command:
   `npm start`.
3. En **Environment**, cargá estas variables (mirá `.env.example` para la
   lista completa):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | la Internal Database URL del paso 2 |
   | `NEXTAUTH_SECRET` | generalo con `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `https://<el-nombre-que-elijas>.onrender.com` |
   | `STRIPE_SECRET_KEY` | del paso 3 |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | del paso 3 |
   | `STRIPE_WEBHOOK_SECRET` | lo completamos en el paso 6 |
   | `ANTHROPIC_API_KEY` | tu API key de Anthropic |
   | `ANTHROPIC_MODEL` | `claude-sonnet-4-5` (o el modelo que prefieras) |
   | `FRED_API_KEY` | opcional, ver paso 7 |
   | `TWELVE_DATA_API_KEY` | opcional, ver paso 7 |
   | `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | tu email/clave para el primer admin |

4. Deploy. Render va a correr `npm run build`, que incluye
   `prisma migrate deploy` (aplica el esquema a la base) automáticamente.

5. Una vez desplegado, corré el seed una sola vez para crear los planes por
   defecto y tu usuario admin. Desde **Render → tu Web Service → Shell**:

   ```bash
   npm run db:seed
   ```

## 5. Configurar el webhook de Stripe

1. En Stripe: **Developers → Webhooks → Add endpoint**.
2. URL: `https://<tu-app>.onrender.com/api/stripe/webhook`.
3. Eventos a escuchar: `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.paid`.
4. Copiá el **Signing secret** (`whsec_...`) y cargalo en Render como
   `STRIPE_WEBHOOK_SECRET`. Redeployá el servicio para que tome la variable.

## 6. Entrar y probar

1. Andá a `https://<tu-app>.onrender.com`.
2. Iniciá sesión con el `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` que
   definiste — es tu usuario admin.
3. `/admin/plans`: pegá el `Price ID` de Stripe en cada plan (paso 3.4).
4. Probá el flujo completo con una tarjeta de test de Stripe
   (`4242 4242 4242 4242`, cualquier fecha futura y CVC) mientras estés en
   modo test.
5. Cuando quieras cobrar de verdad: activá el modo Live en Stripe, repetí
   los pasos 3.3–3.4 con las claves `sk_live_`/`pk_live_`/Price IDs de modo
   Live, y actualizalas en Render.

## 7. (Opcional pero recomendado) Datos de mercado reales

Sin estas dos claves, el motor de análisis igual funciona pero le avisa a
Claude que ciertos datos "no están disponibles" en vez de usar cifras reales.

- **FRED_API_KEY** (gratis): creá una cuenta en
  [fredaccount.stlouisfed.org](https://fredaccount.stlouisfed.org/apikeys) y
  generá una API key. Da acceso a tasas (DGS10, DFII10, DGS2), CPI, PCE,
  desempleo, etc.
- **TWELVE_DATA_API_KEY**: el tier gratuito de
  [twelvedata.com](https://twelvedata.com/pricing) alcanza para precios
  spot de oro/DXY y para el histórico diario que usa el módulo técnico
  (EMA/RSI). Si necesitás más volumen de análisis por mes, vas a necesitar
  un plan pago de Twelve Data (o cambiar `src/lib/vantax-data.ts` para usar
  otro proveedor, como Polygon.io).

## 8. Cómo se genera cada análisis

`src/lib/vantax-data.ts` arma un snapshot con los datos disponibles →
`src/lib/analysis-engine.ts` arma el prompt y llama a Claude →
`/api/analysis/generate` valida la cuota del usuario, guarda el resultado en
`Analysis` y descuenta un análisis de su cuota mensual. El prompt de sistema
es editable desde `/admin/settings` sin necesidad de redeploy.

## 9. Seguridad y próximos pasos sugeridos

- Las tarjetas de tus usuarios **nunca** pasan por tu servidor — Stripe
  Checkout y el Customer Portal son páginas alojadas por Stripe (cumplimiento
  PCI incluido).
- Cambiá `SEED_ADMIN_PASSWORD` después del primer login.
- Considerá agregar verificación de email antes de dar acceso completo
  (`next-auth` soporta providers de email/magic link si lo necesitás).
- Este código es un MVP funcional, no un producto terminado: antes de
  cobrar en producción sumá términos de servicio, política de privacidad,
  y revisá con un contador si tu actividad requiere alta como autónomo/empresa
  en España para facturar estas suscripciones.
- VANTAX no es un asesor financiero licenciado — el disclaimer ya está en
  el prompt de sistema y en la landing page; no lo quites.

---

## Desarrollo local

```bash
npm install
cp .env.example .env      # completá los valores
npx prisma migrate dev    # crea las tablas en tu Postgres local
npm run db:seed
npm run dev
```
