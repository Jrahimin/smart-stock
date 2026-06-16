import os

bind = "0.0.0.0:8000"
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
graceful_timeout = 30
timeout = 120
keepalive = 5
forwarded_allow_ips = os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1,::1,172.28.0.0/16")
accesslog = "-"
errorlog = "-"
