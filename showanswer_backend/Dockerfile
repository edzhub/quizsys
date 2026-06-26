# Dockerfile
FROM node:20-bullseye

# Install Python and system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set python alias to python3
RUN ln -s /usr/bin/python3 /usr/bin/python

# Install Python OCR dependencies
RUN pip3 install --no-cache-dir opencv-python-headless numpy rapidocr-onnxruntime

# Set working directory
WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Expose backend port
EXPOSE 8002

CMD ["npm", "start"]
