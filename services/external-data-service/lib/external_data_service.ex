defmodule ExternalDataService do
  use Application

  def start(_type, _args) do
    port = String.to_integer(System.get_env("PORT") || "4000")

    children = [
      {Plug.Cowboy, scheme: :http, plug: ExternalDataService.Router, options: [port: port]}
    ]

    opts = [strategy: :one_for_one, name: ExternalDataService.Supervisor]
    IO.puts("external-data-service listening on port #{port}")
    Supervisor.start_link(children, opts)
  end
end
