FROM node:22.23.4-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv tesseract-ocr ca-certificates libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/identity && /opt/identity/bin/pip install --no-cache-dir opencv-python-headless==4.11.0.86 numpy==2.2.6
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node backend/ ./
COPY --chown=node:node frontend/ /app/frontend/
RUN node scripts/prepare-models.js && echo "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  models/yunet.onnx" | sha256sum -c - && echo "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79  models/sface.onnx" | sha256sum -c -
ENV NODE_ENV=production PYTHON_BIN=/opt/identity/bin/python3 PYTHONUNBUFFERED=1 VERIFICATION_MODE=local_review
USER node
EXPOSE 10000
CMD ["node", "server.js"]
