# Fase 1: Build dell'applicazione Next.js
# Usiamo un'immagine Node.js LTS (Long Term Support)
FROM node:20-alpine AS builder

# Imposta la directory di lavoro all'interno del container
WORKDIR /app

# Copia package.json e package-lock.json (o yarn.lock)
COPY package*.json ./

# Installa le dipendenze di sviluppo e produzione
# Nota: Non usare --omit=dev qui perché potremmo aver bisogno di devDependencies per la build
RUN npm install

# Copia il resto del codice sorgente dell'applicazione
COPY . .

# Esegui la build dell'applicazione Next.js
# Questo comando crea la cartella .next ottimizzata per la produzione
RUN npm run build

# Fase 2: Creazione dell'immagine di produzione
# Usiamo un'immagine Node.js più leggera per la produzione
FROM node:20-alpine

# Imposta la directory di lavoro
WORKDIR /app

# Copia le dipendenze di produzione dalla fase builder
# Questa pratica è spesso usata, ma può causare problemi se il lockfile cambia.
# In alternativa, potremmo reinstallare solo le dipendenze di produzione qui.
# COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Installa SOLO le dipendenze di produzione in modo pulito
# Usiamo 'npm install' invece di 'npm ci' per maggiore flessibilità
# se ci sono piccole discrepanze nel lockfile (anche se non ideale)
RUN npm install --omit=dev --ignore-scripts

# Copia la build dell'applicazione dalla fase builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
# Copia il file next.config.js (standalone output lo gestisce, ma meglio essere espliciti)
COPY --from=builder /app/next.config.ts ./next.config.ts

# Esponi la porta su cui Next.js gira (default 3000)
EXPOSE 3000

# Variabile d'ambiente per indicare che siamo in produzione
ENV NODE_ENV=production
# Imposta l'utente non root (opzionale ma buona pratica di sicurezza)
# USER node

# Comando per avviare l'applicazione in modalità produzione
# Il flag -p 3000 è ridondante se non specificato diversamente in start script
CMD ["npm", "start"]
