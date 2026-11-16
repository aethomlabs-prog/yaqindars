# YaqinDars bot — 24/7 konteyner (Railway, Render, istalgan VPS)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
# QR poster matni uchun shrift (o‘, g‘ belgilari bilan)
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY *.py ./

# Root bo'lmagan foydalanuvchi
RUN useradd --create-home bot && chown -R bot /app
USER bot

# Maxfiy ma'lumotlar konteynerga KIRMAYDI — muhit o'zgaruvchilari orqali:
# BOT_TOKEN, WEBAPP_URL, ADMIN_IDS, FIREBASE_CREDENTIALS_JSON
# /health (Railway healthcheck, UptimeRobot)
EXPOSE 8080
CMD ["python", "main.py"]
