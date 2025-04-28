# Fase 1: Builder - Installa dipendenze e costruisci l'app
FROM node:20.9.0-alpine AS builder

# Imposta la directory di lavoro nell'immagine
WORKDIR /app

# Copia package.json e package-lock.json (o yarn.lock)
COPY package.json package-lock.json* ./

# Installa le dipendenze in modo pulito (più veloce e affidabile in CI/CD)
# Assicurati di avere package-lock.json nel tuo progetto
RUN npm ci

# Copia la directory public SE ESISTE (importante!)
# Questo assicura che sia disponibile per la build e la copia successiva
COPY public ./public

# Copia il resto del codice sorgente dell'applicazione
# L'ordine è importante: copia le dipendenze e installale prima del codice sorgente
# per sfruttare la cache di Docker se il codice cambia ma le dipendenze no.
COPY . .

# Esponi la porta che Next.js userà durante la build (se necessario, di solito non lo è)
# EXPOSE 3000

# Esegui il build dell'applicazione Next.js
# Questo crea la cartella .next ottimizzata per la produzione
RUN npm run build

# Fase 2: Runner - Crea un'immagine leggera per l'esecuzione
FROM node:20.9.0-alpine AS runner

WORKDIR /app

# Imposta l'ambiente a production
ENV NODE_ENV=production
# Non è necessario specificare la porta qui, viene fatto in docker-compose o docker run
# ENV PORT=3000

# Crea un utente non root per motivi di sicurezza
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copia la build dall'immagine builder
# Copia solo le cartelle necessarie per eseguire l'app in produzione
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
# Copia la cartella public dalla fase builder (se esisteva)
COPY --from=builder /app/public ./public
# Copia la versione standalone creata da `output: 'standalone'` in next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# Cambia utente
USER nextjs

# Esponi la porta su cui l'app verrà eseguita nel container
EXPOSE 3000

# Comando per avviare l'applicazione Next.js in produzione
# Utilizza la versione standalone
CMD ["node", "server.js"]
