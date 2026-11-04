#!/bin/bash
set -e
export CONFIRM=YES
export DATABASE_URL='postgres://onion:onionpass@localhost:5432/onion?sslmode=disable'

node flush-games.js
