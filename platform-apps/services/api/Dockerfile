FROM python:3.12-slim
WORKDIR  /app  
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN groupadd -g 10001 addgroup && useradd -u 10001 -g addgroup adduser
COPY --chown=addgroup:adduser . . 
RUN chown adduser:addgroup /app
USER adduser
#EXPOSE 8000
CMD ["uvicorn","main:app", "--app-dir", "src", "--host","0.0.0.0","--port","8000"]

# 2ND stage
# WORKDIR /app
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
# COPY . .
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]