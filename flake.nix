{
  description = "DRP mobility app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells = {
          # nix develop .#frontend
          frontend = pkgs.mkShellNoCC {
            packages = with pkgs; [ nodejs self.formatter.${system} ];
            shellHook = ''
              echo "Frontend shell — npm install && npm run start"
            '';
          };

          # nix develop .#backend
          backend = pkgs.mkShellNoCC {
            packages = with pkgs; [
              python3
              python3Packages.pip
              python3Packages.virtualenv
              git
              self.formatter.${system}
            ];
            shellHook = ''
              BACKEND_DIR="$(git rev-parse --show-toplevel)/backend"
              if [ ! -d "$BACKEND_DIR/.venv" ]; then
                python3 -m venv "$BACKEND_DIR/.venv"
              fi
              . "$BACKEND_DIR/.venv/bin/activate"
              echo "Backend shell — pip install -r requirements.txt && DEV=true uvicorn app.main:app --reload"
            '';
          };

          # nix develop
          default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              nodejs
              python3
              python3Packages.pip
              python3Packages.virtualenv
              git
              self.formatter.${system}
            ];
            shellHook = ''
              BACKEND_DIR="$(git rev-parse --show-toplevel)/backend"
              if [ ! -d "$BACKEND_DIR/.venv" ]; then
                python3 -m venv "$BACKEND_DIR/.venv"
              fi
              . "$BACKEND_DIR/.venv/bin/activate"
              echo "Full-stack shell ready."
            '';
          };
        };

        apps =
          let
            py = pkgs.python3;
            node = pkgs.nodejs;
            git = pkgs.git;
            root = ''ROOT="$(${git}/bin/git rev-parse --show-toplevel)"'';

            run-backend = pkgs.writeShellScriptBin "run-backend" ''
              ${root}
              cd "$ROOT/backend"
              [ ! -d .venv ] && ${py}/bin/python3 -m venv .venv
              .venv/bin/pip install -r requirements.txt -q
              DEV=true DATABASE_URL="sqlite:///$ROOT/backend/dev.db" \
                .venv/bin/uvicorn app.main:app --reload --app-dir "$ROOT/backend"
            '';

            run-frontend = pkgs.writeShellScriptBin "run-frontend" ''
              ${root}
              cd "$ROOT/frontend"
              [ ! -d node_modules ] && ${node}/bin/npm install
              ${node}/bin/npm run start
            '';

            # Start backend in background (logs to .backend.log), wait for it to
            # boot, then start frontend in the foreground so the QR code is visible.
            run-all = pkgs.writeShellScriptBin "run-all" ''
              ${root}
              LOG="$ROOT/backend/.backend.log"

              cleanup() {
                kill "$BACKEND_PID" 2>/dev/null
                wait "$BACKEND_PID" 2>/dev/null
              }
              trap cleanup EXIT INT TERM

              cd "$ROOT/backend"
              [ ! -d .venv ] && ${py}/bin/python3 -m venv .venv
              .venv/bin/pip install -r requirements.txt -q
              DEV=true DATABASE_URL="sqlite:///$ROOT/backend/dev.db" \
                .venv/bin/uvicorn app.main:app --reload --app-dir "$ROOT/backend" \
                >"$LOG" 2>&1 &
              BACKEND_PID=$!
              echo "Backend starting on :8000 (tail $LOG to debug) — waiting 3s..."
              sleep 3

              cd "$ROOT/frontend"
              [ ! -d node_modules ] && ${node}/bin/npm install
              ${node}/bin/npm run start
            '';
          in
          {
            backend = { type = "app"; program = "${run-backend}/bin/run-backend"; };
            frontend = { type = "app"; program = "${run-frontend}/bin/run-frontend"; };
            default = { type = "app"; program = "${run-all}/bin/run-all"; };
          };

        formatter = pkgs.nixfmt-rfc-style;
      }
    );
}
