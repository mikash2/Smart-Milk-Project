FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Add this line to force unbuffered output
ENV PYTHONUNBUFFERED=1
COPY . .

# Create templates directory if it doesn't exist
RUN mkdir -p templates

# Default to simulation mode, can be overridden with environment variable
ENV MODE=web

# Expose port for web interface
EXPOSE 5000

CMD ["python", "start.py"]
