How to merge into dev server

Step 1. Clone from repo you want to merge into, in this case, we want the main dev repo as this is where the server pulls updates from.

Step 2. git remote add upstream "ssh of repo"

Step 3. git fetch upstream

Step 4. git merge upstream/branch
