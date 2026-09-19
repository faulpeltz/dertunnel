#!/bin/bash
set -e -o pipefail

export VERSION="$(jq -r '.version' package.json)"

echo "Building Docker image for version ${VERSION}"
podman build --pull . -t docker.io/faulpeltz/dertunnel:latest

echo "Pushing Docker image for version ${VERSION}"
podman push docker.io/faulpeltz/dertunnel:latest
podman tag docker.io/faulpeltz/dertunnel:latest docker.io/faulpeltz/dertunnel:${VERSION}
podman push docker.io/faulpeltz/dertunnel:${VERSION}

echo "Docker image for version ${VERSION} has been built and pushed successfully."

