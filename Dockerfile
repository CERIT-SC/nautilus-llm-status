FROM node:22-alpine AS frontend
WORKDIR /build/web/app
COPY web/app/package*.json ./
RUN npm ci
COPY web/app/ ./
RUN npm run build
# Vite outDir is ../static, so output lands at /build/web/static/

FROM golang:1.23-alpine AS backend
RUN apk add --no-cache gcc musl-dev
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /build/web/static/ /build/web/static/
RUN CGO_ENABLED=1 go build -o nautilus-status ./cmd/main.go

FROM alpine:3.19
RUN apk add --no-cache ca-certificates && \
    addgroup -g 1000 app && adduser -u 1000 -G app -D app && \
    mkdir -p /data && chown app:app /data
WORKDIR /app
COPY --from=backend /build/nautilus-status .
USER 1000
EXPOSE 8080
ENTRYPOINT ["./nautilus-status"]
