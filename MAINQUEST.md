#### **Stage 1: Monolith (Starting Point)**

- **Codebase**:
  - Set up the initial **monolithic codebase** for **Spotr**, containing the **frontend** (Remix), **API** (Express), and **SQLite** database.
  - This is a tightly coupled structure with one codebase.
- **System**:

  - Deploy the monolith as a **single process** on a **single server** using **Digital Ocean**.
  - Set up basic Nginx configuration to handle routing between subdomains (`www.spotr.coach`, `app.spotr.coach`, `api.spotr.coach`).

  **Objective**: Get the basic monolithic app running with minimal complexity.
