#!/bin/bash

# Docker Build Script for CogniMesh
# Usage: ./scripts/docker-build.sh [tag]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="cognimesh"
DEFAULT_TAG="latest"
TAG="${1:-$DEFAULT_TAG}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CogniMesh Docker Build Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${BLUE}Building CogniMesh image...${NC}"
echo -e "  Image: ${YELLOW}${IMAGE_NAME}:${TAG}${NC}"
echo ""

# Build the Docker image
docker build -t "${IMAGE_NAME}:${TAG}" -t "${IMAGE_NAME}:latest" .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo ""
    echo -e "${BLUE}Image details:${NC}"
    docker images "${IMAGE_NAME}" --format "  Repository: {{.Repository}}\n  Tag: {{.Tag}}\n  Size: {{.Size}}\n  Created: {{.CreatedAt}}" | head -3
    echo ""
    echo -e "${BLUE}To run the container:${NC}"
    echo -e "  ${YELLOW}docker-compose up -d${NC}"
    echo ""
    echo -e "${BLUE}To run with specific tag:${NC}"
    echo -e "  ${YELLOW}docker run -p 3000:3000 -p 3001:3001 ${IMAGE_NAME}:${TAG}${NC}"
else
    echo ""
    echo -e "${RED}✗ Build failed!${NC}"
    exit 1
fi
