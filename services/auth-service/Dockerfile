FROM ruby:3.2-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*
COPY Gemfile ./
RUN bundle install
COPY app.rb ./
EXPOSE 4568
CMD ["ruby", "app.rb"]
