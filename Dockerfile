# Prompt2Gate - Node backend + Icarus Verilog, Yosys and Graphviz
FROM node:20-bookworm-slim

# EDA toolchain (iverilog also provides vvp)
RUN apt-get update \
 && apt-get install -y --no-install-recommends iverilog yosys graphviz ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first so Docker caches this layer until package files change
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=8787

EXPOSE 8787

# Run as the unprivileged "node" user (the pipeline compiles and runs generated Verilog)
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
