# Meta Schema

The `meta` schema manages system governance, auditing, and configuration.

- **Auditing:** The `History` table tracks every change made to the `core` entities (Create/Update/Delete) for rollback and accountability.
- **RBAC:** Implements Role-Based Access Control via `Role` and `Permission` entities.
