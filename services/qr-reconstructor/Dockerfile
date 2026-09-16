FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

WORKDIR /app
COPY requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt

COPY api.py ./
COPY src ./src

CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port ${PORT}"]
