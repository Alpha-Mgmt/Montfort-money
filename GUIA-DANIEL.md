# Montfort Money — Guía de deploy (no técnica)

Mismo playbook que Montfort Capital. Todo son comandos de UNA línea en la terminal de VS Code/Cursor, dentro de la carpeta `montfort-money`.

## 1. Probar en tu Mac (opcional pero recomendado)

```
npm install
```

Crea el archivo `.env.local` (copia de `.env.example`) — los valores salen del paso 2.

```
npm run dev
```

Abre http://localhost:3000

## 2. Supabase (proyecto NUEVO, no reuses el de Capital)

1. supabase.com → New project → nombre `montfort-money` (plan Free está bien para la beta).
2. SQL Editor → pega TODO el contenido de `supabase/01-schema.sql` → Run.
3. SQL Editor → pega `supabase/02-invites.sql` → Run. (Ahí viven los códigos de invitación: `montfort-owner` y `montfort-beta-01`. Agrega más con el mismo formato.)
4. Settings → API: copia `Project URL` y `anon public key` → van en `.env.local` y en Vercel (paso 4).
5. Authentication → URL Configuration:
   - Site URL: `https://money.montfortfinancial.com`
   - Redirect URLs: agrega `https://money.montfortfinancial.com/auth/callback` y `http://localhost:3000/auth/callback`
6. (Opcional, recomendado para la beta) Authentication → Providers → Email → desactiva "Confirm email" para que la gente entre directo al registrarse.

## 3. GitHub

```
git init
git add -A
git commit -m "Montfort Money v1"
```

GitHub → New repository → `Alpha-Mgmt/Montfort-money` → **Private** → sin README. Luego:

```
git remote add origin https://github.com/Alpha-Mgmt/Montfort-money.git
git push -u origin main
```

(Si se queja del branch: `git branch -M main` y repite el push.)

## 4. Vercel

1. vercel.com → Add New → Project → importa `Montfort-money`.
2. Environment Variables (las 2 del paso 2.4):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy. A partir de aquí: cada `git push` = deploy automático (~2 min).
4. Settings → Domains → agrega `money.montfortfinancial.com`.

## 5. Cloudflare (DNS)

DNS → Add record:
- Type `CNAME` · Name `money` · Target `cname.vercel-dns.com` · Proxy **OFF** (nube gris, igual que capital).

Espera unos minutos y abre https://money.montfortfinancial.com

## 6. Probar el flujo completo

1. Regístrate con el código `montfort-owner`.
2. En **More** agrega una cuenta (ej. "Chase checking").
3. En **Budgets** ponle límite a una categoría (ej. Groceries $600).
4. En **Spending** agrega un gasto → la barra del budget se mueve.
5. En **Tasks** crea "Pay credit card — $500, Housing, every month" → márcala ✓ → mira cómo aparece la transacción en Spending y el budget se actualiza, y la task del próximo mes ya está creada.
6. En iPhone: Safari → Share → **Add to Home Screen** = se instala como app.

## Notas

- Los códigos de invitación se administran en la tabla `invite_codes` de Supabase (SQL editor o Table editor).
- `preview/` es tooling interno de Claude para verificar pantallas sin npm — no afecta la app; no lo subas a Vercel si no quieres (está inofensivo, solo pesa unos KB).
- Roadmap ya contemplado en la base de datos: conexión de bancos (Plaid), agente AI que analiza tu gasto, pagos. Nada de eso requiere rehacer tablas.
