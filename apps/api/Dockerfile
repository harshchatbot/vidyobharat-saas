FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg fontconfig fonts-inter fonts-lato fonts-noto-core fonts-roboto \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir numpy scipy soundfile

# Optional CPU speech-to-text. Enable only after sizing the API container:
# docker build --build-arg ENABLE_EDITOR_STT=true ...
ARG ENABLE_EDITOR_STT=false
RUN if [ "$ENABLE_EDITOR_STT" = "true" ]; then \
      pip install --no-cache-dir 'faster-whisper>=1.1,<2'; \
    fi

COPY apps/api/app ./app
COPY shared ./shared

# Music Studio DSP engine
COPY apps/music-lab/src /app/music_lab

ENV PYTHONPATH=/app:/app/music_lab

RUN mkdir -p data/uploads data/renders

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
