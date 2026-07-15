FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY . .
RUN go build -o clipsend-server main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/clipsend-server .

# Create a data directory for the JSON file and uploads
RUN mkdir -p /data

EXPOSE 8081

CMD ["./clipsend-server"]
