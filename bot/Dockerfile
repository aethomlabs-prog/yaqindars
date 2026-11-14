# YaqinDars bot — 24/7 konteyner (Railway, Render, istalgan VPS)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY *.py ./

# Root bo'lmagan foydalanuvchi
RUN useradd --create-home bot && chown -R bot /app
USER bot

# Maxfiy ma'lumotlar konteynerga KIRMAYDI — muhit o'zgaruvchilari orqali:
# BOT_TOKEN, WEBAPP_URL, ADMIN_IDS, FIREBASE_CREDENTIALS_JSON
CMD ["python", "main.py"]
