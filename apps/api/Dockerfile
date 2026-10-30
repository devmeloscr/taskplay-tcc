FROM node:24.19.0-alpine AS base
# pnpm instalado pelo npm, e nao pelo corepack: a versao fica explicita na
# imagem e o build nao depende de resolver assinatura de pacote em rede.
RUN npm install --global pnpm@10.14.0
WORKDIR /repo

FROM base AS dependencias

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencias AS construtor

COPY . .

RUN pnpm prisma generate

ENV NX_DAEMON=false
RUN pnpm exec nx build api

RUN node apps/api/completar-package-json.mjs

FROM base AS migrador

# As versoes saem do node_modules que o lockfile instalou, e nao de uma faixa
# escrita a mao: o migrador roda exatamente o Prisma com que a API foi testada.
COPY --from=dependencias /repo/node_modules/prisma/package.json /tmp/prisma.json
COPY --from=dependencias /repo/node_modules/dotenv/package.json /tmp/dotenv.json
RUN node -e "const v = (n) => require('/tmp/' + n + '.json').version; \
      require('fs').writeFileSync('package.json', JSON.stringify({ private: true, \
        dependencies: { prisma: v('prisma'), dotenv: v('dotenv') } }))" \
 && pnpm install --prod \
 && pnpm store prune \
 && rm /tmp/prisma.json /tmp/dotenv.json

COPY prisma.config.ts ./
COPY libs/api/database/prisma ./libs/api/database/prisma

CMD ["pnpm", "prisma", "migrate", "deploy"]

FROM base AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=construtor /repo/dist/apps/api/package.json ./package.json
RUN pnpm install --prod && pnpm store prune

COPY --from=construtor /repo/dist/apps/api/main.js ./main.js

# Usuario sem privilegio, ja existente na imagem oficial. Um processo exposto a
# internet nao roda como root.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"'

CMD ["node", "main.js"]
