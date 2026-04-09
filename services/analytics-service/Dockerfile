FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY main.go ./
RUN CGO_ENABLED=0 go build -o analytics-service .

FROM alpine:3.19
WORKDIR /app
COPY --from=build /app/analytics-service .
EXPOSE 8082
CMD ["./analytics-service"]
