#!/usr/bin/env python

from waitress import serve

from app import app

# number of threads to use for concurrent client requests
MAX_THREADS = 32

HOST = "localhost"
PORT = 8080

if __name__ == "__main__":
    print(f"Server started on {HOST}:{PORT}")
    serve(app, host=HOST, port=PORT, threads=MAX_THREADS)
