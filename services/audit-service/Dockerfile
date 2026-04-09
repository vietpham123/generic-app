FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -o audit-service .

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/audit-service .
EXPOSE 8085
CMD ["./audit-service"]
