# Relations

This directory contains join tables for Many-to-Many relationships. 

To maintain a clean and modular Prisma schema, we separate core data models (in `/models`) from their association entities.
This structure helps prevent individual `.prisma` files from becoming too large and complex.
