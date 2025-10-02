#!/bin/bash

# Build the Docker image
echo "Building PrepArr Docker image..."
docker build -t preparr:latest .

# Deploy to Kubernetes
echo "Deploying to Kubernetes..."

# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy PostgreSQL
kubectl apply -f k8s/postgres.yaml

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=Ready pod -l app=postgres -n preparr-test --timeout=120s

# Deploy qBittorrent configs
kubectl apply -f k8s/qbittorrent-config.yaml

# Deploy qBittorrent
kubectl apply -f k8s/qbittorrent.yaml

# Wait for qBittorrent to be ready
echo "Waiting for qBittorrent to be ready..."
kubectl wait --for=condition=Ready pod -l app=qbittorrent -n preparr-test --timeout=300s

# Deploy Sonarr configs  
kubectl apply -f k8s/sonarr-config.yaml

# Deploy Sonarr
kubectl apply -f k8s/sonarr.yaml

# Wait for Sonarr to be ready
echo "Waiting for Sonarr to be ready..."
kubectl wait --for=condition=Ready pod -l app=sonarr -n preparr-test --timeout=300s

# Deploy Radarr configs
kubectl apply -f k8s/radarr-config.yaml

# Deploy Radarr
kubectl apply -f k8s/radarr.yaml

# Wait for Radarr to be ready
echo "Waiting for Radarr to be ready..."
kubectl wait --for=condition=Ready pod -l app=radarr -n preparr-test --timeout=300s

# Deploy Prowlarr configs
kubectl apply -f k8s/prowlarr-config.yaml

# Deploy Prowlarr
kubectl apply -f k8s/prowlarr.yaml

# Wait for Prowlarr to be ready
echo "Waiting for Prowlarr to be ready..."
kubectl wait --for=condition=Ready pod -l app=prowlarr -n preparr-test --timeout=300s

echo "Deployment complete!"
echo ""
echo "Services accessible via NodePort (use any cluster node IP):"
echo "Get node IP with: kubectl get nodes -o wide"
echo ""
echo "Service endpoints:"
echo "- qBittorrent: http://<NODE-IP>:30080"
echo "- Sonarr: http://<NODE-IP>:30989"
echo "- Radarr: http://<NODE-IP>:30878"
echo "- Prowlarr: http://<NODE-IP>:30696"
echo ""
echo "Health endpoints:"
echo "- Sonarr Health: http://<NODE-IP>:31001"
echo "- Radarr Health: http://<NODE-IP>:31002"
echo "- Prowlarr Health: http://<NODE-IP>:31003"
echo ""
echo "Default credentials: admin / adminpass"
echo "qBittorrent BitTorrent port: 30881"