FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && adduser --disabled-password --gecos '' appuser
COPY manage.py .
COPY consensus_identity ./consensus_identity
COPY lab ./lab
USER appuser
EXPOSE 8001
CMD ["python", "manage.py", "runserver", "0.0.0.0:8001", "--noreload"]
