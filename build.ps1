# Smart Milk Project - Simple Docker Build Script (PowerShell)

Write-Host "Building Smart Milk Docker images..." -ForegroundColor Green

cd myapp 
npm run build 
cd ..
# Build all services
docker build -t smart-milk/weight-service:latest ./weight-service
docker build -t smart-milk/analysis-service:latest ./analysis-service
docker build -t smart-milk/updates-service:latest ./updates-service
docker build -t smart-milk/users-service:latest ./users-service
docker build -t smart-milk/myapp:latest ./myapp

# TODO add docker tag for each
# TODO add docker push to docker hub repository

Write-Host "All images built successfully!" -ForegroundColor Green
Write-Host "For minikube: minikube image load smart-milk/*:latest" -ForegroundColor Yellow
Write-Host "For Kubernetes: docker push smart-milk/*:latest (after tagging with registry)" -ForegroundColor Yellow

kubectl apply -f SmartMilk-deployment.yaml
kubectl rollout restart deployment/smart-milk-myapp

kubectl port-forward service/smart-milk-mysql-external 3307:3306 

# TODO for deploying using Kubernetes do kubectl apply -f .\SmartMilk-deployment.yaml