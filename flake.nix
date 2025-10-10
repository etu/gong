{
  description = "Gong - static site that synthesizes a gong sound (development flake)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { self, nixpkgs, ... }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs { inherit system; };
  in {
    # A convenience app so you can run a dev server with `nix run`
    defaultApp.${system} = {
      type = "app";
      program = (pkgs.lib.getExe (pkgs.writeShellApplication {
        name = "dev-server";
        runtimeInputs = [pkgs.python3];
        text = ''
          python3 -m http.server 8000
        '';
      }));
      description = "Start a simple HTTP server on port 8000 (run from project root).";
    };
  };
}
