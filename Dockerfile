FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable buffer logging
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (build-essential, curl, etc.) if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files
COPY . .

# Ensure database and upload folders exist inside the container
RUN mkdir -p data/uploads data/samples

# Expose default FastAPI port
EXPOSE 8000

# Start Uvicorn server, binding to all interfaces on port 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
