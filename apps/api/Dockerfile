FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/app ./app
COPY apps/api/.env.example ./.env
COPY shared ./shared

RUN mkdir -p data/uploads data/renders

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}