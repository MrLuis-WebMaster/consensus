FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7860
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && adduser --disabled-password --gecos '' appuser
COPY manage.py .
COPY consensus_identity ./consensus_identity
COPY lab ./lab
USER appuser
EXPOSE 7860
CMD ["sh", "-c", "exec gunicorn consensus_identity.wsgi:application --bind 0.0.0.0:${PORT:-7860} --workers ${GUNICORN_WORKERS:-2} --timeout 30 --access-logfile - --error-logfile -"]
