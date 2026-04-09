FROM elixir:1.16-slim AS build
WORKDIR /app
ENV MIX_ENV=prod
RUN mix local.hex --force && mix local.rebar --force
COPY mix.exs ./
RUN mix deps.get && mix deps.compile
COPY lib ./lib
RUN mix release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y libssl3 libncurses6 locales && rm -rf /var/lib/apt/lists/*
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8
WORKDIR /app
COPY --from=build /app/_build/prod/rel/external_data_service ./
EXPOSE 4000
CMD ["bin/external_data_service", "start"]
