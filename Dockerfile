FROM node:24-alpine

ENV NODE_ENV=production \
    NODE_USE_ENV_PROXY=1 \
    PORT=3000 \
    DATA_DIR=/app/data
WORKDIR /app

# No third-party runtime dependencies are needed.
COPY --chown=node:node package.json server.js index.html app.js ids.js styles.css favicon.svg state.js calendar.js assistant-actions.js assistant-provider.js assistant-local.js assistant-server.js assistant-ui.js notepad.js analytics.js reconcile.js sync.js offline.js leadership.js globe.js commands.js workspace-ui.js sw.js ./

RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/state').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
