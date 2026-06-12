# ESP32 CRE Workflow Repository

This repository contains two local project copies for Chainlink CRE workflow development:

- `my-project/`
- `pendingCaptures/`

Each folder contains a CRE project that includes a TypeScript workflow example under `my-workflow/`.

## Repository structure

- `my-project/`
  - `.env` - local environment variables
  - `.gitignore`
  - `project.yaml` - CRE project settings
  - `secrets.yaml` - workflow secrets (do not commit)
  - `my-workflow/` - workflow source and build files

- `pendingCaptures/`
  - `.env`
  - `.gitignore`
  - `project.yaml`
  - `secrets.yaml`
  - `my-workflow/`

- `.gitignore` - root ignore rules

## What is inside `my-workflow/`

Each `my-workflow/` folder contains a TypeScript workflow template with:

- `main.ts` - example workflow entry point
- `package.json` - dependencies and scripts
- `workflow.yaml` - CRE workflow target settings for staging and production
- `README.md` - workflow-specific instructions

## Setup

1. Choose which project copy you want to work with:

   - `my-project`
   - `pendingCaptures`

2. Add a `.env` file at the selected project root or update the existing one.

   Example:
   ```bash
   CRE_ETH_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001
   ```

3. Install dependencies from the workflow folder.

   ```bash
   cd my-project/my-workflow
   npm install
   ```

   or, if you use Bun:

   ```bash
   bun install
   ```

4. Simulate the workflow from the repository root.

   ```bash
   cd /home/disco/ESP32
   cre workflow simulate my-project/my-workflow --target=staging-settings
   ```

   To run the other project copy, replace `my-project` with `pendingCaptures`.

## Notes

- Do not commit `.env` or `secrets.yaml` to Git.
- The root `.gitignore` already excludes `.env` and local files.
- The sample workflow is a starting point; customize `main.ts`, `workflow.yaml`, and `project.yaml` for your own CRE targets.

## Helpful commands

- Check git status:
  ```bash
  git status
  ```

- Show git remotes:
  ```bash
  git remote -v
  ```

- Add files and commit:
  ```bash
  git add .
  git commit -m "Add repo README and workflow setup"
  ```

- Push to remote (ensure credentials are configured):
  ```bash
  git push origin main
  ```
